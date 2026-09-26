import {
  InventoryService,
  MAX_RECEIPT_LINES,
  type ReceiptBatchInput,
} from '../src/inventory/inventory.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['inventoryMovement', 'product']);
  const service = new InventoryService(prisma);
  const products = stores.get('product')!;
  products.set('prod-a', {
    id: 'prod-a',
    businessId: 'biz-a',
    name: 'Filtro X',
    unit: 'unidad',
    isActive: true,
  });
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

  it('adjustment con cantidad física: guarda motivo, saldo anterior, diferencia y resultante (BR-P7b)', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });

    const movement = await service.adjustment('biz-a', 'user-a', {
      productId: 'prod-a',
      physicalQuantity: 3,
      reason: 'Producto dañado',
    });

    expect(movement).toMatchObject({
      type: 'ADJUSTMENT',
      reason: 'Producto dañado',
      createdById: 'user-a',
    });
    expect(Number(movement.previousBalance)).toBe(5);
    expect(Number(movement.quantityDelta)).toBe(-2);
    expect(Number(movement.resultingBalance)).toBe(3);
    expect(Number(movement.countedQuantity)).toBe(3);
    const stock = await service.getStock('biz-a', 'prod-a');
    expect(stock.balance).toBe(3);
  });

  it('adjustment puede subir el saldo y llevarlo a 0', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });

    const up = await service.adjustment('biz-a', 'user-a', {
      productId: 'prod-a',
      physicalQuantity: 7.5,
      reason: 'Conteo físico distinto',
    });
    const zero = await service.adjustment('biz-a', 'user-a', {
      productId: 'prod-a',
      physicalQuantity: 0,
      reason: 'Consumo interno',
    });

    expect(Number(up.quantityDelta)).toBe(2.5);
    expect(Number(zero.quantityDelta)).toBe(-7.5);
    expect((await service.getStock('biz-a', 'prod-a')).balance).toBe(0);
  });

  it('adjustment sin conteo inicial: 409 ADJUSTMENT_REQUIRES_COUNT, no escribe ni marca isCounted', async () => {
    const { service, movements } = setup();

    await expect(
      service.adjustment('biz-a', 'user-a', {
        productId: 'prod-a',
        physicalQuantity: 4,
        reason: 'Otro',
      }),
    ).rejects.toMatchObject({ code: 'ADJUSTMENT_REQUIRES_COUNT', status: 409 });
    expect(movements.size).toBe(0);
    expect(await service.getStock('biz-a', 'prod-a')).toEqual({
      productId: 'prod-a',
      balance: 0,
      isCounted: false,
    });
  });

  it('adjustment igual al saldo: 400 NO_DIFFERENCE y no escribe', async () => {
    const { service, movements } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });

    await expect(
      service.adjustment('biz-a', 'user-a', {
        productId: 'prod-a',
        physicalQuantity: 5,
        reason: 'Otro',
      }),
    ).rejects.toMatchObject({ code: 'NO_DIFFERENCE', status: 400 });
    expect(movements.size).toBe(1);
  });

  it('adjustment sobre un producto inactivo: 409 PRODUCT_INACTIVE y no escribe', async () => {
    const { service, movements, products } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });
    products.get('prod-a')!.isActive = false;

    await expect(
      service.adjustment('biz-a', 'user-a', {
        productId: 'prod-a',
        physicalQuantity: 2,
        reason: 'Otro',
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE', status: 409 });
    expect(movements.size).toBe(1);
  });

  it('adjustment sobre un producto de otro negocio: PRODUCT_NOT_FOUND', async () => {
    const { service, products } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 5 });

    await expect(
      service.adjustment('biz-b', 'user-b', {
        productId: 'prod-a',
        physicalQuantity: 2,
        reason: 'Otro',
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(Number(products.get('prod-a')!.stockQuantity)).toBe(5);
  });

  it('saldo = suma de quantityDelta de todos los movimientos (invariante 1)', async () => {
    const { service } = setup();
    await service.count('biz-a', 'user-a', { productId: 'prod-a', countedQuantity: 10 });
    await service.receipt('biz-a', 'user-a', { productId: 'prod-a', quantity: 5 });
    await service.adjustment('biz-a', 'user-a', {
      productId: 'prod-a',
      physicalQuantity: 11,
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

/**
 * Recepción en lote (R3, BR-P6) con el fake: forma del lote, enlace
 * cabecera ↔ líneas y rechazos antes de escribir. El rollback de la
 * transacción real y la concurrencia se prueban contra Postgres en
 * test/integration/inventory-receipts.int-spec.ts.
 */
function setupReceipts() {
  const { prisma, stores } = buildFakeScopedPrisma([
    'inventoryMovement',
    'product',
    'inventoryReceipt',
  ]);
  const service = new InventoryService(prisma);
  const products = stores.get('product')!;
  const product = (id: string, businessId: string, extra: Record<string, unknown> = {}) =>
    products.set(id, {
      id,
      businessId,
      name: id,
      unit: 'unidad',
      stockQuantity: 0,
      isCounted: false,
      isActive: true,
      ...extra,
    });
  product('prod-a', 'biz-a', { stockQuantity: 10, isCounted: true });
  product('prod-b', 'biz-a');
  product('prod-inactive', 'biz-a', { stockQuantity: 4, isCounted: true, isActive: false });
  product('prod-other', 'biz-b', { stockQuantity: 50, isCounted: true });

  const receive = (input: ReceiptBatchInput, businessId = 'biz-a') =>
    service.createReceiptBatch(businessId, 'user-a', input);
  const balance = (id: string) => Number(products.get(id)!.stockQuantity);

  return {
    service,
    prisma,
    receive,
    balance,
    movements: stores.get('inventoryMovement')!,
    receipts: stores.get('inventoryReceipt')!,
  };
}

describe('InventoryService.createReceiptBatch (R3)', () => {
  it('una línea: crea la cabecera y un PURCHASE_IN enlazado por refType/refId', async () => {
    const { receive, balance, receipts } = setupReceipts();

    const { receipt, lines } = await receive({ lines: [{ productId: 'prod-a', quantity: 5 }] });

    expect(receipts.size).toBe(1);
    expect(receipt.businessId).toBe('biz-a');
    expect(receipt.createdById).toBe('user-a');
    expect(receipt.note).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: 'PURCHASE_IN',
      productId: 'prod-a',
      refType: 'InventoryReceipt',
      refId: receipt.id,
      createdById: 'user-a',
    });
    expect(Number(lines[0]!.quantityDelta)).toBe(5);
    expect(Number(lines[0]!.resultingBalance)).toBe(15);
    expect(balance('prod-a')).toBe(15);
  });

  it('varias líneas: un movimiento por línea, en el orden enviado, y cada saldo sube', async () => {
    const { receive, balance, movements } = setupReceipts();

    const { receipt, lines } = await receive({
      lines: [
        { productId: 'prod-b', quantity: 2.5 },
        { productId: 'prod-a', quantity: 3 },
      ],
    });

    expect(movements.size).toBe(2);
    expect(lines.map((line) => line.productId)).toEqual(['prod-b', 'prod-a']);
    expect(lines.every((line) => line.refId === receipt.id)).toBe(true);
    expect(balance('prod-b')).toBe(2.5);
    expect(balance('prod-a')).toBe(13);
  });

  it('respeta id, occurredAt y note enviados', async () => {
    const { receive } = setupReceipts();
    const id = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455';

    const { receipt, lines } = await receive({
      id,
      occurredAt: '2026-09-20T15:00:00.000Z',
      note: 'Reposición semanal',
      lines: [{ productId: 'prod-a', quantity: 1 }],
    });

    expect(receipt.id).toBe(id);
    expect(receipt.note).toBe('Reposición semanal');
    expect(receipt.occurredAt).toEqual(new Date('2026-09-20T15:00:00.000Z'));
    expect(lines[0]!.refId).toBe(id);
    expect(lines[0]!.occurredAt).toEqual(new Date('2026-09-20T15:00:00.000Z'));
  });

  it.each([
    ['sin líneas', 0],
    ['más de 100 líneas', MAX_RECEIPT_LINES + 1],
  ])('%s: VALIDATION_ERROR y no escribe nada', async (_label, size) => {
    const { receive, movements, receipts } = setupReceipts();
    const lines = Array.from({ length: size }, (_, i) => ({ productId: `p-${i}`, quantity: 1 }));

    await expect(receive({ lines })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      errors: [expect.objectContaining({ field: 'lines' })],
    });
    expect(movements.size).toBe(0);
    expect(receipts.size).toBe(0);
  });

  it('100 líneas es el máximo permitido', async () => {
    const { receive } = setupReceipts();
    // Pasa la validación de forma; los productos no existen, así que el
    // rechazo viene del ledger (PRODUCT_NOT_FOUND), no del límite.
    const lines = Array.from({ length: MAX_RECEIPT_LINES }, (_, i) => ({
      productId: `p-${i}`,
      quantity: 1,
    }));

    await expect(receive({ lines })).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it.each([0, -2, Number.NaN])(
    'cantidad inválida (%p): VALIDATION_ERROR con el campo de la línea',
    async (quantity) => {
      const { receive, balance, movements } = setupReceipts();

      await expect(
        receive({
          lines: [
            { productId: 'prod-a', quantity: 1 },
            { productId: 'prod-b', quantity },
          ],
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        errors: [expect.objectContaining({ field: 'lines.1.quantity' })],
      });
      expect(movements.size).toBe(0);
      expect(balance('prod-a')).toBe(10);
    },
  );

  it('producto repetido: DUPLICATE_PRODUCT_LINE y no escribe nada', async () => {
    const { receive, movements, receipts } = setupReceipts();

    await expect(
      receive({
        lines: [
          { productId: 'prod-a', quantity: 1 },
          { productId: 'prod-a', quantity: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PRODUCT_LINE', status: 400 });
    expect(movements.size).toBe(0);
    expect(receipts.size).toBe(0);
  });

  it('producto inexistente en una línea: PRODUCT_NOT_FOUND y ninguna línea se guarda', async () => {
    const { receive, balance, movements, receipts } = setupReceipts();

    await expect(
      receive({
        lines: [
          { productId: 'prod-a', quantity: 1 },
          { productId: 'no-existe', quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', status: 404 });
    expect(movements.size).toBe(0);
    expect(receipts.size).toBe(0);
    expect(balance('prod-a')).toBe(10);
  });

  it('producto inactivo en una línea: PRODUCT_INACTIVE y ninguna línea se guarda (DEC-51)', async () => {
    const { receive, balance, movements, receipts } = setupReceipts();

    await expect(
      receive({
        lines: [
          { productId: 'prod-a', quantity: 1 },
          { productId: 'prod-inactive', quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE', status: 409 });
    expect(movements.size).toBe(0);
    expect(receipts.size).toBe(0);
    expect(balance('prod-a')).toBe(10);
    expect(balance('prod-inactive')).toBe(4);
  });

  it('producto de otro negocio: PRODUCT_NOT_FOUND y el saldo ajeno no cambia', async () => {
    const { receive, balance, movements, receipts } = setupReceipts();

    await expect(
      receive({ lines: [{ productId: 'prod-other', quantity: 3 }] }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(balance('prod-other')).toBe(50);
    expect(movements.size).toBe(0);
    expect(receipts.size).toBe(0);
  });

  it('la cabecera queda en el negocio autenticado', async () => {
    const { receive, receipts } = setupReceipts();

    const { receipt } = await receive({ lines: [{ productId: 'prod-a', quantity: 1 }] });

    expect(receipts.get(receipt.id)!.businessId).toBe('biz-a');
  });
});

/**
 * Historial y detalle de recepciones (R3) con el fake: orden, cursor,
 * conteo de líneas, aislamiento y cantidad de consultas por página.
 */
describe('InventoryService.listReceipts / getReceipt (R3)', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  /** Registra cada operación de Prisma (`Modelo.operación`) que hace el servicio. */
  function recordOperations(prisma: unknown): string[] {
    const operations: string[] = [];
    const client = prisma as { $extends: (config: unknown) => unknown };
    const original = client.$extends.bind(client);
    client.$extends = (config: unknown) => {
      const typed = config as {
        query: { $allModels: { $allOperations: (ctx: Record<string, unknown>) => unknown } };
      };
      const inner = typed.query.$allModels.$allOperations;
      return original({
        ...typed,
        query: {
          $allModels: {
            $allOperations: (ctx: Record<string, unknown>) => {
              operations.push(`${String(ctx.model)}.${String(ctx.operation)}`);
              return inner(ctx);
            },
          },
        },
      });
    };
    return operations;
  }

  it('lista vacía: sin recepciones y sin cursor', async () => {
    const { service } = setupReceipts();

    await expect(service.listReceipts('biz-a', {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('varias recepciones: más recientes primero, con lineCount y sin las líneas', async () => {
    const { service, receive } = setupReceipts();
    await receive({
      id: id(1),
      occurredAt: '2026-09-20T10:00:00.000Z',
      lines: [{ productId: 'prod-a', quantity: 1 }],
    });
    await receive({
      id: id(2),
      occurredAt: '2026-09-22T10:00:00.000Z',
      note: 'Aceites',
      lines: [
        { productId: 'prod-a', quantity: 2 },
        { productId: 'prod-b', quantity: 3 },
      ],
    });

    const page = await service.listReceipts('biz-a', {});

    expect(page.nextCursor).toBeNull();
    expect(page.items.map((r) => [r.id, r.lineCount])).toEqual([
      [id(2), 2],
      [id(1), 1],
    ]);
    expect(page.items[0]).toMatchObject({
      businessId: 'biz-a',
      note: 'Aceites',
      createdById: 'user-a',
    });
    expect(page.items[0]).not.toHaveProperty('lines');
  });

  it('misma fecha: desempata por id y el cursor recorre todo sin repetir ni saltar', async () => {
    const { service, receive } = setupReceipts();
    const occurredAt = '2026-09-22T10:00:00.000Z';
    for (const n of [3, 1, 5, 2, 4]) {
      await receive({ id: id(n), occurredAt, lines: [{ productId: 'prod-a', quantity: 1 }] });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.listReceipts('biz-a', { limit: 2, cursor });
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toEqual([id(5), id(4), id(3), id(2), id(1)]);
  });

  it('dos consultas por página sin importar cuántas recepciones trae (sin N+1)', async () => {
    const { service, receive, prisma } = setupReceipts();
    for (let n = 1; n <= 5; n++) {
      await receive({
        id: id(n),
        lines: [
          { productId: 'prod-a', quantity: 1 },
          { productId: 'prod-b', quantity: 1 },
        ],
      });
    }
    const operations = recordOperations(prisma);

    const page = await service.listReceipts('biz-a', {});

    expect(page.items).toHaveLength(5);
    expect(page.items.every((r) => r.lineCount === 2)).toBe(true);
    expect(operations).toEqual(['InventoryReceipt.findMany', 'InventoryMovement.groupBy']);
  });

  it('aislamiento: cada negocio solo ve sus recepciones', async () => {
    const { service, receive } = setupReceipts();
    await receive({ id: id(1), lines: [{ productId: 'prod-a', quantity: 1 }] });
    await receive({ id: id(2), lines: [{ productId: 'prod-other', quantity: 1 }] }, 'biz-b');

    const pageA = await service.listReceipts('biz-a', {});
    const pageB = await service.listReceipts('biz-b', {});

    expect(pageA.items.map((r) => r.id)).toEqual([id(1)]);
    expect(pageB.items.map((r) => r.id)).toEqual([id(2)]);
  });

  it('detalle: cabecera y todas sus líneas PURCHASE_IN, ordenadas por productId', async () => {
    const { service, receive } = setupReceipts();
    await receive({
      id: id(1),
      note: 'Reposición',
      lines: [
        { productId: 'prod-b', quantity: 2.5 },
        { productId: 'prod-a', quantity: 3 },
      ],
    });
    await receive({ id: id(2), lines: [{ productId: 'prod-a', quantity: 1 }] });

    const { receipt, lines } = await service.getReceipt('biz-a', id(1));

    expect(receipt).toMatchObject({ id: id(1), businessId: 'biz-a', note: 'Reposición' });
    expect(
      lines.map((l) => [l.productId, Number(l.quantityDelta), Number(l.resultingBalance)]),
    ).toEqual([
      ['prod-a', 3, 13],
      ['prod-b', 2.5, 2.5],
    ]);
    expect(lines.every((l) => l.type === 'PURCHASE_IN' && l.refId === id(1))).toBe(true);
  });

  it('detalle inexistente: 404 RECEIPT_NOT_FOUND', async () => {
    const { service } = setupReceipts();

    await expect(service.getReceipt('biz-a', id(9))).rejects.toMatchObject({
      code: 'RECEIPT_NOT_FOUND',
    });
  });

  it('detalle de otro negocio: 404 RECEIPT_NOT_FOUND, igual que si no existiera', async () => {
    const { service, receive } = setupReceipts();
    await receive({ id: id(1), lines: [{ productId: 'prod-other', quantity: 1 }] }, 'biz-b');

    await expect(service.getReceipt('biz-a', id(1))).rejects.toMatchObject({
      code: 'RECEIPT_NOT_FOUND',
    });
  });
});

/** Stock que requiere atención (R3, BR-P19, DEC-50) con el fake. */
describe('InventoryService.getAlerts (R3)', () => {
  function setupAlerts() {
    const { prisma, stores } = buildFakeScopedPrisma(['product']);
    const service = new InventoryService(prisma);
    const products = stores.get('product')!;
    const product = (
      id: string,
      stockQuantity: number,
      isCounted: boolean,
      extra: Record<string, unknown> = {},
    ) =>
      products.set(id, {
        id,
        businessId: 'biz-a',
        name: id,
        unit: 'unidad',
        stockQuantity,
        isCounted,
        isActive: true,
        tracksStock: true,
        ...extra,
      });
    return { service, product };
  }

  it('sin productos: listas vacías y notCountedCount 0', async () => {
    const { service } = setupAlerts();

    await expect(service.getAlerts('biz-a')).resolves.toEqual({
      outOfStock: [],
      negative: [],
      notCountedCount: 0,
    });
  });

  it('agotados y negativos solo con conteo; sin conteo solo suma en notCountedCount', async () => {
    const { service, product } = setupAlerts();
    product('Zeta agotado', 0, true, { unit: 'litro' });
    product('Alfa agotado', 0, true);
    product('Negativo', -2.5, true, { unit: 'litro' });
    product('Con saldo', 4, true);
    product('Sin conteo en cero', 0, false);
    product('Sin conteo negativo', -3, false);
    product('Sin conteo con saldo', 7, false);

    const alerts = await service.getAlerts('biz-a');

    expect(alerts.outOfStock).toEqual([
      { productId: 'Alfa agotado', name: 'Alfa agotado', unit: 'unidad', balance: 0 },
      { productId: 'Zeta agotado', name: 'Zeta agotado', unit: 'litro', balance: 0 },
    ]);
    expect(alerts.negative).toEqual([
      { productId: 'Negativo', name: 'Negativo', unit: 'litro', balance: -2.5 },
    ]);
    expect(alerts.notCountedCount).toBe(3);
  });

  it('ignora productos inactivos en las listas y en notCountedCount', async () => {
    const { service, product } = setupAlerts();
    product('inactivo agotado', 0, true, { isActive: false });
    product('inactivo negativo', -1, true, { isActive: false });
    product('inactivo sin conteo', 0, false, { isActive: false });

    await expect(service.getAlerts('biz-a')).resolves.toEqual({
      outOfStock: [],
      negative: [],
      notCountedCount: 0,
    });
  });

  it('notCountedCount no cuenta productos que no controlan stock (BR-P16)', async () => {
    const { service, product } = setupAlerts();
    product('sin conteo', 0, false);
    product('no controla stock', 0, false, { tracksStock: false });

    const alerts = await service.getAlerts('biz-a');

    expect(alerts.notCountedCount).toBe(1);
  });

  it('aislamiento: no ve productos de otro negocio', async () => {
    const { service, product } = setupAlerts();
    product('mio', 0, true);
    product('ajeno agotado', 0, true, { businessId: 'biz-b' });
    product('ajeno negativo', -1, true, { businessId: 'biz-b' });
    product('ajeno sin conteo', 0, false, { businessId: 'biz-b' });

    const alerts = await service.getAlerts('biz-a');
    const other = await service.getAlerts('biz-b');

    expect(alerts.outOfStock.map((p) => p.productId)).toEqual(['mio']);
    expect(alerts.negative).toEqual([]);
    expect(alerts.notCountedCount).toBe(0);
    expect(other.outOfStock.map((p) => p.productId)).toEqual(['ajeno agotado']);
    expect(other.negative.map((p) => p.productId)).toEqual(['ajeno negativo']);
    expect(other.notCountedCount).toBe(1);
  });
});
