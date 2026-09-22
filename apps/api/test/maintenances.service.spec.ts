import { MaintenancesService } from '../src/maintenances/maintenances.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores, businesses } = buildFakeScopedPrisma([
    'vehicle',
    'maintenanceType',
    'product',
    'maintenance',
    'maintenanceItem',
    'inventoryMovement',
    'reminder',
  ]);
  const service = new MaintenancesService(prisma);

  businesses.set('biz-a', {
    id: 'biz-a',
    defaultDueRuleWhenBoth: null,
    insufficientStockPolicy: 'ALLOW_WITH_WARNING',
  });
  businesses.set('biz-b', {
    id: 'biz-b',
    defaultDueRuleWhenBoth: null,
    insufficientStockPolicy: 'ALLOW_WITH_WARNING',
  });

  const vehicles = stores.get('vehicle')!;
  const maintenanceTypes = stores.get('maintenanceType')!;
  const products = stores.get('product')!;
  vehicles.set('veh-1', { id: 'veh-1', businessId: 'biz-a', plate: 'ABC-123' });
  maintenanceTypes.set('type-1', { id: 'type-1', businessId: 'biz-a', name: 'Cambio de aceite' });
  products.set('prod-tracked', {
    id: 'prod-tracked',
    businessId: 'biz-a',
    name: 'Aceite 20W-50',
    code: 'AC-01',
    unit: 'litro',
    tracksStock: true,
  });
  products.set('prod-no-stock', {
    id: 'prod-no-stock',
    businessId: 'biz-a',
    name: 'Servicio de mano de obra',
    unit: 'servicio',
    tracksStock: false,
  });

  return {
    service,
    businesses,
    vehicles,
    maintenanceTypes,
    products,
    movements: stores.get('inventoryMovement')!,
    reminders: stores.get('reminder')!,
    maintenances: stores.get('maintenance')!,
    items: stores.get('maintenanceItem')!,
  };
}

const base = {
  vehicleId: 'veh-1',
  maintenanceTypeId: 'type-1',
  performedAt: '2026-01-15T10:00:00.000Z',
};

