import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InventoryMovementType,
  MaintenanceStatus,
  Prisma,
  ReminderStatus,
  type Maintenance,
  type MaintenanceItem,
  type Reminder,
} from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
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

export type MaintenanceWithItems = Maintenance & { items: MaintenanceItem[] };

export interface CreateMaintenanceResult {
  maintenance: MaintenanceWithItems;
  reminder: Reminder | null;
  warnings: MaintenanceWarning[];
}

class InsufficientStockBlockedError extends Error {
  constructor(
    public readonly productId: string,
    public readonly balance: number,
    public readonly requestedQuantity: number,
  ) {
    super('INSUFFICIENT_STOCK_BLOCKED');
  }
}

/**
 * Guardar un mantenimiento es una sola transacción indivisible: crea el
 * mantenimiento, sus productos, sus movimientos de inventario y su
 * recordatorio, o no crea nada (BR-M10, 04-ARCHITECTURE.md §7.1). Todas las
 * validaciones (referencias, coherencia de dueRule, stock) corren antes de
 * la primera escritura, así que un rechazo nunca deja nada a medias.
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

    try {
      const result = await scoped.$transaction(async (tx) => {
        if (stockItems.length) {
          // 04-ARCHITECTURE.md §7.2: bloquea las filas de producto
          // involucradas para que la evaluación de stock y la escritura no
          // se crucen con otra petición simultánea.
          const productIdsToLock = [...new Set(stockItems.map((item) => item.productId))];
          await tx.$queryRaw(
            // Los ids son `text` en Postgres (String de Prisma, sin @db.Uuid);
            // se castea explícito porque el driver infiere `uuid` para
            // strings con forma de UUID y Postgres no compara text = uuid.
            Prisma.sql`SELECT "id" FROM "products" WHERE "businessId" = ${businessId}::text AND "id" = ANY(${productIdsToLock}::text[]) FOR UPDATE`,
          );
        }

        // Stock insuficiente / sin conteo (BR-P8, BR-P11, BR-P12): se evalúa
        // por producto (sumando líneas repetidas), con las filas ya
        // bloqueadas, antes de escribir nada.
        for (const productId of new Set(stockItems.map((item) => item.productId))) {
          const movements = await tx.inventoryMovement.findMany({
            where: { businessId, productId },
          });
          const isCounted = movements.some(
            (movement) => movement.type === InventoryMovementType.COUNT,
          );
          const totalQuantity = stockItems
            .filter((item) => item.productId === productId)
            .reduce((sum, item) => sum + item.quantity, 0);

          if (!isCounted) {
            warnings.push({
              code: 'PRODUCT_NOT_COUNTED',
              message:
                'El producto no tiene conteo inicial: se registra el movimiento, sin evaluar stock.',
              productId,
            });
            continue;
          }

          const balance = movements.reduce(
            (sum, movement) => sum + Number(movement.quantityDelta),
            0,
          );
          const resultingBalance = balance - totalQuantity;
          if (resultingBalance < 0) {
            if (business.insufficientStockPolicy === 'BLOCK') {
              throw new InsufficientStockBlockedError(productId, balance, totalQuantity);
            }
            warnings.push({
              code: 'INSUFFICIENT_STOCK',
              message: 'El producto quedaría con saldo negativo.',
              productId,
              balance,
              requestedQuantity: totalQuantity,
            });
          }
        }

        const maintenance = await tx.maintenance.create({
          data: {
            id: dto.id ?? randomUUID(),
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

          if (product.tracksStock) {
            await tx.inventoryMovement.create({
              data: {
                businessId,
                productId: item.productId,
                type: InventoryMovementType.MAINTENANCE_USE,
                quantityDelta: -item.quantity,
                refType: 'Maintenance',
                refId: maintenance.id,
                occurredAt: performedAt,
              },
            });
          }
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
    } catch (error) {
      if (error instanceof InsufficientStockBlockedError) {
        throw new ProblemException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'INSUFFICIENT_STOCK',
          title: 'Stock insuficiente',
          detail: `El producto ${error.productId} quedaría con saldo negativo.`,
          errors: [
            {
              field: 'items',
              message: `Saldo actual ${error.balance}, cantidad pedida ${error.requestedQuantity}`,
            },
          ],
        });
      }
      throw error;
    }
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

  /** Corrige solo campos que no afectan el stock (BR-M11). */
  /**
   * GAP CONOCIDO: si esta corrección cambia `nextDueKm`/`nextDueDate`/
   * `dueRule`, el `Reminder` ya creado por este mantenimiento (si sigue
   * abierto) no se resincroniza — queda con los datos del momento en que se
   * generó (05-DATABASE.md dice que `Reminder.dueDate/dueKm/dueRule` son
   * "copiados del mantenimiento", pero ni BR-M11 ni 06-API.md especifican
   * qué debe pasar con esa copia ante una corrección posterior). No se
   * implementa a propósito para no inventar una regla no documentada;
   * queda pendiente de una decisión explícita.
   */
  async update(businessId: string, id: string, dto: UpdateMaintenanceDto): Promise<Maintenance> {
    const scoped = forBusiness(this.prisma, businessId);
    const existing = await scoped.maintenance.findFirst({ where: { id } });
    if (!existing) {
      throw this.notFound();
    }

    const nextDueKm = 'nextDueKm' in dto ? dto.nextDueKm : existing.nextDueKm;
    const nextDueDate =
      'nextDueDate' in dto
        ? dto.nextDueDate
          ? new Date(dto.nextDueDate)
          : null
        : existing.nextDueDate;
    // Ojo: NO se hereda `existing.dueRule` cuando el cliente no lo manda.
    // Era válido para la combinación km/fecha anterior; si esta corrección
    // cambia esa combinación, hay que volver a resolverla desde cero
    // (BR-M4, BR-M5), no arrastrar una regla que puede haber dejado de ser
    // coherente.
    const explicitDueRule = 'dueRule' in dto ? (dto.dueRule ?? null) : null;

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const resolution = resolveDueRule({
      nextDueKm,
      nextDueDate,
      dueRule: explicitDueRule,
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

    return scoped.maintenance.update({
      where: { id },
      data: {
        odometerKm: 'odometerKm' in dto ? dto.odometerKm : undefined,
        nextDueKm: 'nextDueKm' in dto ? dto.nextDueKm : undefined,
        nextDueDate: 'nextDueDate' in dto ? nextDueDate : undefined,
        dueRule: resolution.dueRule,
        notes: 'notes' in dto ? dto.notes : undefined,
      },
    });
  }

  /**
   * Anula: movimientos inversos por cada producto y descarta el recordatorio
   * que había creado (BR-M12). También es una sola transacción (§7.1).
   */
  async void(
    businessId: string,
    userId: string,
    id: string,
    dto: VoidMaintenanceDto,
  ): Promise<Maintenance> {
    const scoped = forBusiness(this.prisma, businessId);
    const existing = await scoped.maintenance.findFirst({ where: { id } });
    if (!existing) {
      throw this.notFound();
    }
    if (existing.status === 'VOIDED') {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'MAINTENANCE_ALREADY_VOIDED',
        title: 'El mantenimiento ya estaba anulado',
      });
    }

    return scoped.$transaction(async (tx) => {
      const useMovements = await tx.inventoryMovement.findMany({
        where: {
          businessId,
          refType: 'Maintenance',
          refId: id,
          type: InventoryMovementType.MAINTENANCE_USE,
        },
      });
      for (const movement of useMovements) {
        await tx.inventoryMovement.create({
          data: {
            businessId,
            productId: movement.productId,
            type: InventoryMovementType.MAINTENANCE_VOID,
            quantityDelta: Number(movement.quantityDelta) * -1,
            refType: 'Maintenance',
            refId: id,
            occurredAt: new Date(),
          },
        });
      }

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

      return tx.maintenance.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: userId,
          voidReason: dto.reason,
        },
      });
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
