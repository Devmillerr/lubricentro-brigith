import { Injectable } from '@nestjs/common';
import { InventoryMovementType, SaleSource, SaleStatus } from '@prisma/client';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { PilotIndicatorsQueryDto } from './dto/pilot-indicators-query.dto';

export interface PilotIndicators {
  from: string | null;
  to: string | null;
  adoption: {
    /** BR-I1: mantenimientos no anulados del negocio real, en el período (por `performedAt`). */
    activeMaintenances: number;
    /** BR-I1 (R7, DEC-85): ventas de mostrador `ACTIVE` en el período (por `occurredAt`). */
    counterSales: number;
    /** BR-I1 (R7, DEC-85): lavados (ventas `WASH` `ACTIVE`) en el período (por `occurredAt`). */
    washes: number;
  };
  maintenance: {
    /** BR-I2: mantenimientos activos del período con próximo km/fecha registrado. */
    maintenancesWithNextDue: number;
    /** BR-I2: avisos abiertos en WhatsApp en el período (BR-R10 mide "enviado" así). */
    remindersOpenedInWhatsApp: number;
  };
  inventory: {
    /** BR-I3: movimientos del período, por tipo. */
    movementsByType: Record<InventoryMovementType, number>;
    totalMovements: number;
    /** BR-I3: productos con al menos un COUNT (alguna vez) y algún movimiento en el período. */
    productsCountedAndMovedInPeriod: number;
  };
}

/**
 * Solo lectura (BR-I1 a BR-I3). El negocio "demo" vive aparte justamente
 * para que estos indicadores solo cuenten operaciones reales (BR-G7).
 * BR-I4 (umbrales de éxito) es una decisión pendiente con Brigith durante
 * el piloto: no hay ningún valor que calcular ni configurar todavía.
 */
@Injectable()
export class PilotIndicatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(businessId: string, query: PilotIndicatorsQueryDto): Promise<PilotIndicators> {
    const scoped = forBusiness(this.prisma, businessId);
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const inPeriod = (date: Date) => (!from || date >= from) && (!to || date <= to);

    // BR-I1 (R7, DEC-85): ventas de mostrador y lavados, por separado. Mismos
    // límites que el resto del endpoint (inclusivos, opcionales). El cobro de
    // un mantenimiento (`source = MAINTENANCE`) no se cuenta: el mantenimiento
    // ya cuenta en `activeMaintenances`. Sin metas ni porcentajes (BR-I4).
    const occurredAt =
      from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
    const [counterSales, washes] = await Promise.all(
      [SaleSource.COUNTER, SaleSource.WASH].map((source) =>
        scoped.sale.count({
          where: { status: SaleStatus.ACTIVE, source, ...(occurredAt ? { occurredAt } : {}) },
        }),
      ),
    );

    const maintenances = await scoped.maintenance.findMany({ where: { status: 'ACTIVE' } });
    const maintenancesInPeriod = maintenances.filter((m) => inPeriod(m.performedAt));
    const maintenancesWithNextDue = maintenancesInPeriod.filter(
      (m) => m.nextDueKm != null || m.nextDueDate != null,
    ).length;

    const reminders = await scoped.reminder.findMany({});
    const reminderIds = reminders.map((r) => r.id);
    const contacts = reminderIds.length
      ? await scoped.reminderContact.findMany({ where: { reminderId: { in: reminderIds } } })
      : [];
    const remindersOpenedInWhatsApp = contacts.filter((c) => inPeriod(c.openedAt)).length;

    const movements = await scoped.inventoryMovement.findMany({});
    const movementsInPeriod = movements.filter((m) => inPeriod(m.occurredAt));
    const movementsByType = Object.fromEntries(
      Object.values(InventoryMovementType).map((type) => [
        type,
        movementsInPeriod.filter((m) => m.type === type).length,
      ]),
    ) as Record<InventoryMovementType, number>;

    const countedProductIds = new Set(
      movements.filter((m) => m.type === InventoryMovementType.COUNT).map((m) => m.productId),
    );
    const productIdsMovedInPeriod = new Set(movementsInPeriod.map((m) => m.productId));
    const productsCountedAndMovedInPeriod = [...productIdsMovedInPeriod].filter((id) =>
      countedProductIds.has(id),
    ).length;

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      adoption: {
        activeMaintenances: maintenancesInPeriod.length,
        counterSales: counterSales ?? 0,
        washes: washes ?? 0,
      },
      maintenance: { maintenancesWithNextDue, remindersOpenedInWhatsApp },
      inventory: {
        movementsByType,
        totalMovements: movementsInPeriod.length,
        productsCountedAndMovedInPeriod,
      },
    };
  }
}
