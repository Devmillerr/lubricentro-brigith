import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InventoryMovementType,
  MaintenanceStatus,
  Prisma,
  ReminderStatus,
  SaleLineKind,
  SaleSource,
  SaleStatus,
  type Maintenance,
  type MaintenanceItem,
  type Reminder,
} from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
  type FieldError,
} from '../common/exceptions/problem.exception';
import { applyStockMovements } from '../inventory/stock-ledger';
import { forBusiness, type ScopedTransaction } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import { writeSale, type SaleWithLines } from '../sales/sales.service';
import { resolveDueRule } from './due-rules';
import type { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import type { MaintenanceChargeDto } from './dto/maintenance-charge.dto';
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

/** Mantenimiento con sus productos y su cobro, si lo tiene (R6, B-156). */
export type MaintenanceDetail = MaintenanceWithItems & { sale: SaleWithLines | null };

/** Resultado de la anulación (R6, B-156): el mantenimiento y su cobro, si lo tiene. */
export interface VoidMaintenanceResult {
  maintenance: Maintenance;
  sale: SaleWithLines | null;
}

export interface CreateMaintenanceResult {
  maintenance: MaintenanceWithItems;
  reminder: Reminder | null;
  /** Cobro creado con el bloque `charge` (R6, DEC-72), o `null`. */
  sale: SaleWithLines | null;
  warnings: MaintenanceWarning[];
}

/** Máximo de caracteres del motivo de anulación (igual que en ventas). */
const MAX_VOID_REASON = 500;

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

    if (dto.vehicleId) {
      const vehicle = await scoped.vehicle.findFirst({ where: { id: dto.vehicleId } });
      if (!vehicle) {
        throw this.invalidReference('vehicleId', 'El vehículo indicado no existe');
      }
    } else {
      // Sin vehículo no hay seguimiento por km ni fecha (DEC-73, BR-M16).
      rejectTrackingWithoutVehicle(dto);
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
    const lastKnownKm = dto.vehicleId ? await this.getLastKnownKm(businessId, dto.vehicleId) : null;
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
          vehicleId: dto.vehicleId ?? null,
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
      // queda cumplido, haya o no uno nuevo. Sin vehículo no hay recordatorio
      // ni se cierra ninguno previo (DEC-73).
      let reminder: Reminder | null = null;
      if (dto.vehicleId) {
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
      }

      // Cobro en la misma transacción (R6, DEC-72): una venta MAINTENANCE
      // que no mueve stock (el stock ya lo movió el mantenimiento).
      const sale = dto.charge
        ? await writeMaintenanceSale(tx, {
            businessId,
            userId,
            maintenanceId: maintenance.id,
            vehicleId: maintenance.vehicleId,
            maintenanceTypeName: maintenanceType.name,
            charge: dto.charge,
          })
        : null;

      const maintenanceItems = await tx.maintenanceItem.findMany({
        where: { maintenanceId: maintenance.id },
      });

      return { maintenance: { ...maintenance, items: maintenanceItems }, reminder, sale };
    });

    return { ...result, warnings };
  }

  async findOne(businessId: string, id: string): Promise<MaintenanceDetail> {
    const scoped = forBusiness(this.prisma, businessId);
    const maintenance = await scoped.maintenance.findFirst({ where: { id } });
    if (!maintenance) {
      throw this.notFound();
    }
    const items = await scoped.maintenanceItem.findMany({ where: { maintenanceId: id } });
    const sales = await salesByMaintenance(scoped, [id]);
    return { ...maintenance, items, sale: sales.get(id) ?? null };
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
    if (!existing.vehicleId) {
      // Misma regla que al crear: sin vehículo no hay seguimiento (DEC-73).
      rejectTrackingWithoutVehicle(dto);
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

    // Sin vehículo nunca hay regla (DEC-73): no se crea ni se reabre nada.
    if (!maintenance.dueRule || !maintenance.vehicleId) {
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
  ): Promise<VoidMaintenanceResult> {
    const reason = requireVoidReason(dto.reason);

    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const voidedAt = new Date();
      const { count } = await tx.maintenance.updateMany({
        where: { id, status: MaintenanceStatus.ACTIVE },
        data: {
          status: MaintenanceStatus.VOIDED,
          voidedAt,
          voidedById: userId,
          voidReason: reason,
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

      // Cobro asociado (R6, DEC-71, DEC-77): va después del mantenimiento
      // (orden Maintenance → Sale) y con el mismo motivo. Transición
      // condicional: si ya estaba VOIDED no cambia nada y la anulación sigue
      // (D8). La línea SERVICE no mueve stock, así que no hay SALE_VOID. La
      // relación `maintenanceId` se conserva (DEC-69).
      await tx.sale.updateMany({
        where: { maintenanceId: id, status: SaleStatus.ACTIVE },
        data: { status: SaleStatus.VOIDED, voidedAt, voidedById: userId, voidReason: reason },
      });

      const voided = await tx.maintenance.findFirst({ where: { id } });
      const sales = await salesByMaintenance(tx, [id]);
      return { maintenance: voided!, sale: sales.get(id) ?? null };
    });
  }

  /**
   * Cobro posterior de un mantenimiento (R6, DEC-72): una venta
   * `MAINTENANCE` con una sola línea `SERVICE` por el total, sin stock.
   *
   * En una transacción, bloquea primero la fila del mantenimiento (`FOR
   * UPDATE`, mismo orden Maintenance → Sale que la anulación): así un cobro y
   * una anulación simultáneos se ordenan, y dos cobros simultáneos no crean
   * dos ventas. Después: 404 si no existe o es de otro negocio, 409
   * `MAINTENANCE_VOIDED` si está anulado, 409 `MAINTENANCE_ALREADY_CHARGED` si
   * ya tiene venta (activa o anulada: no se vuelve a cobrar, DEC-69). El
   * único de `Sale.maintenanceId` respalda esto último en la base.
   */
  async charge(
    businessId: string,
    userId: string,
    id: string,
    dto: MaintenanceChargeDto,
  ): Promise<SaleWithLines> {
    try {
      return await forBusiness(this.prisma, businessId).$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "maintenances" WHERE "businessId" = ${businessId}::text AND "id" = ${id}::text FOR UPDATE`,
        );
        const maintenance = await tx.maintenance.findFirst({ where: { id } });
        if (!maintenance) {
          throw this.notFound();
        }
        if (maintenance.status === MaintenanceStatus.VOIDED) {
          throw new ProblemException({
            status: HttpStatus.CONFLICT,
            code: 'MAINTENANCE_VOIDED',
            title: 'Un mantenimiento anulado no se puede cobrar',
          });
        }
        const existingSale = await tx.sale.findFirst({ where: { maintenanceId: id } });
        if (existingSale) {
          throw alreadyCharged();
        }
        const maintenanceType = await tx.maintenanceType.findFirst({
          where: { id: maintenance.maintenanceTypeId },
        });

        return writeMaintenanceSale(tx, {
          businessId,
          userId,
          maintenanceId: id,
          vehicleId: maintenance.vehicleId,
          maintenanceTypeName: maintenanceType!.name,
          charge: dto,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw alreadyCharged();
      }
      throw error;
    }
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

  async listByVehicle(businessId: string, vehicleId: string): Promise<MaintenanceDetail[]> {
    const scoped = forBusiness(this.prisma, businessId);
    const rows = await scoped.maintenance.findMany({
      where: { vehicleId },
      orderBy: { performedAt: 'desc' },
    });
    const sales = await salesByMaintenance(
      scoped,
      rows.map((row) => row.id),
    );
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        items: await scoped.maintenanceItem.findMany({ where: { maintenanceId: row.id } }),
        sale: sales.get(row.id) ?? null,
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

/** Campos de seguimiento por km o fecha, que un mantenimiento sin vehículo no admite. */
const TRACKING_FIELDS = ['odometerKm', 'nextDueKm', 'nextDueDate', 'dueRule'] as const;

/**
 * Sin vehículo no hay seguimiento por km ni fecha (DEC-73, BR-M16): enviar
 * cualquiera de esos campos, al crear o al corregir, es un 400
 * `VALIDATION_ERROR` con un error por campo. No se ignoran ni se guardan. Un
 * campo omitido (`undefined`) no cuenta; un `null` explícito sí.
 */
function rejectTrackingWithoutVehicle(
  dto: Partial<Record<(typeof TRACKING_FIELDS)[number], unknown>>,
): void {
  const errors: FieldError[] = TRACKING_FIELDS.filter((field) => dto[field] !== undefined).map(
    (field) => ({ field, message: 'Un mantenimiento sin vehículo no admite este campo.' }),
  );
  if (errors.length > 0) {
    throw new ValidationProblemException(errors);
  }
}

/**
 * Escribe el cobro de un mantenimiento (R6): `Sale` `source = MAINTENANCE`
 * con una sola línea `SERVICE` por el total (BR-V3, DEC-72). `occurredAt` es
 * la hora del servidor (DEC-75), `customerId` queda nulo (DEC-74) y
 * `vehicleId` es el del mantenimiento (puede ser nulo, DEC-73). La línea no
 * mueve stock: no pasa por el StockLedger.
 */
async function writeMaintenanceSale(
  tx: ScopedTransaction,
  params: {
    businessId: string;
    userId: string;
    maintenanceId: string;
    vehicleId: string | null;
    maintenanceTypeName: string;
    charge: MaintenanceChargeDto;
  },
): Promise<SaleWithLines> {
  const amount = new Prisma.Decimal(String(params.charge.totalAmount));
  return writeSale(tx, {
    businessId: params.businessId,
    userId: params.userId,
    saleId: randomUUID(),
    source: SaleSource.MAINTENANCE,
    paymentMethod: params.charge.paymentMethod,
    occurredAt: new Date(),
    maintenanceId: params.maintenanceId,
    vehicleId: params.vehicleId,
    lines: [
      {
        kind: SaleLineKind.SERVICE,
        productId: null,
        washTypeId: null,
        descriptionSnapshot: params.maintenanceTypeName,
        codeSnapshot: null,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount,
        movesStock: false,
      },
    ],
  });
}

function alreadyCharged(): ProblemException {
  return new ProblemException({
    status: HttpStatus.CONFLICT,
    code: 'MAINTENANCE_ALREADY_CHARGED',
    title: 'El mantenimiento ya tiene un cobro',
  });
}

/**
 * Motivo obligatorio al anular un mantenimiento (DEC-71): sin texto → 400
 * `VALIDATION_ERROR`; hasta 500 caracteres. El DTO ya lo exige por HTTP; esto
 * cubre a quien llame al servicio directamente.
 */
function requireVoidReason(reason: string | undefined): string {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length === 0) {
    throw new ValidationProblemException([
      { field: 'reason', message: 'Escribe el motivo de la anulación.' },
    ]);
  }
  if (trimmed.length > MAX_VOID_REASON) {
    throw new ValidationProblemException([
      { field: 'reason', message: `El motivo admite hasta ${MAX_VOID_REASON} caracteres.` },
    ]);
  }
  return trimmed;
}

/**
 * Cobros de varios mantenimientos, con sus líneas, en dos consultas (sin
 * N+1). Un mantenimiento tiene como máximo una venta en toda su vida
 * (DEC-69), activa o anulada.
 */
async function salesByMaintenance(
  client: ScopedTransaction,
  maintenanceIds: string[],
): Promise<Map<string, SaleWithLines>> {
  if (maintenanceIds.length === 0) return new Map();
  const sales = await client.sale.findMany({ where: { maintenanceId: { in: maintenanceIds } } });
  if (sales.length === 0) return new Map();
  const lines = await client.saleLine.findMany({
    where: { saleId: { in: sales.map((sale) => sale.id) } },
    orderBy: [{ productId: 'asc' }],
  });
  return new Map(
    sales.map((sale) => [
      sale.maintenanceId!,
      { ...sale, lines: lines.filter((line) => line.saleId === sale.id) },
    ]),
  );
}
