import { PilotIndicatorsService } from '../src/pilot/pilot-indicators.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma([
    'maintenance',
    'reminder',
    'reminderContact',
    'inventoryMovement',
    'sale',
  ]);
  const service = new PilotIndicatorsService(prisma);
  return {
    service,
    maintenances: stores.get('maintenance')!,
    reminders: stores.get('reminder')!,
    contacts: stores.get('reminderContact')!,
    movements: stores.get('inventoryMovement')!,
    sales: stores.get('sale')!,
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

  describe('BR-I1 desde R7 (DEC-85): ventas de mostrador y lavados por separado', () => {
    function sale(
      id: string,
      source: 'COUNTER' | 'WASH' | 'MAINTENANCE',
      occurredAt: string,
      extra: Record<string, unknown> = {},
    ) {
      return {
        id,
        businessId: 'biz-a',
        source,
        status: 'ACTIVE',
        occurredAt: new Date(occurredAt),
        ...extra,
      };
    }

    it('cuenta cada fuente por separado; el cobro de mantenimiento no suma ni como venta ni como mantenimiento', async () => {
      const { service, sales, maintenances } = setup();
      sales.set('c1', sale('c1', 'COUNTER', '2026-03-10T10:00:00Z'));
      sales.set('c2', sale('c2', 'COUNTER', '2026-03-11T10:00:00Z'));
      sales.set('w1', sale('w1', 'WASH', '2026-03-10T11:00:00Z'));
      maintenances.set('m1', {
        id: 'm1',
        businessId: 'biz-a',
        status: 'ACTIVE',
        performedAt: new Date('2026-03-10T09:00:00Z'),
      });
      sales.set('mc', sale('mc', 'MAINTENANCE', '2026-03-10T12:00:00Z', { maintenanceId: 'm1' }));

      const { adoption } = await service.get('biz-a', {
        from: '2026-03-01T00:00:00Z',
        to: '2026-03-31T23:59:59.999Z',
      });

      expect(adoption).toEqual({ activeMaintenances: 1, counterSales: 2, washes: 1 });
    });

    it('excluye ventas y lavados anulados', async () => {
      const { service, sales } = setup();
      sales.set('c1', sale('c1', 'COUNTER', '2026-03-10T10:00:00Z', { status: 'VOIDED' }));
      sales.set('w1', sale('w1', 'WASH', '2026-03-10T10:00:00Z', { status: 'VOIDED' }));
      sales.set('w2', sale('w2', 'WASH', '2026-03-10T10:00:00Z'));

      const { adoption } = await service.get('biz-a', {});

      expect(adoption).toEqual({ activeMaintenances: 0, counterSales: 0, washes: 1 });
    });

    it('usa los mismos límites que el resto del endpoint: inclusivos y opcionales', async () => {
      const { service, sales } = setup();
      sales.set('edgeFrom', sale('edgeFrom', 'COUNTER', '2026-03-01T05:00:00.000Z'));
      sales.set('edgeTo', sale('edgeTo', 'COUNTER', '2026-03-02T04:59:59.999Z'));
      sales.set('before', sale('before', 'COUNTER', '2026-03-01T04:59:59.999Z'));
      sales.set('after', sale('after', 'COUNTER', '2026-03-02T05:00:00.000Z'));

      const bounded = await service.get('biz-a', {
        from: '2026-03-01T05:00:00.000Z',
        to: '2026-03-02T04:59:59.999Z',
      });
      expect(bounded.adoption.counterSales).toBe(2);

      const onlyFrom = await service.get('biz-a', { from: '2026-03-01T05:00:00.000Z' });
      expect(onlyFrom.adoption.counterSales).toBe(3);
      const unbounded = await service.get('biz-a', {});
      expect(unbounded.adoption.counterSales).toBe(4);
    });

    it('no cruza negocios', async () => {
      const { service, sales } = setup();
      sales.set('mine', sale('mine', 'WASH', '2026-03-10T10:00:00Z'));
      sales.set('theirs', {
        ...sale('theirs', 'WASH', '2026-03-10T10:00:00Z'),
        businessId: 'biz-b',
      });

      const { adoption } = await service.get('biz-a', {});

      expect(adoption.washes).toBe(1);
    });

    it('sin operaciones: ceros, y la adopción solo trae conteos (sin metas ni porcentajes)', async () => {
      const { service } = setup();
      const { adoption } = await service.get('biz-a', {});
      expect(adoption).toEqual({ activeMaintenances: 0, counterSales: 0, washes: 0 });
      expect(Object.keys(adoption).sort()).toEqual([
        'activeMaintenances',
        'counterSales',
        'washes',
      ]);
    });
  });
});
