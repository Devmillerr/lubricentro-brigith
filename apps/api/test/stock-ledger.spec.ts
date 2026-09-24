import { InventoryMovementType } from '@prisma/client';
import { applyStockMovements, type StockEntry } from '../src/inventory/stock-ledger';
import { forBusiness } from '../src/prisma/business-scope';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

/**
 * Lógica del StockLedger con el fake (sin Postgres): cálculo de saldos,
 * política de DEC-26/27, caché y aislamiento por negocio. El bloqueo de filas
 * y la concurrencia se prueban contra Postgres real en
 * test/integration/stock-ledger.int-spec.ts.
 */
function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['product', 'inventoryMovement']);
  const products = stores.get('product')!;
  const movements = stores.get('inventoryMovement')!;
  products.set('prod-a', {
    id: 'prod-a',
    businessId: 'biz-a',
    name: 'Aceite 20W50',
    unit: 'litro',
    stockQuantity: 0,
    isCounted: false,
  });
  products.set('prod-b', {
    id: 'prod-b',
    businessId: 'biz-b',
    name: 'Ajeno',
    unit: 'unidad',
    stockQuantity: 50,
    isCounted: true,
  });

  const apply = (
    entries: Omit<StockEntry, 'occurredAt'>[],
    policy: 'BLOCK' | 'WARN' = 'WARN',
    businessId = 'biz-a',
  ) =>
    forBusiness(prisma, businessId).$transaction((tx) =>
      applyStockMovements(tx, {
        businessId,
        createdById: 'user-a',
        policy,
        entries: entries.map((entry) => ({ ...entry, occurredAt: new Date() })),
      }),
    );

  const balance = (id = 'prod-a') => Number(products.get(id)!.stockQuantity);
  const sumOfMovements = (id = 'prod-a') =>
    [...movements.values()]
      .filter((m) => m.productId === id)
      .reduce((total, m) => total + Number(m.quantityDelta), 0);

  return { apply, products, movements, balance, sumOfMovements };
}

const count = (countedQuantity: number): Omit<StockEntry, 'occurredAt'> => ({
  productId: 'prod-a',
  type: InventoryMovementType.COUNT,
  countedQuantity,
});

