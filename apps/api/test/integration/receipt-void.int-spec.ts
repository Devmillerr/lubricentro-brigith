import { randomUUID } from 'node:crypto';
import { InventoryMovementType } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { ProblemException } from '../../src/common/exceptions/problem.exception';
import { InventoryService, RECEIPT_REF_TYPE } from '../../src/inventory/inventory.service';
import { applyStockMovements, type StockPolicy } from '../../src/inventory/stock-ledger';
import { forBusiness } from '../../src/prisma/business-scope';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SuppliersService } from '../../src/suppliers/suppliers.service';

/**
 * Anulación de recepciones (R8, DEC-97, BR-K6) contra Postgres real: atómica,
 * sin stock negativo, sin anular lo que ya se movió después, con concurrencia
 * contra ventas y otras anulaciones, y sin escrituras parciales al rechazar.
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
const suppliers = new SuppliersService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R8V ${suffix}`, slug: `r8v-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'R8V', username: `r8v-${suffix}`, passwordHash: 'x' },
  });
  return { businessId: business.id, userId: user.id };
}

async function createProduct(tenant: Tenant, counted?: number): Promise<string> {
  const product = await prisma.product.create({
    data: { businessId: tenant.businessId, name: `Aceite ${randomUUID()}`, unit: 'litro' },
  });
  if (counted !== undefined) {
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: counted,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return product.id;
}

function receive(tenant: Tenant, lines: { productId: string; quantity: number }[], extra = {}) {
  return inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
    lines,
    acknowledgePossibleDuplicate: true,
    ...extra,
  });
}

function voidIt(tenant: Tenant, receiptId: string, reason = 'Error de registro') {
  return inventory.voidReceipt(tenant.businessId, tenant.userId, receiptId, reason);
}

/** Salida de stock como la registra una venta o un mantenimiento. */
function consume(
  tenant: Tenant,
  productId: string,
  quantity: number,
  type: InventoryMovementType = InventoryMovementType.SALE,
  policy: StockPolicy = 'BLOCK',
) {
  return forBusiness(prisma, tenant.businessId).$transaction((tx) =>
    applyStockMovements(tx, {
      businessId: tenant.businessId,
      createdById: tenant.userId,
      policy,
      entries: [{ productId, type, quantityDelta: -quantity, occurredAt: new Date() }],
    }),
  );
}

async function stock(productId: string) {
  const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
  const sum = await prisma.inventoryMovement.aggregate({
    where: { productId },
    _sum: { quantityDelta: true },
  });
  return { cached: Number(product.stockQuantity), sum: Number(sum._sum.quantityDelta ?? 0) };
}

