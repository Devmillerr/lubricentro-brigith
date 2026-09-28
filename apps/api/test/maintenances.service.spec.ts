import { plainToInstance } from 'class-transformer';
import { UpdateMaintenanceDto } from '../src/maintenances/dto/update-maintenance.dto';
import { MaintenancesService } from '../src/maintenances/maintenances.service';
import { buildFakeScopedPrisma, type Store } from './support/fake-scoped-prisma';

/**
 * Deja `prod-tracked` con un conteo inicial: el movimiento COUNT y el saldo
 * en caché que el StockLedger mantendría (R1).
 */
function seedCount(movements: Store, products: Store, quantity: number) {
  movements.set('mv-count', {
    id: 'mv-count',
    businessId: 'biz-a',
    productId: 'prod-tracked',
    type: 'COUNT',
    quantityDelta: quantity,
    occurredAt: new Date('2026-01-01'),
  });
  Object.assign(products.get('prod-tracked')!, { stockQuantity: quantity, isCounted: true });
}

function setup() {
  const { prisma, stores, businesses } = buildFakeScopedPrisma([
    'vehicle',
    'maintenanceType',
    'product',
    'maintenance',
    'maintenanceItem',
    'inventoryMovement',
    'reminder',
    'sale',
    'saleLine',
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
    sales: stores.get('sale')!,
    saleLines: stores.get('saleLine')!,
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
    const { service, movements, products } = setup();
    seedCount(movements, products, 10);

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 3 }],
    });

    expect(result.warnings).toHaveLength(0);
    const created = [...movements.values()].find((m) => m.refId === result.maintenance.id);
    expect(Number(created?.quantityDelta)).toBe(-3);
  });

  it('stock insuficiente con ALLOW_WITH_WARNING: guarda y avisa (BR-P11, BR-P12)', async () => {
    const { service, movements, products } = setup();
    seedCount(movements, products, 2);

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

  it('stock insuficiente con BLOCK configurado: igual guarda y avisa, y el saldo queda negativo (DEC-26)', async () => {
    const { service, movements, products, businesses } = setup();
    seedCount(movements, products, 2);
    businesses.set('biz-a', {
      id: 'biz-a',
      defaultDueRuleWhenBoth: null,
      insufficientStockPolicy: 'BLOCK',
    });

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 5 }],
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'INSUFFICIENT_STOCK', balance: 2, requestedQuantity: 5 }),
    );
    expect(Number(products.get('prod-tracked')!.stockQuantity)).toBe(-3);
    const created = [...movements.values()].find((m) => m.refId === result.maintenance.id);
    expect(created?.createdById).toBe('user-a');
    expect(Number(created?.resultingBalance)).toBe(-3);
  });

  it('anular devuelve el saldo en caché al valor previo (BR-P9)', async () => {
    const { service, movements, products } = setup();
    seedCount(movements, products, 10);
    const created = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 3 }],
    });
    expect(Number(products.get('prod-tracked')!.stockQuantity)).toBe(7);

    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Prueba' });

    expect(Number(products.get('prod-tracked')!.stockQuantity)).toBe(10);
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
    const { service, movements, products } = setup();
    seedCount(movements, products, 10);
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

    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Prueba' });

    expect(reminders.get(reminderId)?.status).toBe('DISMISSED');
  });

  it('marca el mantenimiento como VOIDED con quién y por qué', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    const voided = await service.void('biz-a', 'user-a', created.maintenance.id, {
      reason: 'Se equivocaron de producto',
    });

    expect(voided.maintenance.status).toBe('VOIDED');
    expect(voided.maintenance.voidedById).toBe('user-a');
    expect(voided.maintenance.voidReason).toBe('Se equivocaron de producto');
    expect(voided.sale).toBeNull();
  });

  it('rechaza anular dos veces con MAINTENANCE_ALREADY_VOIDED', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });
    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Prueba' });

    await expect(
      service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Prueba' }),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_ALREADY_VOIDED' });
  });

  it('la segunda anulación no genera otro MAINTENANCE_VOID ni cambia quién lo anuló (DEC-77)', async () => {
    const { service, movements, products } = setup();
    seedCount(movements, products, 10);
    const created = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 3 }],
    });
    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Primera' });

    await expect(
      service.void('biz-a', 'user-b', created.maintenance.id, { reason: 'Segunda' }),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_ALREADY_VOIDED' });

    const voids = [...movements.values()].filter((m) => m.type === 'MAINTENANCE_VOID');
    expect(voids).toHaveLength(1);
    const maintenance = await service.findOne('biz-a', created.maintenance.id);
    expect(maintenance.voidedById).toBe('user-a');
    expect(maintenance.voidReason).toBe('Primera');
  });

  it('un mantenimiento inexistente o de otro negocio responde MAINTENANCE_NOT_FOUND', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    await expect(
      service.void('biz-a', 'user-a', 'no-existe', { reason: 'Prueba' }),
    ).rejects.toMatchObject({
      code: 'MAINTENANCE_NOT_FOUND',
    });
    await expect(
      service.void('biz-b', 'user-b', created.maintenance.id, { reason: 'Prueba' }),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_NOT_FOUND' });
  });

  it('un mantenimiento anulado no cuenta para el último km conocido (BR-M12)', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, odometerKm: 20000 });

    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Prueba' });

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

  it('corregir solo notas con el DTO tal como lo instancia el ValidationPipe no borra fecha ni regla', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', {
      ...base,
      nextDueKm: 15000,
      nextDueDate: '2026-07-15T00:00:00.000Z',
      dueRule: 'ANY',
    });
    // `transform: true` crea la instancia con todas las claves declaradas
    // (en undefined): el caso que antes rompía `'campo' in dto`.
    const dto = plainToInstance(UpdateMaintenanceDto, { notes: 'Solo notas' });

    const updated = await service.update('biz-a', created.maintenance.id, dto);

    expect(updated.notes).toBe('Solo notas');
    expect(updated.nextDueKm).toBe(15000);
    expect(updated.nextDueDate).toEqual(new Date('2026-07-15T00:00:00.000Z'));
    expect(updated.dueRule).toBe('ANY');
    expect(reminders.get(created.reminder!.id)).toMatchObject({
      status: 'PENDING',
      dueRule: 'ANY',
    });
  });

  it('rechaza corregir un mantenimiento anulado con MAINTENANCE_VOIDED y no toca su recordatorio', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });
    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Prueba' });

    await expect(
      service.update('biz-a', created.maintenance.id, { nextDueKm: 20000, notes: 'x' }),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_VOIDED' });

    expect(reminders.get(created.reminder!.id)).toMatchObject({
      status: 'DISMISSED',
      dueKm: 15000,
    });
  });
});

