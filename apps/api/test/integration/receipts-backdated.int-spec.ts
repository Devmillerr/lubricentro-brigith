import { randomUUID } from 'node:crypto';
import { InventoryMovementType } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { ProblemException } from '../../src/common/exceptions/problem.exception';
import {
  InventoryService,
  RECEIPT_REF_TYPE,
  type ReceiptBatchInput,
} from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Compras atrasadas y posibles duplicados (R8, DEC-96, BR-K2 a BR-K4) contra
 * Postgres real: fechas futuras, conteos o ajustes posteriores a la fecha de la
 * recepción, resolución por producto, recepciones casi iguales, concurrencia y
 * aislamiento. Cada rechazo se comprueba sin escrituras parciales.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan Postgres.',
  );
}
if (!/\/[^/?]*_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test".');
}

const prisma = new PrismaService({
  get: () => url,
} as unknown as ConfigService<Env, true>);
const inventory = new InventoryService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R8 ${suffix}`, slug: `r8-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'R8', username: `r8-${suffix}`, passwordHash: 'x' },
  });
  return { businessId: business.id, userId: user.id };
}

async function createProduct(tenant: Tenant, name = `Aceite ${randomUUID()}`): Promise<string> {
  const product = await prisma.product.create({
    data: { businessId: tenant.businessId, name, unit: 'litro' },
  });
  return product.id;
}

function count(tenant: Tenant, productId: string, countedQuantity: number, occurredAt: string) {
  return inventory.count(tenant.businessId, tenant.userId, {
    productId,
    countedQuantity,
    occurredAt,
  });
}

function receive(tenant: Tenant, input: ReceiptBatchInput, now?: Date) {
  return inventory.createReceiptBatch(tenant.businessId, tenant.userId, input, now);
}

async function balance(productId: string): Promise<number> {
  const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
  return Number(product.stockQuantity);
}

