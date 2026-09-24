import { InventoryService } from '../src/inventory/inventory.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['inventoryMovement', 'product']);
  const service = new InventoryService(prisma);
  const products = stores.get('product')!;
  products.set('prod-a', { id: 'prod-a', businessId: 'biz-a', name: 'Filtro X', unit: 'unidad' });
  return { service, movements: stores.get('inventoryMovement')!, products };
}

describe('InventoryService', () => {
  it('rechaza operar sobre un producto que no existe con PRODUCT_NOT_FOUND', async () => {
    const { service } = setup();

    await expect(
      service.count('biz-a', 'user-a', { productId: 'no-existe', countedQuantity: 5 }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('un producto sin movimientos está sin conteo inicial y saldo 0 (BR-P8)', async () => {
    const { service } = setup();

    const stock = await service.getStock('biz-a', 'prod-a');

    expect(stock).toEqual({ productId: 'prod-a', balance: 0, isCounted: false });
  });

  it('count sobre un producto sin movimientos: quantityDelta = countedQuantity (invariante 2)', async () => {
    const { service } = setup();

    const movement = await service.count('biz-a', 'user-a', {
      productId: 'prod-a',
      countedQuantity: 10,
    });

    expect(movement.type).toBe('COUNT');
    expect(Number(movement.previousBalance)).toBe(0);
    expect(Number(movement.quantityDelta)).toBe(10);
    expect(movement.countedQuantity).toBe(10);
    expect(Number(movement.resultingBalance)).toBe(10);
    expect(movement.createdById).toBe('user-a');
  });

  it('tras un count, el saldo es igual a lo contado y queda "con conteo" (BR-P7, BR-P8)', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 7 });

    const stock = await service.getStock('biz-a', 'prod-a');

    expect(stock.balance).toBe(7);
    expect(stock.isCounted).toBe(true);
  });

  it('receipt suma al saldo (BR-P6)', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });

    const movement = await service.receipt('biz-a', 'user-a', { productId: 'prod-a', quantity: 3 });

    expect(movement.type).toBe('PURCHASE_IN');
    expect(Number(movement.quantityDelta)).toBe(3);
    const stock = await service.getStock('biz-a', 'prod-a');
    expect(stock.balance).toBe(8);
  });

  it('adjustment exige un motivo y puede restar del saldo (BR-P10)', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });

    const movement = await service.adjustment('biz-a', 'user-a', {
      productId: 'prod-a',
      quantityDelta: -2,
      reason: 'Producto dañado',
    });

    expect(movement.reason).toBe('Producto dañado');
    const stock = await service.getStock('biz-a', 'prod-a');
    expect(stock.balance).toBe(3);
  });

  it('saldo = suma de quantityDelta de todos los movimientos (invariante 1)', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 10 });
    await service.receipt('biz-a', 'user-a', { productId: 'prod-a', quantity: 5 });
    await service.adjustment('biz-a', 'user-a', {
      productId: 'prod-a',
      quantityDelta: -4,
      reason: 'Merma',
    });

    const stock = await service.getStock('biz-a', 'prod-a');

    expect(stock.balance).toBe(11);
  });

  it('un segundo count corrige el saldo hacia lo contado, sin importar el historial previo', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 10 });
    await service.receipt('biz-a', 'user-a', { productId: 'prod-a', quantity: 5 });

    const recount = await service.count('biz-a', 'user-a', {
      productId: 'prod-a',
      countedQuantity: 12,
    });

    expect(Number(recount.previousBalance)).toBe(15);
    expect(Number(recount.quantityDelta)).toBe(-3);
    const stock = await service.getStock('biz-a', 'prod-a');
    expect(stock.balance).toBe(12);
  });

  it('los movimientos no se editan ni se borran: no hay update/delete expuestos (BR-G5)', () => {
    const { service } = setup();
    expect((service as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).delete).toBeUndefined();
  });

  it('getStock no cruza negocios', async () => {
    const { service, products } = setup();
    products.set('prod-b', { id: 'prod-b', businessId: 'biz-b', name: 'Ajeno', unit: 'unidad' });
    await service.count('biz-b', 'user-a', { productId: 'prod-b', countedQuantity: 99 });

    await expect(service.getStock('biz-a', 'prod-b')).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('listMovements filtra por productId y type, y no cruza negocios', async () => {
    const { service, products } = setup();
    products.set('prod-b', { id: 'prod-b', businessId: 'biz-a', name: 'Otro', unit: 'unidad' });
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });
    await service.receipt('biz-a', 'user-a', { productId: 'prod-a', quantity: 2 });
    await service.count('biz-a', 'user-a', { productId: 'prod-b', countedQuantity: 1 });

    const forProductA = await service.listMovements('biz-a', { productId: 'prod-a' });
    expect(forProductA.items).toHaveLength(2);

    const onlyCounts = await service.listMovements('biz-a', {
      productId: 'prod-a',
      type: 'COUNT',
    });
    expect(onlyCounts.items).toHaveLength(1);
    expect(onlyCounts.items[0]?.type).toBe('COUNT');
  });
});