describe('MaintenancesService.update — sincroniza el recordatorio', () => {
  function remindersOf(reminders: Map<string, Record<string, unknown>>, maintenanceId: string) {
    return [...reminders.values()].filter((r) => r.sourceMaintenanceId === maintenanceId);
  }

  it('cambiar nextDueDate actualiza el mismo recordatorio (mismo id y estado)', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', {
      ...base,
      nextDueDate: '2026-06-01T00:00:00.000Z',
    });
    const reminderId = created.reminder!.id;
    reminders.get(reminderId)!.status = 'CONTACTED';

    await service.update('biz-a', created.maintenance.id, {
      nextDueDate: '2026-08-01T00:00:00.000Z',
    });

    expect(remindersOf(reminders, created.maintenance.id)).toHaveLength(1);
    expect(reminders.get(reminderId)).toMatchObject({
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      dueKm: null,
      dueRule: 'DATE',
      status: 'CONTACTED',
    });
  });

  it('cambiar nextDueKm actualiza el dueKm del recordatorio', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });

    await service.update('biz-a', created.maintenance.id, { nextDueKm: 18000 });

    expect(reminders.get(created.reminder!.id)).toMatchObject({
      dueKm: 18000,
      dueRule: 'KM',
      status: 'PENDING',
    });
  });

  it('cambiar la regla (ANY → ALL) actualiza el dueRule del recordatorio', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', {
      ...base,
      nextDueKm: 15000,
      nextDueDate: '2026-06-01T00:00:00.000Z',
      dueRule: 'ANY',
    });

    const updated = await service.update('biz-a', created.maintenance.id, { dueRule: 'ALL' });

    expect(updated.dueRule).toBe('ALL');
    expect(reminders.get(created.reminder!.id)).toMatchObject({ dueRule: 'ALL', dueKm: 15000 });
  });

  it('agregar fecha a uno solo por km recalcula la regla y la copia (KM → ALL)', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });

    await service.update('biz-a', created.maintenance.id, {
      nextDueDate: '2026-06-01T00:00:00.000Z',
      dueRule: 'ALL',
    });

    expect(reminders.get(created.reminder!.id)).toMatchObject({
      dueKm: 15000,
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
      dueRule: 'ALL',
    });
  });

  it('quitar próximo km y fecha descarta el recordatorio abierto, sin borrarlo (BR-M6)', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', {
      ...base,
      nextDueKm: 15000,
      nextDueDate: '2026-06-01T00:00:00.000Z',
      dueRule: 'ANY',
    });

    const updated = await service.update('biz-a', created.maintenance.id, {
      nextDueKm: null,
      nextDueDate: null,
    });

    expect(updated.dueRule).toBeNull();
    expect(reminders.get(created.reminder!.id)).toMatchObject({
      status: 'DISMISSED',
      closeReason: 'mantenimiento corregido sin próximo km ni fecha',
    });
  });

  it('volver a poner km tras quitarlo reabre el mismo recordatorio, no crea otro', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });
    await service.update('biz-a', created.maintenance.id, { nextDueKm: null });

    await service.update('biz-a', created.maintenance.id, { nextDueKm: 16000 });

    expect(remindersOf(reminders, created.maintenance.id)).toHaveLength(1);
    expect(reminders.get(created.reminder!.id)).toMatchObject({
      status: 'PENDING',
      dueKm: 16000,
      closedAt: null,
      closeReason: null,
    });
  });

  it('agregar km a un mantenimiento que no tenía recordatorio crea uno solo (BR-R1)', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    await service.update('biz-a', created.maintenance.id, { nextDueKm: 15000 });
    await service.update('biz-a', created.maintenance.id, { nextDueKm: 16000 });

    const own = remindersOf(reminders, created.maintenance.id);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      status: 'PENDING',
      dueKm: 16000,
      dueRule: 'KM',
      businessId: 'biz-a',
    });
  });

  it('no duplica: si ya hay otro recordatorio abierto del mismo vehículo y tipo, no crea uno (BR-R2)', async () => {
    const { service, reminders } = setup();
    const older = await service.create('biz-a', 'user-a', {
      ...base,
      performedAt: '2025-06-01T00:00:00.000Z',
    });
    const newer = await service.create('biz-a', 'user-a', {
      ...base,
      performedAt: '2026-01-15T00:00:00.000Z',
      nextDueKm: 20000,
    });

    await service.update('biz-a', older.maintenance.id, { nextDueKm: 10000 });

    const open = [...reminders.values()].filter(
      (r) => r.status === 'PENDING' || r.status === 'CONTACTED',
    );
    expect(open).toHaveLength(1);
    expect(open[0]?.id).toBe(newer.reminder!.id);
    expect(remindersOf(reminders, older.maintenance.id)).toHaveLength(0);
  });

  it('no crea recordatorio para un mantenimiento con otro posterior del mismo tipo', async () => {
    const { service, reminders } = setup();
    const older = await service.create('biz-a', 'user-a', {
      ...base,
      performedAt: '2025-06-01T00:00:00.000Z',
    });
    await service.create('biz-a', 'user-a', { ...base, performedAt: '2026-01-15T00:00:00.000Z' });

    await service.update('biz-a', older.maintenance.id, { nextDueKm: 10000 });

    expect(reminders.size).toBe(0);
  });

  it('un recordatorio ya cumplido (DONE) no se modifica ni se reemplaza', async () => {
    const { service, reminders } = setup();
    const first = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });
    await service.create('biz-a', 'user-a', { ...base, performedAt: '2026-03-01T00:00:00.000Z' });

    await service.update('biz-a', first.maintenance.id, { nextDueKm: 17000 });

    expect(reminders.get(first.reminder!.id)).toMatchObject({ status: 'DONE', dueKm: 15000 });
    expect(reminders.size).toBe(1);
  });

  it('un recordatorio descartado por el usuario (BR-R9) no se reabre al corregir', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });
    Object.assign(reminders.get(created.reminder!.id)!, {
      status: 'DISMISSED',
      closeReason: 'descartado',
    });

    await service.update('biz-a', created.maintenance.id, { nextDueKm: 17000 });

    expect(reminders.get(created.reminder!.id)).toMatchObject({
      status: 'DISMISSED',
      dueKm: 15000,
    });
    expect(reminders.size).toBe(1);
  });

  it('aislamiento: corregir desde otro negocio es MAINTENANCE_NOT_FOUND y no toca el recordatorio', async () => {
    const { service, reminders } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });

    await expect(
      service.update('biz-b', created.maintenance.id, { nextDueKm: 99999 }),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_NOT_FOUND' });

    expect(reminders.get(created.reminder!.id)).toMatchObject({ dueKm: 15000 });
  });
});