async function snapshot(tenant: Tenant) {
  const [movements, receipts, products] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.inventoryReceipt.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.product.findMany({
      where: { businessId: tenant.businessId },
      select: { id: true, stockQuantity: true },
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

describe('Anular una recepción (R8, DEC-97)', () => {
  it('recepción de 3 líneas sin movimientos posteriores: PURCHASE_VOID por línea y stock restituido', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 2);
    const b = await createProduct(tenant);
    const c = await createProduct(tenant, 0);
    const { receipt } = await receive(tenant, [
      { productId: a, quantity: 4 },
      { productId: b, quantity: 2.5 },
      { productId: c, quantity: 12 },
    ]);

    const result = await voidIt(tenant, receipt.id, '  Se registró dos veces  ');

    expect(result.receipt).toMatchObject({
      voidedById: tenant.userId,
      voidReason: 'Se registró dos veces',
    });
    expect(result.receipt.voidedAt).not.toBeNull();
    expect(result.lines).toHaveLength(3);
    expect(result.voids).toHaveLength(3);
    for (const v of result.voids!) {
      expect(v).toMatchObject({
        type: InventoryMovementType.PURCHASE_VOID,
        refType: RECEIPT_REF_TYPE,
        refId: receipt.id,
        reason: 'Se registró dos veces',
      });
    }
    expect(await stock(a)).toEqual({ cached: 2, sum: 2 });
    expect(await stock(b)).toEqual({ cached: 0, sum: 0 });
    expect(await stock(c)).toEqual({ cached: 0, sum: 0 });
    // El PURCHASE_IN original sigue intacto.
    expect(result.lines.map((l) => Number(l.quantityDelta)).sort()).toEqual([12, 2.5, 4].sort());
  });

  it('venta posterior: 409 RECEIPT_HAS_LATER_MOVEMENTS con la lista y sin escribir nada', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 10);
    const { receipt } = await receive(tenant, [{ productId: a, quantity: 5 }]);
    await consume(tenant, a, 1);
    const before = await snapshot(tenant);

    const error = await rejection(voidIt(tenant, receipt.id));
    expect(error.code).toBe('RECEIPT_HAS_LATER_MOVEMENTS');
    expect((error.data as { movements: { type: string; productId: string }[] }).movements).toEqual([
      expect.objectContaining({ type: 'SALE', productId: a }),
    ]);
    expect(await snapshot(tenant)).toBe(before);
  });

  it.each([['COUNT'], ['ADJUSTMENT'], ['MAINTENANCE_USE']] as const)(
    '%s posterior también bloquea la anulación',
    async (type) => {
      const tenant = await createTenant();
      const a = await createProduct(tenant, 10);
      const { receipt } = await receive(tenant, [{ productId: a, quantity: 5 }]);
      if (type === 'COUNT') {
        await inventory.count(tenant.businessId, tenant.userId, {
          productId: a,
          countedQuantity: 15,
        });
      } else if (type === 'ADJUSTMENT') {
        await inventory.adjustment(tenant.businessId, tenant.userId, {
          productId: a,
          physicalQuantity: 14,
          reason: 'Producto dañado',
        });
      } else {
        await consume(tenant, a, 1, InventoryMovementType.MAINTENANCE_USE, 'WARN');
      }
      const before = await snapshot(tenant);
      expect((await rejection(voidIt(tenant, receipt.id))).code).toBe(
        'RECEIPT_HAS_LATER_MOVEMENTS',
      );
      expect(await snapshot(tenant)).toBe(before);
    },
  );

  it('una recepción posterior del mismo producto no bloquea; una venta anterior tampoco', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 10);
    await consume(tenant, a, 2);
    const { receipt } = await receive(tenant, [{ productId: a, quantity: 5 }]);
    await receive(tenant, [{ productId: a, quantity: 3 }]);
    await voidIt(tenant, receipt.id);
    expect(await stock(a)).toEqual({ cached: 11, sum: 11 });
  });

  it('dejaría stock negativo (producto sin conteo): 409 con el detalle y sin escribir nada', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant);
    // Sin conteo, la venta se registra aunque el saldo quede negativo (DEC-27).
    await consume(tenant, a, 4, InventoryMovementType.SALE, 'WARN');
    const { receipt } = await receive(tenant, [{ productId: a, quantity: 3 }]);
    const before = await snapshot(tenant);

    const error = await rejection(voidIt(tenant, receipt.id));
    expect(error.code).toBe('RECEIPT_VOID_NEGATIVE_STOCK');
    expect(error.data).toEqual({
      products: [
        expect.objectContaining({
          productId: a,
          balance: '-1',
          received: '3',
          resultingBalance: '-4',
        }),
      ],
    });
    expect(await snapshot(tenant)).toBe(before);
  });

  it('recepción anterior a R8 (líneas sin ledgerSeq): 409 RECEIPT_PREDATES_AUDIT', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 1);
    const { receipt } = await receive(tenant, [{ productId: a, quantity: 2 }]);
    await prisma.inventoryMovement.updateMany({
      where: { refType: RECEIPT_REF_TYPE, refId: receipt.id },
      data: { ledgerSeq: null, recordedAt: null },
    });
    const before = await snapshot(tenant);
    expect((await rejection(voidIt(tenant, receipt.id))).code).toBe('RECEIPT_PREDATES_AUDIT');
    expect(await snapshot(tenant)).toBe(before);
  });

  it('con ajuste de regularización (recepción atrasada con SET_PHYSICAL): no se anula', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant);
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: a,
      countedQuantity: 10,
      occurredAt: '2026-09-20T15:00:00.000Z',
    });
    const { receipt } = await inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      occurredAt: '2026-09-15T15:00:00.000Z',
      lines: [{ productId: a, quantity: 5 }],
      laterStockChecks: [{ productId: a, resolution: 'SET_PHYSICAL', physicalQuantity: 12 }],
    });
    expect((await rejection(voidIt(tenant, receipt.id))).code).toBe('RECEIPT_HAS_LATER_MOVEMENTS');
  });

  it('motivo corto: 400; inexistente u otro negocio: 404; anular dos veces: 409', async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const a = await createProduct(tenant, 1);
    const { receipt } = await receive(tenant, [{ productId: a, quantity: 2 }]);

    expect((await rejection(voidIt(tenant, receipt.id, ' x '))).code).toBe('VALIDATION_ERROR');
    expect((await rejection(voidIt(other, receipt.id))).code).toBe('RECEIPT_NOT_FOUND');
    expect((await rejection(voidIt(tenant, randomUUID()))).code).toBe('RECEIPT_NOT_FOUND');
    await voidIt(tenant, receipt.id);
    const again = await rejection(voidIt(tenant, receipt.id));
    expect(again.code).toBe('RECEIPT_ALREADY_VOIDED');
    expect(await stock(a)).toEqual({ cached: 1, sum: 1 });
  });

  it('la anulada sale del resumen del mes y su comprobante queda libre', async () => {
    const tenant = await createTenant();
    const supplier = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P' });
    const a = await createProduct(tenant, 0);
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const { receipt } = await inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      supplierId: supplier.id,
      documentRef: 'F-1',
      lines: [{ productId: a, quantity: 2, purchaseCost: 40 }],
    });
    await voidIt(tenant, receipt.id);
    const summary = await inventory.receiptsMonthSummary(tenant.businessId, month);
    expect(summary).toMatchObject({ receiptCount: 0, totalCost: '0.00', products: [] });
    await inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      supplierId: supplier.id,
      documentRef: 'F-1',
      lines: [{ productId: a, quantity: 2, purchaseCost: 40 }],
    });
  });
});