describe('MaintenancesService.create', () => {
  it('rechaza un vehicleId que no existe', async () => {
    const { service } = setup();
    await expect(
      service.create('biz-a', 'user-a', { ...base, vehicleId: 'no-existe' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('rechaza un maintenanceTypeId que no existe', async () => {
    const { service } = setup();
    await expect(
      service.create('biz-a', 'user-a', { ...base, maintenanceTypeId: 'no-existe' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('rechaza un producto de un item que no existe', async () => {
    const { service } = setup();
    await expect(
      service.create('biz-a', 'user-a', {
        ...base,
        items: [{ productId: 'no-existe', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('un vehículo de otro negocio se rechaza como si no existiera (aislamiento)', async () => {
    const { service } = setup();
    await expect(service.create('biz-b', 'user-a', { ...base })).rejects.toMatchObject({
      code: 'INVALID_REFERENCE',
    });
  });

  it('0 productos es válido (BR-M8) y sin próximo km/fecha no genera recordatorio (BR-M6)', async () => {
    const { service } = setup();

    const result = await service.create('biz-a', 'user-a', { ...base });

    expect(result.maintenance.items).toHaveLength(0);
    expect(result.maintenance.dueRule).toBeNull();
    expect(result.reminder).toBeNull();
    expect(result.warnings).toHaveLength(0);
  });

  it('solo nextDueKm: infiere KM y crea un recordatorio con dueKm (BR-M4, BR-R1)', async () => {
    const { service } = setup();

    const result = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });

    expect(result.maintenance.dueRule).toBe('KM');
    expect(result.reminder?.dueKm).toBe(15000);
    expect(result.reminder?.dueDate).toBeNull();
    expect(result.reminder?.status).toBe('PENDING');
  });

  it('ambos sin dueRule y sin default del negocio: 400 DUE_RULE_REQUIRED (BR-M5)', async () => {
    const { service } = setup();

    await expect(
      service.create('biz-a', 'user-a', {
        ...base,
        nextDueKm: 15000,
        nextDueDate: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'DUE_RULE_REQUIRED' });
  });

  it('ambos con dueRule=ALL: coherente', async () => {
    const { service } = setup();

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      nextDueKm: 15000,
      nextDueDate: '2026-06-01T00:00:00.000Z',
      dueRule: 'ALL',
    });

    expect(result.maintenance.dueRule).toBe('ALL');
    expect(result.reminder?.dueRule).toBe('ALL');
  });

  it('producto con control de stock sin conteo inicial: aviso PRODUCT_NOT_COUNTED, igual registra el movimiento (BR-P8)', async () => {
    const { service, movements } = setup();

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 2 }],
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'PRODUCT_NOT_COUNTED', productId: 'prod-tracked' }),
    );
    const created = [...movements.values()].find((m) => m.refId === result.maintenance.id);
    expect(created?.type).toBe('MAINTENANCE_USE');
    expect(Number(created?.quantityDelta)).toBe(-2);
  });

  it('producto sin control de stock: no genera movimiento (BR-P5 solo aplica con control de stock)', async () => {
    const { service, movements } = setup();

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-no-stock', quantity: 5 }],
    });

    expect(result.maintenance.items).toHaveLength(1);
    expect([...movements.values()].some((m) => m.refId === result.maintenance.id)).toBe(false);
  });

  it('stock suficiente y contado: descuenta sin avisos (BR-P5)', async () => {
    const { service, movements } = setup();
    movements.set('mv-count', {
      id: 'mv-count',
      businessId: 'biz-a',
      productId: 'prod-tracked',
      type: 'COUNT',
      quantityDelta: 10,
      occurredAt: new Date('2026-01-01'),
    });

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 3 }],
    });

    expect(result.warnings).toHaveLength(0);
    const created = [...movements.values()].find((m) => m.refId === result.maintenance.id);
    expect(Number(created?.quantityDelta)).toBe(-3);
  });

  it('stock insuficiente con ALLOW_WITH_WARNING: guarda y avisa (BR-P11, BR-P12)', async () => {
    const { service, movements } = setup();
    movements.set('mv-count', {
      id: 'mv-count',
      businessId: 'biz-a',
      productId: 'prod-tracked',
      type: 'COUNT',
      quantityDelta: 2,
      occurredAt: new Date('2026-01-01'),
    });

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 5 }],
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        productId: 'prod-tracked',
        balance: 2,
      }),
    );
    // Con ALLOW_WITH_WARNING igual se guarda (06-API.md).
    expect(result.maintenance.items).toHaveLength(1);
  });

  it('stock insuficiente con BLOCK: 422 y no guarda nada (06-API.md, BR-M10)', async () => {
    const { service, movements, maintenances, items, businesses } = setup();
    movements.set('mv-count', {
      id: 'mv-count',
      businessId: 'biz-a',
      productId: 'prod-tracked',
      type: 'COUNT',
      quantityDelta: 2,
      occurredAt: new Date('2026-01-01'),
    });
    businesses.set('biz-a', {
      id: 'biz-a',
      defaultDueRuleWhenBoth: null,
      insufficientStockPolicy: 'BLOCK',
    });

    await expect(
      service.create('biz-a', 'user-a', {
        ...base,
        items: [{ productId: 'prod-tracked', quantity: 5 }],
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(maintenances.size).toBe(0);
    expect(items.size).toBe(0);
    expect([...movements.values()].filter((m) => m.type === 'MAINTENANCE_USE')).toHaveLength(0);
  });

  it('avisa si el km es menor al último conocido, sin bloquear (BR-M7)', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { ...base, odometerKm: 20000 });

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      performedAt: '2026-02-01T00:00:00.000Z',
      odometerKm: 15000,
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'ODOMETER_LOWER_THAN_PREVIOUS' }),
    );
  });

  it('avisa si el próximo km no supera al km actual (BR-M7)', async () => {
    const { service } = setup();

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      odometerKm: 15000,
      nextDueKm: 15000,
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'NEXT_KM_NOT_ABOVE_CURRENT' }),
    );
  });

  it('avisa si la próxima fecha es anterior a la del mantenimiento (BR-M7)', async () => {
    const { service } = setup();

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      nextDueDate: '2020-01-01T00:00:00.000Z',
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'NEXT_DATE_BEFORE_PERFORMED' }),
    );
  });

  it('un mantenimiento nuevo del mismo tipo cierra el recordatorio anterior como cumplido (BR-R2)', async () => {
    const { service, reminders } = setup();
    const first = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });
    const openReminderId = first.reminder!.id;

    const second = await service.create('biz-a', 'user-a', {
      ...base,
      performedAt: '2026-03-01T00:00:00.000Z',
    });

    const closed = reminders.get(openReminderId);
    expect(closed?.status).toBe('DONE');
    expect(closed?.closedByMaintenanceId).toBe(second.maintenance.id);
  });
});