describe('MaintenancesService — mantenimiento sin vehículo (R6, DEC-73)', () => {
  const withoutVehicle = { maintenanceTypeId: 'type-1', performedAt: '2026-03-01T10:00:00.000Z' };
  const trackingFields = [
    ['odometerKm', 20000],
    ['nextDueKm', 25000],
    ['nextDueDate', '2026-09-01T00:00:00.000Z'],
    ['dueRule', 'KM'],
  ] as const;

  it('se crea sin vehículo, descuenta stock y no genera recordatorio', async () => {
    const { service, movements, products, maintenances } = setup();
    seedCount(movements, products, 10);

    const result = await service.create('biz-a', 'user-a', {
      ...withoutVehicle,
      items: [{ productId: 'prod-tracked', quantity: 2 }],
    });

    expect(result.maintenance.vehicleId).toBeNull();
    expect(result.reminder).toBeNull();
    expect(maintenances.get(result.maintenance.id)?.dueRule).toBeNull();
    const uses = [...movements.values()].filter((m) => m.type === 'MAINTENANCE_USE');
    expect(uses).toHaveLength(1);
  });

  it('no cierra el recordatorio abierto de otro vehículo del mismo tipo', async () => {
    const { service, reminders } = setup();
    const withVehicle = await service.create('biz-a', 'user-a', { ...base, nextDueKm: 15000 });
    const openId = withVehicle.reminder!.id;

    await service.create('biz-a', 'user-a', { ...withoutVehicle });

    expect(reminders.get(openId)?.status).toBe('PENDING');
    expect(reminders.size).toBe(1);
  });

  it.each(trackingFields)(
    'POST sin vehículo con %s: 400 VALIDATION_ERROR y no guarda nada',
    async (field, value) => {
      const { service, maintenances, reminders } = setup();

      await expect(
        service.create('biz-a', 'user-a', { ...withoutVehicle, [field]: value }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        errors: [expect.objectContaining({ field })],
      });
      expect(maintenances.size).toBe(0);
      expect(reminders.size).toBe(0);
    },
  );

  it('POST sin vehículo marca todos los campos de seguimiento enviados', async () => {
    const { service } = setup();

    await expect(
      service.create('biz-a', 'user-a', {
        ...withoutVehicle,
        odometerKm: 1,
        nextDueKm: 2,
        nextDueDate: '2026-09-01T00:00:00.000Z',
        dueRule: 'ANY',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [
        expect.objectContaining({ field: 'odometerKm' }),
        expect.objectContaining({ field: 'nextDueKm' }),
        expect.objectContaining({ field: 'nextDueDate' }),
        expect.objectContaining({ field: 'dueRule' }),
      ],
    });
  });

  it.each([
    ...trackingFields,
    ['nextDueKm', null],
    ['nextDueDate', null],
    ['dueRule', null],
  ] as const)(
    'PATCH de uno sin vehículo con %s = %p: 400 VALIDATION_ERROR y no cambia nada',
    async (field, value) => {
      const { service, maintenances } = setup();
      const created = await service.create('biz-a', 'user-a', {
        ...withoutVehicle,
        notes: 'antes',
      });

      await expect(
        service.update(
          'biz-a',
          created.maintenance.id,
          plainToInstance(UpdateMaintenanceDto, { [field]: value, notes: 'después' }),
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        errors: [expect.objectContaining({ field })],
      });
      const stored = maintenances.get(created.maintenance.id)!;
      expect(stored.notes).toBe('antes');
      // El fake deja `undefined` lo que no se envió; Postgres guarda `null`.
      expect(stored[field] ?? null).toBeNull();
    },
  );

  it('PATCH de uno sin vehículo sí corrige las notas', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...withoutVehicle });

    const updated = await service.update(
      'biz-a',
      created.maintenance.id,
      plainToInstance(UpdateMaintenanceDto, { notes: 'Cliente pagó en efectivo' }),
    );

    expect(updated.notes).toBe('Cliente pagó en efectivo');
    expect(updated.vehicleId).toBeNull();
  });

  it('con vehículo, km y próximo km siguen admitidos y generan recordatorio', async () => {
    const { service } = setup();

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      odometerKm: 10000,
      nextDueKm: 15000,
    });

    expect(result.maintenance.vehicleId).toBe('veh-1');
    expect(result.maintenance.odometerKm).toBe(10000);
    expect(result.reminder).toMatchObject({ dueKm: 15000, dueRule: 'KM', status: 'PENDING' });

    const updated = await service.update(
      'biz-a',
      result.maintenance.id,
      plainToInstance(UpdateMaintenanceDto, { nextDueKm: 16000 }),
    );
    expect(updated.nextDueKm).toBe(16000);
  });
});