describe('Anulación concurrente (R8, DEC-97)', () => {
  it('dos anulaciones a la vez: una anula y la otra recibe 409; el stock baja una sola vez', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 1);
    const { receipt } = await receive(tenant, [{ productId: a, quantity: 5 }]);
    const results = await Promise.allSettled([
      voidIt(tenant, receipt.id),
      voidIt(tenant, receipt.id),
    ]);
    const failed = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((failed[0]!.reason as ProblemException).code).toBe('RECEIPT_ALREADY_VOIDED');
    expect(await stock(a)).toEqual({ cached: 1, sum: 1 });
    expect(
      await prisma.inventoryMovement.count({
        where: { productId: a, type: InventoryMovementType.PURCHASE_VOID },
      }),
    ).toBe(1);
  });

  it('una venta con el producto bloqueado antes que la anulación: la anulación la ve y se rechaza', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 0);
    const { receipt } = await receive(tenant, [{ productId: a, quantity: 5 }]);

    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let signal!: () => void;
    const locked = new Promise<void>((resolve) => (signal = resolve));
    const sale = forBusiness(prisma, tenant.businessId).$transaction(
      async (tx) => {
        await applyStockMovements(tx, {
          businessId: tenant.businessId,
          createdById: tenant.userId,
          policy: 'BLOCK',
          entries: [
            {
              productId: a,
              type: InventoryMovementType.SALE,
              quantityDelta: -2,
              occurredAt: new Date(),
            },
          ],
        });
        signal();
        await released;
      },
      { timeout: 30_000 },
    );
    await locked;
    const voiding = voidIt(tenant, receipt.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await sale;

    expect((await rejection(voiding)).code).toBe('RECEIPT_HAS_LATER_MOVEMENTS');
    expect(await stock(a)).toEqual({ cached: 3, sum: 3 });
  });

  it('anulación y venta en carrera: nunca stock negativo ni actualizaciones perdidas', async () => {
    for (let round = 0; round < 5; round++) {
      const tenant = await createTenant();
      const a = await createProduct(tenant, 0);
      const { receipt } = await receive(tenant, [{ productId: a, quantity: 5 }]);
      const [voided, sold] = await Promise.allSettled([
        voidIt(tenant, receipt.id),
        consume(tenant, a, 3),
      ]);
      const final = await stock(a);
      expect(final.cached).toBe(final.sum);
      expect(final.cached).toBeGreaterThanOrEqual(0);
      if (voided.status === 'fulfilled') {
        // La anulación ganó: la venta vio 0 y la política BLOCK la rechazó.
        expect(sold.status).toBe('rejected');
        expect(final.cached).toBe(0);
      } else {
        // La venta ganó: la anulación la vio y se rechazó sin escribir.
        expect((voided.reason as ProblemException).code).toBe('RECEIPT_HAS_LATER_MOVEMENTS');
        expect(sold.status).toBe('fulfilled');
        expect(final.cached).toBe(2);
      }
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