/** Lo que un rechazo no debe cambiar. */
async function snapshot(tenant: Tenant) {
  const [movements, receipts, products] = await Promise.all([
    prisma.inventoryMovement.count({ where: { businessId: tenant.businessId } }),
    prisma.inventoryReceipt.count({ where: { businessId: tenant.businessId } }),
    prisma.product.findMany({
      where: { businessId: tenant.businessId },
      select: { id: true, stockQuantity: true, isCounted: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return JSON.stringify({ movements, receipts, products });
}

async function rejection(promise: Promise<unknown>): Promise<ProblemException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('Se esperaba un rechazo');
}

const ARRIVAL = '2026-09-15T15:00:00.000Z';
const AFTER_ARRIVAL = '2026-09-20T15:00:00.000Z';
const BEFORE_ARRIVAL = '2026-09-10T15:00:00.000Z';
const NOW = new Date('2026-10-10T15:00:00.000Z');

describe('Recepción atrasada (R8, DEC-96)', () => {
  it('fecha futura: más de 5 min → 400 occurredAt sin escribir nada; hasta 5 min se acepta', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const before = await snapshot(tenant);

    const error = await rejection(
      receive(
        tenant,
        {
          occurredAt: new Date(NOW.getTime() + 6 * 60_000).toISOString(),
          lines: [{ productId, quantity: 1 }],
        },
        NOW,
      ),
    );
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.errors).toEqual([
      { field: 'occurredAt', message: 'La fecha de recepción no puede ser futura.' },
    ]);
    expect(await snapshot(tenant)).toBe(before);

    await receive(
      tenant,
      {
        occurredAt: new Date(NOW.getTime() + 4 * 60_000).toISOString(),
        lines: [{ productId, quantity: 1 }],
      },
      NOW,
    );
    expect(await balance(productId)).toBe(1);
  });

  it('sin conteos posteriores: suma al stock, con ledgerSeq creciente y recordedAt', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await count(tenant, productId, 3, BEFORE_ARRIVAL);

    const { lines, adjustments, receipt } = await receive(
      tenant,
      { occurredAt: ARRIVAL, lines: [{ productId, quantity: 5 }] },
      NOW,
    );

    expect(await balance(productId)).toBe(8);
    expect(adjustments).toEqual([]);
    expect(receipt.laterStockResolution).toBeNull();
    const movements = await prisma.inventoryMovement.findMany({
      where: { productId },
      orderBy: { ledgerSeq: 'asc' },
    });
    expect(movements.map((m) => m.type)).toEqual([
      InventoryMovementType.COUNT,
      InventoryMovementType.PURCHASE_IN,
    ]);
    expect(movements.every((m) => m.ledgerSeq !== null && m.recordedAt !== null)).toBe(true);
    expect(movements[1]!.ledgerSeq!).toBeGreaterThan(movements[0]!.ledgerSeq!);
    expect(lines[0]!.occurredAt.toISOString()).toBe(ARRIVAL);
  });

  it('un conteo anterior a la llegada no se detecta', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await count(tenant, productId, 2, BEFORE_ARRIVAL);
    await receive(tenant, { occurredAt: ARRIVAL, lines: [{ productId, quantity: 1 }] }, NOW);
    expect(await balance(productId)).toBe(3);
  });

  it('conteo posterior: 409 LATER_STOCK_CHECKS_FOUND con el detalle y sin escribir nada', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, 'Aceite 20W50');
    const other = await createProduct(tenant, 'Filtro');
    const counted = await count(tenant, productId, 10, AFTER_ARRIVAL);
    const before = await snapshot(tenant);

    const error = await rejection(
      receive(
        tenant,
        {
          occurredAt: ARRIVAL,
          lines: [
            { productId, quantity: 5 },
            { productId: other, quantity: 1 },
          ],
        },
        NOW,
      ),
    );

    expect(error.code).toBe('LATER_STOCK_CHECKS_FOUND');
    expect(error.getStatus()).toBe(409);
    expect(error.data).toEqual({
      products: [
        {
          productId,
          name: 'Aceite 20W50',
          unit: 'litro',
          balance: '10',
          checks: [
            {
              movementId: counted.id,
              type: 'COUNT',
              occurredAt: AFTER_ARRIVAL,
              countedQuantity: '10',
            },
          ],
        },
      ],
    });
    expect(await snapshot(tenant)).toBe(before);
  });

  it('SET_PHYSICAL: suma, ajusta hasta lo del estante y deja el ajuste visible y enlazado', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await count(tenant, productId, 10, AFTER_ARRIVAL);

    const result = await receive(
      tenant,
      {
        occurredAt: ARRIVAL,
        lines: [{ productId, quantity: 5, purchaseCost: 50 }],
        laterStockChecks: [{ productId, resolution: 'SET_PHYSICAL', physicalQuantity: 12 }],
      },
      NOW,
    );

    expect(await balance(productId)).toBe(12);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.type).toBe(InventoryMovementType.PURCHASE_IN);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]).toMatchObject({
      type: InventoryMovementType.ADJUSTMENT,
      refType: RECEIPT_REF_TYPE,
      refId: result.receipt.id,
      reason: `Regularización de recepción atrasada ${result.receipt.id}`,
    });
    expect(Number(result.adjustments[0]!.quantityDelta)).toBe(-3);
    expect(Number(result.adjustments[0]!.previousBalance)).toBe(15);
    expect(result.receipt.laterStockResolution).toEqual([
      expect.objectContaining({ productId, resolution: 'SET_PHYSICAL', physicalQuantity: '12' }),
    ]);

    // El ajuste no es una línea de compra: ni en el detalle, ni en la lista, ni en el resumen.
    const detail = await inventory.getReceipt(tenant.businessId, result.receipt.id);
    expect(detail.lines).toHaveLength(1);
    expect(detail.adjustments).toHaveLength(1);
    const page = await inventory.listReceipts(tenant.businessId, {});
    expect(page.items[0]!.lineCount).toBe(1);
    const summary = await inventory.receiptsMonthSummary(tenant.businessId, '2026-09', NOW);
    expect(summary).toMatchObject({ totalCost: '50.00', linesWithoutCost: 0 });
  });

  it('ADD_TO_STOCK: suma sobre el conteo, sin ajuste, y guarda la elección', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await count(tenant, productId, 10, AFTER_ARRIVAL);

    const result = await receive(
      tenant,
      {
        occurredAt: ARRIVAL,
        lines: [{ productId, quantity: 5 }],
        laterStockChecks: [{ productId, resolution: 'ADD_TO_STOCK' }],
      },
      NOW,
    );

    expect(await balance(productId)).toBe(15);
    expect(result.adjustments).toEqual([]);
    expect(result.receipt.laterStockResolution).toEqual([
      expect.objectContaining({ productId, resolution: 'ADD_TO_STOCK', physicalQuantity: null }),
    ]);
  });

  it('SET_PHYSICAL igual al saldo después de sumar: no crea ajuste', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await count(tenant, productId, 10, AFTER_ARRIVAL);

    const result = await receive(
      tenant,
      {
        occurredAt: ARRIVAL,
        lines: [{ productId, quantity: 5 }],
        laterStockChecks: [{ productId, resolution: 'SET_PHYSICAL', physicalQuantity: 15 }],
      },
      NOW,
    );

    expect(await balance(productId)).toBe(15);
    expect(result.adjustments).toEqual([]);
  });

  it('un ajuste (siempre con fecha de hoy) también cuenta como posterior', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await count(tenant, productId, 4, BEFORE_ARRIVAL);
    await inventory.adjustment(tenant.businessId, tenant.userId, {
      productId,
      physicalQuantity: 9,
      reason: 'Conteo físico distinto',
    });

    const error = await rejection(
      receive(tenant, { occurredAt: ARRIVAL, lines: [{ productId, quantity: 5 }] }),
    );
    expect(error.code).toBe('LATER_STOCK_CHECKS_FOUND');
    expect(
      (error.data as { products: { checks: { type: string }[] }[] }).products[0]!.checks.map(
        (c) => c.type,
      ),
    ).toEqual(['ADJUSTMENT']);
  });

  it('resolución que no coincide (o un conteo nuevo entre envíos): 409 MISMATCH sin escribir', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant);
    const b = await createProduct(tenant);
    await count(tenant, a, 10, AFTER_ARRIVAL);
    const input: ReceiptBatchInput = {
      occurredAt: ARRIVAL,
      lines: [
        { productId: a, quantity: 5 },
        { productId: b, quantity: 2 },
      ],
    };
    expect((await rejection(receive(tenant, input, NOW))).code).toBe('LATER_STOCK_CHECKS_FOUND');

    // Mientras el usuario decidía, alguien contó también b.
    await count(tenant, b, 7, AFTER_ARRIVAL);
    const before = await snapshot(tenant);
    const error = await rejection(
      receive(
        tenant,
        { ...input, laterStockChecks: [{ productId: a, resolution: 'ADD_TO_STOCK' }] },
        NOW,
      ),
    );
    expect(error.code).toBe('LATER_STOCK_CHECKS_MISMATCH');
    expect(
      (error.data as { products: { productId: string }[] }).products.map((p) => p.productId).sort(),
    ).toEqual([a, b].sort());
    expect(await snapshot(tenant)).toBe(before);

    // Con una opción por cada producto detectado, se registra.
    await receive(
      tenant,
      {
        ...input,
        laterStockChecks: [
          { productId: a, resolution: 'ADD_TO_STOCK' },
          { productId: b, resolution: 'SET_PHYSICAL', physicalQuantity: 9 },
        ],
      },
      NOW,
    );
    expect(await balance(a)).toBe(15);
    expect(await balance(b)).toBe(9);
  });

  it('resolución sin conteos detectados: 409 MISMATCH', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const error = await rejection(
      receive(
        tenant,
        {
          occurredAt: ARRIVAL,
          lines: [{ productId, quantity: 1 }],
          laterStockChecks: [{ productId, resolution: 'ADD_TO_STOCK' }],
        },
        NOW,
      ),
    );
    expect(error.code).toBe('LATER_STOCK_CHECKS_MISMATCH');
  });

  it('forma de la resolución: 400 por campo, antes de tocar la base', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const foreign = randomUUID();
    const error = await rejection(
      receive(tenant, {
        occurredAt: ARRIVAL,
        lines: [{ productId, quantity: 1 }],
        laterStockChecks: [
          { productId, resolution: 'SET_PHYSICAL' },
          { productId, resolution: 'ADD_TO_STOCK', physicalQuantity: 3 },
          { productId: foreign, resolution: 'ADD_TO_STOCK' },
        ],
      }),
    );
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.errors!.map((e) => e.field)).toEqual([
      'laterStockChecks.0.physicalQuantity',
      'laterStockChecks.1.productId',
      'laterStockChecks.1.physicalQuantity',
      'laterStockChecks.2.productId',
    ]);
  });
});