describe('MaintenancesService.void', () => {
  it('genera movimientos inversos por cada producto usado (BR-P9, BR-M12)', async () => {
    const { service, movements } = setup();
    movements.set('mv-count', {
      id: 'mv-count',
      businessId: 'biz-a',
      productId: 'prod-tracked',
      type: 'COUNT',
      quantityDelta: 10,
      occurredAt: new Date('2026-01-01'),
    });
    const created = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 3 }],
    });

    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Prueba' });

    const voidMovement = [...movements.values()].find((m) => m.type === 'MAINTENANCE_VOID');
    expect(Number(voidMovement?.quantityDelta)).toBe(3);
  });

  it('descarta el recordatorio que había creado (BR-M12)', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });
    const reminderId = created.reminder!.id;

    await service.void('biz-a', 'user-a', created.maintenance.id, {});

    expect(reminders.get(reminderId)?.status).toBe('DISMISSED');
  });

  it('marca el mantenimiento como VOIDED con quién y por qué', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    const voided = await service.void('biz-a', 'user-a', created.maintenance.id, {
      reason: 'Se equivocaron de producto',
    });

    expect(voided.status).toBe('VOIDED');
    expect(voided.voidedById).toBe('user-a');
    expect(voided.voidReason).toBe('Se equivocaron de producto');
  });

  it('rechaza anular dos veces con MAINTENANCE_ALREADY_VOIDED', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });
    await service.void('biz-a', 'user-a', created.maintenance.id, {});

    await expect(service.void('biz-a', 'user-a', created.maintenance.id, {})).rejects.toMatchObject(
      { code: 'MAINTENANCE_ALREADY_VOIDED' },
    );
  });

  it('un mantenimiento anulado no cuenta para el último km conocido (BR-M12)', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, odometerKm: 20000 });

    await service.void('biz-a', 'user-a', created.maintenance.id, {});

    expect(await service.getLastKnownKm('biz-a', 'veh-1')).toBeNull();
  });
});

describe('MaintenancesService.update', () => {
  it('corrige notas y km sin tocar productos (BR-M11)', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    const updated = await service.update('biz-a', created.maintenance.id, {
      notes: 'Corrección',
      odometerKm: 12345,
    });

    expect(updated.notes).toBe('Corrección');
    expect(updated.odometerKm).toBe(12345);
  });

  it('rechaza dejar ambos sin dueRule ambiguo al corregir', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });

    await expect(
      service.update('biz-a', created.maintenance.id, {
        nextDueDate: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'DUE_RULE_REQUIRED' });
  });
});

describe('MaintenancesService.findOne / listByVehicle', () => {
  it('findOne rechaza con MAINTENANCE_NOT_FOUND para uno de otro negocio', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    await expect(service.findOne('biz-b', created.maintenance.id)).rejects.toMatchObject({
      code: 'MAINTENANCE_NOT_FOUND',
    });
  });

  it('listByVehicle ordena del más reciente al más antiguo', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { ...base, performedAt: '2026-01-01T00:00:00.000Z' });
    await service.create('biz-a', 'user-a', { ...base, performedAt: '2026-03-01T00:00:00.000Z' });

    const list = await service.listByVehicle('biz-a', 'veh-1');

    expect(list).toHaveLength(2);
    expect(new Date(list[0]!.performedAt).getTime()).toBeGreaterThan(
      new Date(list[1]!.performedAt).getTime(),
    );
  });
});