describe('MaintenancesService — cobro y anulación conjunta (R6, DEC-69 a DEC-77)', () => {
  const charge = { paymentMethod: 'YAPE' as const, totalAmount: 85.5 };

  it('crea el mantenimiento con cobro: una venta MAINTENANCE con una línea SERVICE y sin stock', async () => {
    const { service, movements, products, saleLines } = setup();
    seedCount(movements, products, 10);

    const result = await service.create('biz-a', 'user-a', {
      ...base,
      items: [{ productId: 'prod-tracked', quantity: 2 }],
      charge,
    });

    const sale = result.sale!;
    expect(sale).toMatchObject({
      source: 'MAINTENANCE',
      status: 'ACTIVE',
      paymentMethod: 'YAPE',
      maintenanceId: result.maintenance.id,
      vehicleId: 'veh-1',
    });
    // Sin cliente en R6 (DEC-74). El fake no guarda campos no enviados; Postgres guarda NULL.
    expect(sale.customerId ?? null).toBeNull();
    expect(Number(sale.total)).toBe(85.5);
    expect(sale.lines).toHaveLength(1);
    expect(sale.lines[0]).toMatchObject({
      kind: 'SERVICE',
      productId: null,
      washTypeId: null,
      descriptionSnapshot: 'Cambio de aceite',
      quantity: 1,
      movesStock: false,
    });
    expect(Number(sale.lines[0]!.subtotal)).toBe(85.5);
    expect(saleLines.size).toBe(1);
    // Solo el COUNT sembrado y el MAINTENANCE_USE: la venta no mueve stock.
    expect([...movements.values()].map((m) => m.type).sort()).toEqual(['COUNT', 'MAINTENANCE_USE']);
  });

  it('sin charge no crea venta', async () => {
    const { service, sales } = setup();

    const result = await service.create('biz-a', 'user-a', { ...base });

    expect(result.sale).toBeNull();
    expect(sales.size).toBe(0);
  });

  it('un mantenimiento sin vehículo también se puede cobrar (vehicleId nulo en la venta)', async () => {
    const { service } = setup();

    const result = await service.create('biz-a', 'user-a', {
      maintenanceTypeId: 'type-1',
      performedAt: '2026-03-01T10:00:00.000Z',
      charge,
    });

    expect(result.sale).toMatchObject({ vehicleId: null, maintenanceId: result.maintenance.id });
  });

  it('cobro posterior: crea la venta MAINTENANCE enlazada al mantenimiento', async () => {
    const { service, sales } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    const sale = await service.charge('biz-a', 'user-a', created.maintenance.id, {
      paymentMethod: 'CASH',
      totalAmount: 120,
    });

    expect(sale).toMatchObject({
      source: 'MAINTENANCE',
      paymentMethod: 'CASH',
      maintenanceId: created.maintenance.id,
      vehicleId: 'veh-1',
    });
    expect(Number(sale.total)).toBe(120);
    expect(sales.size).toBe(1);
  });

  it('cobro posterior de uno ya cobrado: 409 MAINTENANCE_ALREADY_CHARGED', async () => {
    const { service, sales } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, charge });

    await expect(
      service.charge('biz-a', 'user-a', created.maintenance.id, charge),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_ALREADY_CHARGED' });
    expect(sales.size).toBe(1);
  });

  it('cobro posterior de uno anulado: 409 MAINTENANCE_VOIDED', async () => {
    const { service, sales } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });
    await service.void('biz-a', 'user-a', created.maintenance.id, { reason: 'Error' });

    await expect(
      service.charge('biz-a', 'user-a', created.maintenance.id, charge),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_VOIDED' });
    expect(sales.size).toBe(0);
  });

  it('cobro posterior de uno inexistente o de otro negocio: 404 MAINTENANCE_NOT_FOUND', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    await expect(service.charge('biz-a', 'user-a', 'no-existe', charge)).rejects.toMatchObject({
      code: 'MAINTENANCE_NOT_FOUND',
    });
    await expect(
      service.charge('biz-b', 'user-b', created.maintenance.id, charge),
    ).rejects.toMatchObject({ code: 'MAINTENANCE_NOT_FOUND' });
  });

  it.each(['', '   ', undefined])(
    'anular sin motivo (%p): 400 VALIDATION_ERROR y no cambia nada',
    async (reason) => {
      const { service, maintenances } = setup();
      const created = await service.create('biz-a', 'user-a', { ...base, charge });

      await expect(
        service.void('biz-a', 'user-a', created.maintenance.id, { reason } as { reason: string }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        errors: [expect.objectContaining({ field: 'reason' })],
      });
      expect(maintenances.get(created.maintenance.id)?.status).toBe('ACTIVE');
    },
  );

  it('anular uno cobrado anula también su venta con el mismo motivo, sin SALE_VOID ni venta nueva', async () => {
    const { service, sales, movements } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, charge });
    const saleId = created.sale!.id;

    const voided = await service.void('biz-a', 'user-a', created.maintenance.id, {
      reason: '  Cliente no vino  ',
    });

    expect(voided.maintenance).toMatchObject({ status: 'VOIDED', voidReason: 'Cliente no vino' });
    expect(voided.sale).toMatchObject({
      id: saleId,
      status: 'VOIDED',
      voidReason: 'Cliente no vino',
    });
    expect(sales.size).toBe(1);
    expect(sales.get(saleId)).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Cliente no vino',
      voidedById: 'user-a',
      maintenanceId: created.maintenance.id,
    });
    expect([...movements.values()].some((m) => m.type === 'SALE_VOID')).toBe(false);
  });

  it('findOne y listByVehicle exponen el cobro cuando existe, y null cuando no (B-156)', async () => {
    const { service } = setup();
    const charged = await service.create('biz-a', 'user-a', { ...base, charge });
    const uncharged = await service.create('biz-a', 'user-a', {
      ...base,
      performedAt: '2026-01-10T10:00:00.000Z',
    });

    const detail = await service.findOne('biz-a', charged.maintenance.id);
    expect(detail.sale).toMatchObject({ id: charged.sale!.id, source: 'MAINTENANCE' });
    expect(detail.sale!.lines).toHaveLength(1);
    expect((await service.findOne('biz-a', uncharged.maintenance.id)).sale).toBeNull();

    const history = await service.listByVehicle('biz-a', 'veh-1');
    const byId = new Map(history.map((m) => [m.id, m]));
    expect(byId.get(charged.maintenance.id)!.sale?.id).toBe(charged.sale!.id);
    expect(byId.get(uncharged.maintenance.id)!.sale).toBeNull();
  });

  it('anular uno sin cobro devuelve sale null', async () => {
    const { service } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base });

    const voided = await service.void('biz-a', 'user-a', created.maintenance.id, {
      reason: 'Sin cobro',
    });

    expect(voided.sale).toBeNull();
  });

  it('si la venta ya estaba anulada, la anulación del mantenimiento continúa y la deja como estaba', async () => {
    const { service, sales } = setup();
    const created = await service.create('biz-a', 'user-a', { ...base, charge });
    const saleId = created.sale!.id;
    Object.assign(sales.get(saleId)!, {
      status: 'VOIDED',
      voidReason: 'Anulada antes',
      voidedById: 'user-x',
    });

    const voided = await service.void('biz-a', 'user-a', created.maintenance.id, {
      reason: 'Ahora el mantenimiento',
    });

    expect(voided.maintenance.status).toBe('VOIDED');
    expect(sales.get(saleId)).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Anulada antes',
      voidedById: 'user-x',
    });
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
