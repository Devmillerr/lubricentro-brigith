import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InventoryMovementType,
  MaintenanceStatus,
  ReminderStatus,
  type Maintenance,
  type MaintenanceItem,
  type Reminder,
} from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { applyStockMovements } from '../inventory/stock-ledger';
import { forBusiness, type ScopedTransaction } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDueRule } from './due-rules';
import type { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import type { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import type { VoidMaintenanceDto } from './dto/void-maintenance.dto';

export interface MaintenanceWarning {
  code:
    | 'INSUFFICIENT_STOCK'
    | 'PRODUCT_NOT_COUNTED'
    | 'ODOMETER_LOWER_THAN_PREVIOUS'
    | 'NEXT_KM_NOT_ABOVE_CURRENT'
    | 'NEXT_DATE_BEFORE_PERFORMED';
  message: string;
  productId?: string;
  balance?: number;
  requestedQuantity?: number;
}

/**
 * `closeReason` del recordatorio que una corrección dejó sin próximo km ni
 * fecha. Distinto de "descartado" (BR-R9, acción del usuario): solo este se
 * reabre si una corrección posterior vuelve a poner km o fecha.
 */
const CLOSE_REASON_CORRECTED_WITHOUT_DUE = 'mantenimiento corregido sin próximo km ni fecha';

export type MaintenanceWithItems = Maintenance & { items: MaintenanceItem[] };

export interface CreateMaintenanceResult {
  maintenance: MaintenanceWithItems;
  reminder: Reminder | null;
  warnings: MaintenanceWarning[];
}

/**
 * Guardar un mantenimiento es una sola transacción indivisible: crea el
 * mantenimiento, sus productos, sus movimientos de inventario y su
 * recordatorio, o no crea nada (BR-M10, 04-ARCHITECTURE.md §7.1). Las
 * validaciones (referencias, coherencia de dueRule) corren antes de la
 * primera escritura; el stock lo evalúa el StockLedger dentro de la misma
 * transacción, y por DEC-26 solo produce avisos, nunca un rechazo.
 */
@Injectable()
export class MaintenancesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    userId: string,
    dto: CreateMaintenanceDto,
  ): Promise<CreateMaintenanceResult> {
    const scoped = forBusiness(this.prisma, businessId);

    const vehicle = await scoped.vehicle.findFirst({ where: { id: dto.vehicleId } });
    if (!vehicle) {
      throw this.invalidReference('vehicleId', 'El vehículo indicado no existe');
    }

    const maintenanceType = await scoped.maintenanceType.findFirst({
      where: { id: dto.maintenanceTypeId },
    });
    if (!maintenanceType) {
      throw this.invalidReference(
        'maintenanceTypeId',
        'El tipo de mantenimiento indicado no existe',
      );
    }

    const items = dto.items ?? [];
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = productIds.length
      ? await scoped.product.findMany({ where: { id: { in: productIds } } })
      : [];
    const productById = new Map(products.map((product) => [product.id, product]));
    for (const item of items) {
      if (!productById.has(item.productId)) {
        throw this.invalidReference('items', `El producto ${item.productId} no existe`);
      }
    }

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const performedAt = new Date(dto.performedAt);
    const nextDueDate = dto.nextDueDate ? new Date(dto.nextDueDate) : null;

    const resolution = resolveDueRule({
      nextDueKm: dto.nextDueKm ?? null,
      nextDueDate,
      dueRule: dto.dueRule ?? null,
      businessDefaultDueRuleWhenBoth: business.defaultDueRuleWhenBoth,
    });
    if (!resolution.ok) {
      throw resolution.reason === 'AMBIGUOUS_DUE_RULE'
        ? new ProblemException({
            status: HttpStatus.BAD_REQUEST,
            code: 'DUE_RULE_REQUIRED',
            title: 'Falta elegir la regla de vencimiento',
            detail:
              'Con próximo km y próxima fecha a la vez, hay que elegir ANY o ALL (BR-M5); el negocio no tiene un valor por defecto configurado.',
            errors: [{ field: 'dueRule', message: 'Es obligatorio con próximo km y fecha juntos' }],
          })
        : new ProblemException({
            status: HttpStatus.BAD_REQUEST,
            code: 'INCOHERENT_DUE_RULE',
            title: 'La regla de vencimiento no coincide con los datos enviados',
            errors: [{ field: 'dueRule', message: 'KM exige nextDueKm; DATE exige nextDueDate' }],
          });
    }
    const dueRule = resolution.dueRule;

    // Avisos que no bloquean (BR-M7, 06-API.md).
    const warnings: MaintenanceWarning[] = [];
    const lastKnownKm = await this.getLastKnownKm(businessId, dto.vehicleId);
    if (dto.odometerKm != null && lastKnownKm != null && dto.odometerKm < lastKnownKm) {
      warnings.push({
        code: 'ODOMETER_LOWER_THAN_PREVIOUS',
        message: `El km ingresado (${dto.odometerKm}) es menor al último conocido (${lastKnownKm}).`,
      });
    }
    if (dto.nextDueKm != null && dto.odometerKm != null && dto.nextDueKm <= dto.odometerKm) {
      warnings.push({
        code: 'NEXT_KM_NOT_ABOVE_CURRENT',
        message: 'El próximo km no supera al km actual.',
      });
    }
    if (nextDueDate && nextDueDate < performedAt) {
      warnings.push({
        code: 'NEXT_DATE_BEFORE_PERFORMED',
        message: 'La próxima fecha es anterior a la del mantenimiento.',
      });
    }

    const stockItems = items.filter((item) => productById.get(item.productId)!.tracksStock);

    const maintenanceId = dto.id ?? randomUUID();

    const result = await scoped.$transaction(async (tx) => {
      // Stock (BR-P5) primero: el StockLedger bloquea las filas de
      // producto antes de cualquier otra escritura. Si los ítems se
      // insertaran antes, su FK tomaría un lock compartido sobre el
      // producto y dos mantenimientos simultáneos se trabarían al pedir el
      // FOR UPDATE (deadlock, visto en test/integration). DEC-26: el
      // mantenimiento nunca se bloquea por saldo (el producto ya se usó);
      // un saldo negativo o un producto sin conteo (DEC-27) vuelve como
      // aviso.
      const stock = await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        entries: stockItems.map((item) => ({
          productId: item.productId,
          type: InventoryMovementType.MAINTENANCE_USE,
          quantityDelta: -item.quantity,
          refType: 'Maintenance',
          refId: maintenanceId,
          occurredAt: performedAt,
        })),
      });
      warnings.push(...stock.warnings);

      const maintenance = await tx.maintenance.create({
        data: {
          id: maintenanceId,
          businessId,
          vehicleId: dto.vehicleId,
          maintenanceTypeId: dto.maintenanceTypeId,
          performedAt,
          odometerKm: dto.odometerKm,
          nextDueKm: dto.nextDueKm,
          nextDueDate,
          dueRule,
          notes: dto.notes,
          // Explícito en vez de confiar en el default de Postgres, que no
          // todo entorno de prueba simula (mismo motivo que tracksStock
          // en products.service.ts).
          status: MaintenanceStatus.ACTIVE,
        },
      });

      for (const item of items) {
        const product = productById.get(item.productId)!;
        await tx.maintenanceItem.create({
          data: {
            maintenanceId: maintenance.id,
            productId: item.productId,
            productNameSnapshot: product.name,
            productCodeSnapshot: product.code,
            quantity: item.quantity,
          },
        });
      }

      // Recordatorio (BR-R1, BR-R2): el anterior abierto del mismo tipo
      // queda cumplido, haya o no uno nuevo.
      const priorOpen = await tx.reminder.findFirst({
        where: {
          businessId,
          vehicleId: dto.vehicleId,
          maintenanceTypeId: dto.maintenanceTypeId,
          status: { in: [ReminderStatus.PENDING, ReminderStatus.CONTACTED] },
        },
      });
      if (priorOpen) {
        await tx.reminder.update({
          where: { id: priorOpen.id },
          data: {
            status: ReminderStatus.DONE,
            closedByMaintenanceId: maintenance.id,
            closedAt: new Date(),
            closeReason: 'cumplido',
          },
        });
      }

      let reminder: Reminder | null = null;
      if (dueRule) {
        reminder = await tx.reminder.create({
          data: {
            businessId,
            vehicleId: dto.vehicleId,
            maintenanceTypeId: dto.maintenanceTypeId,
            sourceMaintenanceId: maintenance.id,
            dueDate: nextDueDate,
            dueKm: dto.nextDueKm,
            dueRule,
            status: ReminderStatus.PENDING,
          },
        });
      }

      const maintenanceItems = await tx.maintenanceItem.findMany({
        where: { maintenanceId: maintenance.id },
      });

      return { maintenance: { ...maintenance, items: maintenanceItems }, reminder };
    });

    return { ...result, warnings };
  }

  async findOne(businessId: string, id: string): Promise<MaintenanceWithItems> {
    const scoped = forBusiness(this.prisma, businessId);
    const maintenance = await scoped.maintenance.findFirst({ where: { id } });
    if (!maintenance) {
      throw this.notFound();
    }
    const items = await scoped.maintenanceItem.findMany({ where: { maintenanceId: id } });
    return { ...maintenance, items };
  }

  /**
   * Corrige solo campos que no afectan el stock (BR-M11) y, en la misma
   * transacción, sincroniza el recordatorio que originó (ver
   * `syncOwnReminder`).
   *
   * "No enviado" se detecta con `!== undefined`, no con `'campo' in dto`: el
   * `ValidationPipe` (`transform: true`) instancia el DTO y, con target
   * ES2022, la clase declara todos sus campos, así que `in` siempre da true
   * y una corrección de solo `notes` borraba `nextDueDate`/`dueRule`. `null`
   * explícito sí significa "quitar el valor".
   */
  async update(businessId: string, id: string, dto: UpdateMaintenanceDto): Promise<Maintenance> {
    const scoped = forBusiness(this.prisma, businessId);
    const existing = await scoped.maintenance.findFirst({ where: { id } });
    if (!existing) {
      throw this.notFound();
    }
    if (existing.status === MaintenanceStatus.VOIDED) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'MAINTENANCE_VOIDED',
        title: 'Un mantenimiento anulado no se puede corregir',
      });
    }

    const nextDueKm = dto.nextDueKm !== undefined ? dto.nextDueKm : existing.nextDueKm;
    const nextDueDate =
      dto.nextDueDate !== undefined
        ? dto.nextDueDate
          ? new Date(dto.nextDueDate)
          : null
        : existing.nextDueDate;
    // `existing.dueRule` solo se hereda si la combinación km/fecha (qué hay,
    // no sus valores) no cambió: si cambió, la regla anterior puede haber
    // dejado de ser coherente y se vuelve a resolver desde cero (BR-M4,
    // BR-M5).
    const sameCombination =
      (nextDueKm != null) === (existing.nextDueKm != null) &&
      (nextDueDate != null) === (existing.nextDueDate != null);
    const requestedDueRule =
      dto.dueRule !== undefined ? dto.dueRule : sameCombination ? existing.dueRule : null;

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const resolution = resolveDueRule({
      nextDueKm,
      nextDueDate,
      dueRule: requestedDueRule,
      businessDefaultDueRuleWhenBoth: business.defaultDueRuleWhenBoth,
    });
    if (!resolution.ok) {
      throw resolution.reason === 'AMBIGUOUS_DUE_RULE'
        ? new ProblemException({
            status: HttpStatus.BAD_REQUEST,
            code: 'DUE_RULE_REQUIRED',
            title: 'Falta elegir la regla de vencimiento',
            errors: [{ field: 'dueRule', message: 'Es obligatorio con próximo km y fecha juntos' }],
          })
        : new ProblemException({
            status: HttpStatus.BAD_REQUEST,
            code: 'INCOHERENT_DUE_RULE',
            title: 'La regla de vencimiento no coincide con los datos enviados',
            errors: [{ field: 'dueRule', message: 'KM exige nextDueKm; DATE exige nextDueDate' }],
          });
    }

    return scoped.$transaction(async (tx) => {
      const maintenance = await tx.maintenance.update({
        where: { id },
        data: {
          // `undefined` = no se toca; `null` = se quita.
          odometerKm: dto.odometerKm,
          nextDueKm: dto.nextDueKm,
          nextDueDate: dto.nextDueDate !== undefined ? nextDueDate : undefined,
          dueRule: resolution.dueRule,
          notes: dto.notes,
        },
      });
      await this.syncOwnReminder(tx, businessId, maintenance);
      return maintenance;
    });
  }

  /**
   * Mantiene el recordatorio originado por un mantenimiento corregido como
   * copia de sus datos (05-DATABASE.md: `Reminder.dueDate/dueKm/dueRule`
   * "copiados del mantenimiento"), sin romper BR-R2 ni el historial:
   *
   * - Abierto (PENDING/CONTACTED) y sigue habiendo regla: se actualiza en el
   *   lugar (mismo id, mismo estado, mismos contactos).
   * - Abierto y ya no hay próximo km ni fecha (BR-M6: no corresponde
   *   recordatorio): se descarta, sin borrado físico (mismo criterio que la
   *   anulación, BR-M12).
   * - Cerrado como cumplido (DONE, BR-R2), descartado por el usuario (BR-R9)
   *   o por anulación: no se toca ni se reemplaza.
   * - Sin recordatorio abierto y ahora hay regla (BR-R1): se reabre el que
   *   esta misma corrección había descartado, o se crea uno, solo si no hay
   *   otro abierto para el vehículo y tipo (BR-R2) y no hay un mantenimiento
   *   activo posterior del mismo tipo (que ya lo habría dejado cumplido).
   */
  private async syncOwnReminder(
    tx: ScopedTransaction,
    businessId: string,
    maintenance: Maintenance,
  ): Promise<void> {
    const own = await tx.reminder.findMany({
      where: { businessId, sourceMaintenanceId: maintenance.id },
    });
    const openOwn = own.find(
      (reminder) =>
        reminder.status === ReminderStatus.PENDING || reminder.status === ReminderStatus.CONTACTED,
    );
    const dueData = {
      dueDate: maintenance.nextDueDate ?? null,
      dueKm: maintenance.nextDueKm ?? null,
    };

    if (openOwn) {
      await tx.reminder.update({
        where: { id: openOwn.id },
        data: maintenance.dueRule
          ? { ...dueData, dueRule: maintenance.dueRule }
          : {
              status: ReminderStatus.DISMISSED,
              closedAt: new Date(),
              closeReason: CLOSE_REASON_CORRECTED_WITHOUT_DUE,
            },
      });
      return;
    }

    if (!maintenance.dueRule) {
      return;
    }

    const reopenable = own.find(
      (reminder) =>
        reminder.status === ReminderStatus.DISMISSED &&
        reminder.closeReason === CLOSE_REASON_CORRECTED_WITHOUT_DUE,
    );
    if (own.length > 0 && !reopenable) {
      return;
    }

    const otherOpen = await tx.reminder.findFirst({
      where: {
        businessId,
        vehicleId: maintenance.vehicleId,
        maintenanceTypeId: maintenance.maintenanceTypeId,
        status: { in: [ReminderStatus.PENDING, ReminderStatus.CONTACTED] },
      },
    });
    if (otherOpen) {
      return;
    }

    const sameType = await tx.maintenance.findMany({
      where: {
        businessId,
        vehicleId: maintenance.vehicleId,
        maintenanceTypeId: maintenance.maintenanceTypeId,
        status: MaintenanceStatus.ACTIVE,
      },
    });
    const hasLaterMaintenance = sameType.some(
      (other) =>
        other.id !== maintenance.id &&
        other.performedAt.getTime() > maintenance.performedAt.getTime(),
    );
    if (hasLaterMaintenance) {
      return;
    }

    if (reopenable) {
      await tx.reminder.update({
        where: { id: reopenable.id },
        data: {
          ...dueData,
          dueRule: maintenance.dueRule,
          status: ReminderStatus.PENDING,
          closedByMaintenanceId: null,
          closedAt: null,
          closeReason: null,
        },
      });
      return;
    }

    await tx.reminder.create({
      data: {
        businessId,
        vehicleId: maintenance.vehicleId,
        maintenanceTypeId: maintenance.maintenanceTypeId,
        sourceMaintenanceId: maintenance.id,
        ...dueData,
        dueRule: maintenance.dueRule,
        status: ReminderStatus.PENDING,
      },
    });
  }

  /**
   * Anula: movimientos inversos por cada producto y descarta el recordatorio
   * que había creado (BR-M12). También es una sola transacción (§7.1).
   *
   * La transición `ACTIVE → VOIDED` es condicional y va **primero** dentro de
   * la transacción (Corte 0, DEC-77): la escritura bloquea la fila del
   * mantenimiento, así que dos anulaciones simultáneas con claves distintas
   * no generan dos `MAINTENANCE_VOID`: la segunda espera, no cambia ninguna
   * fila y responde 409 antes de tocar el stock. El orden de bloqueo es
   * mantenimiento → productos (StockLedger) → venta (R6, D8).
   */
  async void(
    businessId: string,
    userId: string,
    id: string,
    dto: VoidMaintenanceDto,
  ): Promise<Maintenance> {
    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const { count } = await tx.maintenance.updateMany({
        where: { id, status: MaintenanceStatus.ACTIVE },
        data: {
          status: MaintenanceStatus.VOIDED,
          voidedAt: new Date(),
          voidedById: userId,
          voidReason: dto.reason,
        },
      });
      if (count === 0) {
        const existing = await tx.maintenance.findFirst({ where: { id } });
        if (!existing) {
          throw this.notFound();
        }
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'MAINTENANCE_ALREADY_VOIDED',
          title: 'El mantenimiento ya estaba anulado',
        });
      }

      const useMovements = await tx.inventoryMovement.findMany({
        where: {
          businessId,
          refType: 'Maintenance',
          refId: id,
          type: InventoryMovementType.MAINTENANCE_USE,
        },
      });
      await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        entries: useMovements.map((movement) => ({
          productId: movement.productId,
          type: InventoryMovementType.MAINTENANCE_VOID,
          quantityDelta: Number(movement.quantityDelta) * -1,
          refType: 'Maintenance',
          refId: id,
          occurredAt: new Date(),
        })),
      });

      const ownReminder = await tx.reminder.findFirst({
        where: {
          businessId,
          sourceMaintenanceId: id,
          status: { in: [ReminderStatus.PENDING, ReminderStatus.CONTACTED] },
        },
      });
      if (ownReminder) {
        await tx.reminder.update({
          where: { id: ownReminder.id },
          data: {
            status: ReminderStatus.DISMISSED,
            closedAt: new Date(),
            closeReason: 'mantenimiento anulado',
          },
        });
      }

      const voided = await tx.maintenance.findFirst({ where: { id } });
      return voided!;
    });
  }

  /** Mantenimiento activo más reciente con km, para el "último km conocido". */
  async getLastKnownKm(businessId: string, vehicleId: string): Promise<number | null> {
    const last = await forBusiness(this.prisma, businessId).maintenance.findFirst({
      where: { vehicleId, status: 'ACTIVE', odometerKm: { not: null } },
      orderBy: { performedAt: 'desc' },
    });
    return last?.odometerKm ?? null;
  }

  /** Mantenimiento activo más reciente del vehículo, para su ficha. */
  async getLastMaintenance(businessId: string, vehicleId: string): Promise<Maintenance | null> {
    return forBusiness(this.prisma, businessId).maintenance.findFirst({
      where: { vehicleId, status: 'ACTIVE' },
      orderBy: { performedAt: 'desc' },
    });
  }

  async listByVehicle(businessId: string, vehicleId: string): Promise<MaintenanceWithItems[]> {
    const scoped = forBusiness(this.prisma, businessId);
    const rows = await scoped.maintenance.findMany({
      where: { vehicleId },
      orderBy: { performedAt: 'desc' },
    });
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        items: await scoped.maintenanceItem.findMany({ where: { maintenanceId: row.id } }),
      })),
    );
  }

  private invalidReference(field: string, message: string): ProblemException {
    return new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: 'INVALID_REFERENCE',
      title: 'Referencia inválida',
      errors: [{ field, message }],
    });
  }

  private notFound(): ProblemException {
    return new ProblemException({
      status: HttpStatus.NOT_FOUND,
      code: 'MAINTENANCE_NOT_FOUND',
      title: 'Mantenimiento no encontrado',
    });
  }
}