describe('StockLedger', () => {
  it('una entrada aumenta el saldo en caché y guarda resultingBalance y createdById (caso 1)', async () => {
    const { apply, balance, movements } = setup();
    await apply([count(5)]);

    const { movements: created } = await apply([
      { productId: 'prod-a', type: InventoryMovementType.PURCHASE_IN, quantityDelta: 20 },
    ]);

    expect(balance()).toBe(25);
    expect(Number(created[0]!.resultingBalance)).toBe(25);
    expect(created[0]!.createdById).toBe('user-a');
    expect(movements.size).toBe(2);
  });

  it('un ajuste actualiza el saldo, aunque lo deje negativo (caso 2)', async () => {
    const { apply, balance } = setup();
    await apply([count(3)]);

    const { movements, warnings } = await apply([
      {
        productId: 'prod-a',
        type: InventoryMovementType.ADJUSTMENT,
        quantityDelta: -5,
        reason: 'Producto dañado',
      },
    ]);

    expect(balance()).toBe(-2);
    expect(Number(movements[0]!.resultingBalance)).toBe(-2);
    expect(movements[0]!.reason).toBe('Producto dañado');
    // Un ajuste corrige el estante: no es consumo, no pasa por la política.
    expect(warnings).toEqual([]);
  });

  it('un conteo deja el saldo en lo contado y marca isCounted (BR-P7, BR-P8)', async () => {
    const { apply, balance, products } = setup();
    await apply([
      { productId: 'prod-a', type: InventoryMovementType.PURCHASE_IN, quantityDelta: 4 },
    ]);

    const { movements } = await apply([count(10)]);

    expect(Number(movements[0]!.previousBalance)).toBe(4);
    expect(Number(movements[0]!.quantityDelta)).toBe(6);
    expect(balance()).toBe(10);
    expect(products.get('prod-a')!.isCounted).toBe(true);
  });

  it('una salida descuenta del saldo (caso 3)', async () => {
    const { apply, balance } = setup();
    await apply([count(10)]);

    const { warnings } = await apply([
      { productId: 'prod-a', type: InventoryMovementType.SALE, quantityDelta: -4 },
    ]);

    expect(balance()).toBe(6);
    expect(warnings).toEqual([]);
  });

  it('salidas repetidas del mismo producto en una operación se evalúan sumadas', async () => {
    const { apply, balance } = setup();
    await apply([count(5)]);

    await expect(
      apply(
        [
          { productId: 'prod-a', type: InventoryMovementType.SALE, quantityDelta: -3 },
          { productId: 'prod-a', type: InventoryMovementType.SALE, quantityDelta: -3 },
        ],
        'BLOCK',
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(balance()).toBe(5);
  });

  it('venta (BLOCK) con conteo y saldo insuficiente: 422 y no escribe nada (caso 4, DEC-26)', async () => {
    const { apply, balance, movements } = setup();
    await apply([count(2)]);

    await expect(
      apply(
        [{ productId: 'prod-a', type: InventoryMovementType.SALE, quantityDelta: -3 }],
        'BLOCK',
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 422 });

    expect(balance()).toBe(2);
    expect(movements.size).toBe(1);
  });

  it('venta (BLOCK) con saldo exacto sí pasa y deja el saldo en 0 (caso 4)', async () => {
    const { apply, balance } = setup();
    await apply([count(3)]);

    await apply(
      [{ productId: 'prod-a', type: InventoryMovementType.SALE, quantityDelta: -3 }],
      'BLOCK',
    );

    expect(balance()).toBe(0);
  });

  it('mantenimiento (WARN) puede dejar el saldo negativo con aviso (caso 5, DEC-26)', async () => {
    const { apply, balance } = setup();
    await apply([count(2)]);

    const { warnings } = await apply([
      { productId: 'prod-a', type: InventoryMovementType.MAINTENANCE_USE, quantityDelta: -5 },
    ]);

    expect(balance()).toBe(-3);
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        productId: 'prod-a',
        balance: 2,
        requestedQuantity: 5,
      }),
    ]);
  });

  it('producto sin conteo inicial: la venta sigue, con aviso de stock no confiable (caso 6, DEC-27)', async () => {
    const { apply, balance, products } = setup();

    const { warnings } = await apply(
      [{ productId: 'prod-a', type: InventoryMovementType.SALE, quantityDelta: -2 }],
      'BLOCK',
    );

    expect(balance()).toBe(-2);
    expect(products.get('prod-a')!.isCounted).toBe(false);
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'PRODUCT_NOT_COUNTED', productId: 'prod-a' }),
    ]);
  });

  it('el saldo en caché coincide con la suma de movimientos tras una secuencia mixta', async () => {
    const { apply, balance, sumOfMovements } = setup();
    await apply([
      { productId: 'prod-a', type: InventoryMovementType.PURCHASE_IN, quantityDelta: 1.5 },
    ]);
    await apply([count(10)]);
    await apply([
      { productId: 'prod-a', type: InventoryMovementType.PURCHASE_IN, quantityDelta: 0.1 },
    ]);
    await apply([
      { productId: 'prod-a', type: InventoryMovementType.PURCHASE_IN, quantityDelta: 0.2 },
    ]);
    await apply([
      { productId: 'prod-a', type: InventoryMovementType.MAINTENANCE_USE, quantityDelta: -4.3 },
    ]);
    await apply([
      { productId: 'prod-a', type: InventoryMovementType.MAINTENANCE_VOID, quantityDelta: 4.3 },
    ]);

    // Decimal, no float: 10 + 0.1 + 0.2 da exactamente 10.3.
    expect(balance()).toBe(10.3);
    expect(sumOfMovements()).toBeCloseTo(10.3, 10);
  });

  it('no opera sobre un producto de otro negocio: PRODUCT_NOT_FOUND y sin escribir (caso 9)', async () => {
    const { apply, balance, movements } = setup();

    await expect(
      apply([{ productId: 'prod-b', type: InventoryMovementType.PURCHASE_IN, quantityDelta: 5 }]),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });

    expect(balance('prod-b')).toBe(50);
    expect(movements.size).toBe(0);
  });

  it('una lista vacía no hace nada', async () => {
    const { apply, movements } = setup();

    expect(await apply([])).toEqual({ movements: [], warnings: [] });
    expect(movements.size).toBe(0);
  });
});