describe('Posible recepción duplicada (R8, DEC-96)', () => {
  it('misma combinación a ±3 días: 409 con la recepción parecida; con confirmación se guarda', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant);
    const b = await createProduct(tenant);
    const lines = [
      { productId: a, quantity: 5 },
      { productId: b, quantity: 2.5 },
    ];
    const first = await receive(tenant, { occurredAt: ARRIVAL, lines }, NOW);
    const before = await snapshot(tenant);

    const error = await rejection(
      receive(tenant, { occurredAt: '2026-09-17T10:00:00.000Z', lines: [...lines].reverse() }, NOW),
    );
    expect(error.code).toBe('POSSIBLE_DUPLICATE_RECEIPT');
    expect(error.data).toMatchObject({ receiptId: first.receipt.id, occurredAt: ARRIVAL });
    expect(await snapshot(tenant)).toBe(before);

    const second = await receive(
      tenant,
      { occurredAt: '2026-09-17T10:00:00.000Z', lines, acknowledgePossibleDuplicate: true },
      NOW,
    );
    expect(second.receipt.possibleDuplicateAcknowledged).toBe(true);
    expect(first.receipt.possibleDuplicateAcknowledged).toBeNull();
    expect(await balance(a)).toBe(10);
  });

  it('otra cantidad, otro producto o más de 3 días: no es un posible duplicado', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant);
    const b = await createProduct(tenant);
    await receive(tenant, { occurredAt: ARRIVAL, lines: [{ productId: a, quantity: 5 }] }, NOW);
    await receive(tenant, { occurredAt: ARRIVAL, lines: [{ productId: a, quantity: 6 }] }, NOW);
    await receive(
      tenant,
      {
        occurredAt: ARRIVAL,
        lines: [
          { productId: a, quantity: 5 },
          { productId: b, quantity: 1 },
        ],
      },
      NOW,
    );
    await receive(
      tenant,
      { occurredAt: '2026-09-19T15:00:01.000Z', lines: [{ productId: a, quantity: 5 }] },
      NOW,
    );
    expect(await balance(a)).toBe(21);
  });

  it('no cruza negocios: la misma recepción en otro negocio no es un duplicado', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const a = await createProduct(tenantA);
    const b = await createProduct(tenantB);
    await receive(tenantA, { occurredAt: ARRIVAL, lines: [{ productId: a, quantity: 5 }] }, NOW);
    await receive(tenantB, { occurredAt: ARRIVAL, lines: [{ productId: b, quantity: 5 }] }, NOW);
    // El producto de A no puede usarse desde B.
    const error = await rejection(
      receive(tenantB, { occurredAt: ARRIVAL, lines: [{ productId: a, quantity: 5 }] }, NOW),
    );
    expect(error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('concurrencia: dos recepciones iguales a la vez → una se guarda y la otra recibe 409', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        receive(tenant, { occurredAt: ARRIVAL, lines: [{ productId, quantity: 4 }] }, NOW),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0]!.reason as ProblemException).code).toBe('POSSIBLE_DUPLICATE_RECEIPT');
    expect(await balance(productId)).toBe(4);
    expect(await prisma.inventoryReceipt.count({ where: { businessId: tenant.businessId } })).toBe(
      1,
    );
  });

  it('concurrencia: un conteo que se confirma antes de la recepción atrasada se detecta', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const results = await Promise.allSettled([
      count(tenant, productId, 10, AFTER_ARRIVAL),
      receive(tenant, { occurredAt: ARRIVAL, lines: [{ productId, quantity: 5 }] }, NOW),
    ]);
    // Si la recepción bloqueó primero, sumó (5) y luego el conteo dejó 10;
    // si el conteo bloqueó primero, la recepción lo vio y se rechazó.
    const receipt = results[1];
    if (receipt.status === 'fulfilled') {
      expect(await balance(productId)).toBe(10);
    } else {
      expect((receipt.reason as ProblemException).code).toBe('LATER_STOCK_CHECKS_FOUND');
      expect(await balance(productId)).toBe(10);
      expect(
        await prisma.inventoryReceipt.count({ where: { businessId: tenant.businessId } }),
      ).toBe(0);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
