import { PilotIndicatorsService } from '../src/pilot/pilot-indicators.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma([
    'maintenance',
    'reminder',
    'reminderContact',
    'inventoryMovement',
  ]);
  const service = new PilotIndicatorsService(prisma);
  return {
    service,
    maintenances: stores.get('maintenance')!,
    reminders: stores.get('reminder')!,
    contacts: stores.get('reminderContact')!,
    movements: stores.get('inventoryMovement')!,
  };
}

describe('PilotIndicatorsService', () => {
  it('BR-I1: cuenta mantenimientos ACTIVE en el período, excluye VOIDED', async () => {
    const { service, maintenances } = setup();
    maintenances.set('m1', {
      id: 'm1',
      businessId: 'biz-a',
      status: 'ACTIVE',
      performedAt: new Date('2026-03-10'),
    });
    maintenances.set('m2', {
      id: 'm2',
      businessId: 'biz-a',
      status: 'VOIDED',
      performedAt: new Date('2026-03-10'),
    });
    maintenances.set('m3', {
      id: 'm3',
      businessId: 'biz-a',
      status: 'ACTIVE',
      performedAt: new Date('2026-05-01'),
    });

    const result = await service.get('biz-a', { from: '2026-03-01', to: '2026-03-31' });

    expect(result.adoption.activeMaintenances).toBe(1);
  });

  it('sin from/to: sin límite (todo el historial)', async () => {
    const { service, maintenances } = setup();
    maintenances.set('m1', {
      id: 'm1',
      businessId: 'biz-a',
      status: 'ACTIVE',
      performedAt: new Date('2020-01-01'),
    });
    maintenances.set('m2', {
      id: 'm2',
      businessId: 'biz-a',
      status: 'ACTIVE',
      performedAt: new Date('2026-01-01'),
    });

    const result = await service.get('biz-a', {});

    expect(result.adoption.activeMaintenances).toBe(2);
  });

  it('BR-I2: cuenta mantenimientos con próximo km/fecha, dentro del período', async () => {
    const { service, maintenances } = setup();
    maintenances.set('m1', {
      id: 'm1',
      businessId: 'biz-a',
      status: 'ACTIVE',
      performedAt: new Date('2026-03-10'),
      nextDueKm: 20000,
      nextDueDate: null,
    });
    maintenances.set('m2', {
      id: 'm2',
      businessId: 'biz-a',
      status: 'ACTIVE',
      performedAt: new Date('2026-03-10'),
      nextDueKm: null,
      nextDueDate: null,
    });

    const result = await service.get('biz-a', {});

    expect(result.maintenance.maintenancesWithNextDue).toBe(1);
  });

  it('BR-I2/BR-R10: cuenta avisos abiertos en WhatsApp en el período', async () => {
    const { service, reminders, contacts } = setup();
    reminders.set('rem-1', { id: 'rem-1', businessId: 'biz-a', vehicleId: 'veh-1' });
    contacts.set('c1', {
      id: 'c1',
      reminderId: 'rem-1',
      userId: 'user-a',
      openedAt: new Date('2026-03-15'),
    });
    contacts.set('c2', {
      id: 'c2',
      reminderId: 'rem-1',
      userId: 'user-a',
      openedAt: new Date('2026-06-01'),
    });

    const result = await service.get('biz-a', { from: '2026-03-01', to: '2026-03-31' });

    expect(result.maintenance.remindersOpenedInWhatsApp).toBe(1);
  });

  it('BR-I3: movimientos por tipo y total en el período', async () => {
    const { service, movements } = setup();
    movements.set('mv1', {
      id: 'mv1',
      businessId: 'biz-a',
      productId: 'prod-1',
      type: 'COUNT',
      quantityDelta: 5,
      occurredAt: new Date('2026-03-10'),
    });
    movements.set('mv2', {
      id: 'mv2',
      businessId: 'biz-a',
      productId: 'prod-1',
      type: 'PURCHASE_IN',
      quantityDelta: 3,
      occurredAt: new Date('2026-03-12'),
    });
    movements.set('mv3', {
      id: 'mv3',
      businessId: 'biz-a',
      productId: 'prod-2',
      type: 'PURCHASE_IN',
      quantityDelta: 1,
      occurredAt: new Date('2020-01-01'),
    });

    const result = await service.get('biz-a', { from: '2026-03-01', to: '2026-03-31' });

    expect(result.inventory.totalMovements).toBe(2);
    expect(result.inventory.movementsByType.COUNT).toBe(1);
    expect(result.inventory.movementsByType.PURCHASE_IN).toBe(1);
  });

  it('BR-I3: productos con conteo (alguna vez) y movimiento en el período', async () => {
    const { service, movements } = setup();
    // prod-1: tiene un COUNT (fuera del período) y un movimiento dentro del período -> cuenta.
    movements.set('mv1', {
      id: 'mv1',
      businessId: 'biz-a',
      productId: 'prod-1',
      type: 'COUNT',
      quantityDelta: 5,
      occurredAt: new Date('2020-01-01'),
    });
    movements.set('mv2', {
      id: 'mv2',
      businessId: 'biz-a',
      productId: 'prod-1',
      type: 'PURCHASE_IN',
      quantityDelta: 2,
      occurredAt: new Date('2026-03-12'),
    });
    // prod-2: movimiento en el período pero nunca tuvo un COUNT -> no cuenta.
    movements.set('mv3', {
      id: 'mv3',
      businessId: 'biz-a',
      productId: 'prod-2',
      type: 'PURCHASE_IN',
      quantityDelta: 1,
      occurredAt: new Date('2026-03-15'),
    });

    const result = await service.get('biz-a', { from: '2026-03-01', to: '2026-03-31' });

    expect(result.inventory.productsCountedAndMovedInPeriod).toBe(1);
  });

  it('no cruza negocios', async () => {
    const { service, maintenances } = setup();
    maintenances.set('m1', {
      id: 'm1',
      businessId: 'biz-b',
      status: 'ACTIVE',
      performedAt: new Date('2026-03-10'),
    });

    const result = await service.get('biz-a', {});

    expect(result.adoption.activeMaintenances).toBe(0);
  });
});
