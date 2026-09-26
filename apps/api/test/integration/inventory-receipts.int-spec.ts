import { randomUUID } from 'node:crypto';
import { InventoryMovementType } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import {
  InventoryService,
  RECEIPT_REF_TYPE,
  type ReceiptBatchInput,
} from '../../src/inventory/inventory.service';
import { applyStockMovements } from '../../src/inventory/stock-ledger';
import { forBusiness } from '../../src/prisma/business-scope';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Recepción en lote (R3, BR-P6) contra Postgres real: lo que el fake no
 * puede probar (rollback de la transacción, concurrencia con el bloqueo de
 * filas del StockLedger e idempotencia con el unique real).
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas (incluida
 * `r3_inventory_receipts`). Cada corrida crea sus propios negocios.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan Postgres.',
  );
}
// Salvaguarda: estas pruebas escriben. Nunca contra una base que no sea de prueba.
if (!/\/[^/?]*_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test".');
}

const prisma = new PrismaService({
  get: () => url,
} as unknown as ConfigService<Env, true>);
const inventory = new InventoryService(prisma);
const idempotency = new IdempotencyService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R3 ${suffix}`, slug: `r3-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'R3',
      username: `r3-${suffix}`,
      passwordHash: 'no-se-usa',
    },
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
    });
  }
  return product.id;
}

async function stockOf(productId: string) {
  const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
  const sum = await prisma.inventoryMovement.aggregate({
    where: { productId },
    _sum: { quantityDelta: true },
    _count: true,
  });
  return {
    cached: Number(product.stockQuantity),
    sum: Number(sum._sum.quantityDelta ?? 0),
    movements: sum._count,
  };
}

async function receiptCount(tenant: Tenant) {
  return prisma.inventoryReceipt.count({ where: { businessId: tenant.businessId } });
}

function receive(tenant: Tenant, input: ReceiptBatchInput) {
  return inventory.createReceiptBatch(tenant.businessId, tenant.userId, input);
}

/**
 * Abre una transacción que descuenta stock (y con ello toma el FOR UPDATE
 * del producto) y no confirma hasta `release()`: fuerza que la recepción
 * empiece mientras otro tiene el bloqueo.
 */
async function holdLockWithUse(tenant: Tenant, productId: string, quantityDelta: number) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let signalLocked!: () => void;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));

  const done = forBusiness(prisma, tenant.businessId).$transaction(
    async (tx) => {
      await applyStockMovements(tx, {
        businessId: tenant.businessId,
        createdById: tenant.userId,
        policy: 'WARN',
        entries: [
          {
            productId,
            type: InventoryMovementType.MAINTENANCE_USE,
            quantityDelta,
            occurredAt: new Date(),
          },
        ],
      });
      signalLocked();
      await released;
    },
    { timeout: 30_000 },
  );
  await locked;
  return { release, done };
}

/** Espera hasta que alguna sesión esté bloqueada esperando un lock de fila. */
async function waitForLockWaiter() {
  for (let i = 0; i < 100; i++) {
    const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT COUNT(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (Number(row!.waiting) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Ninguna sesión quedó esperando el bloqueo del producto');
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeAll(async () => {
  await prisma.$connect();
  tenantA = await createTenant();
  tenantB = await createTenant();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Recepción en lote contra Postgres (R3)', () => {
  it('una línea: cabecera + PURCHASE_IN enlazado, y caché = suma', async () => {
    const productId = await createProduct(tenantA, 10);

    const { receipt, lines } = await receive(tenantA, {
      note: 'Reposición',
      lines: [{ productId, quantity: 6 }],
    });

    const stored = await prisma.inventoryReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(stored).toMatchObject({
      businessId: tenantA.businessId,
      createdById: tenantA.userId,
      note: 'Reposición',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: InventoryMovementType.PURCHASE_IN,
      refType: RECEIPT_REF_TYPE,
      refId: receipt.id,
    });
    expect(Number(lines[0]!.resultingBalance)).toBe(16);
    expect(await stockOf(productId)).toMatchObject({ cached: 16, sum: 16, movements: 2 });
  });

  it('varias líneas: un movimiento por producto con la misma referencia y fecha', async () => {
    const first = await createProduct(tenantA, 1);
    const second = await createProduct(tenantA);
    const third = await createProduct(tenantA, 0);
    const occurredAt = '2026-09-20T15:00:00.000Z';

    const { receipt } = await receive(tenantA, {
      occurredAt,
      lines: [
        { productId: first, quantity: 4 },
        { productId: second, quantity: 2.5 },
        { productId: third, quantity: 12 },
      ],
    });

    const lines = await prisma.inventoryMovement.findMany({
      where: { refType: RECEIPT_REF_TYPE, refId: receipt.id },
    });
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.type).toBe(InventoryMovementType.PURCHASE_IN);
      expect(line.businessId).toBe(tenantA.businessId);
      expect(line.occurredAt.toISOString()).toBe(occurredAt);
    }
    expect(receipt.occurredAt.toISOString()).toBe(occurredAt);
    expect(await stockOf(first)).toMatchObject({ cached: 5, sum: 5 });
    expect(await stockOf(second)).toMatchObject({ cached: 2.5, sum: 2.5 });
    expect(await stockOf(third)).toMatchObject({ cached: 12, sum: 12 });
  });

  describe('rollback atómico', () => {
    it('una línea con producto inactivo: ni cabecera, ni movimientos, ni saldos', async () => {
      const good = await createProduct(tenantA, 10);
      const inactive = await createProduct(tenantA, 3);
      await prisma.product.update({ where: { id: inactive }, data: { isActive: false } });
      const receiptsBefore = await receiptCount(tenantA);

      await expect(
        receive(tenantA, {
          lines: [
            { productId: good, quantity: 5 },
            { productId: inactive, quantity: 5 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE', status: 409 });

      expect(await receiptCount(tenantA)).toBe(receiptsBefore);
      expect(await stockOf(good)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
      expect(await stockOf(inactive)).toMatchObject({ cached: 3, sum: 3, movements: 1 });
    });

    it('una línea con producto inexistente: ni cabecera, ni movimientos, ni saldos', async () => {
      const good = await createProduct(tenantA, 10);
      const receiptsBefore = await receiptCount(tenantA);

      await expect(
        receive(tenantA, {
          lines: [
            { productId: good, quantity: 5 },
            { productId: randomUUID(), quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', status: 404 });

      expect(await receiptCount(tenantA)).toBe(receiptsBefore);
      expect(await stockOf(good)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
    });

    it('si falla la cabecera después de escribir las líneas, la transacción deshace movimientos y saldos', async () => {
      const productId = await createProduct(tenantA, 10);
      const id = randomUUID();
      await receive(tenantA, { id, lines: [{ productId, quantity: 1 }] });
      expect(await stockOf(productId)).toMatchObject({ cached: 11, movements: 2 });

      // Mismo id: el ledger ya escribió el movimiento y el saldo cuando el
      // insert de la cabecera choca con la clave primaria. Todo se revierte.
      await expect(receive(tenantA, { id, lines: [{ productId, quantity: 7 }] })).rejects.toThrow();

      expect(await stockOf(productId)).toMatchObject({ cached: 11, sum: 11, movements: 2 });
      const lines = await prisma.inventoryMovement.count({
        where: { refType: RECEIPT_REF_TYPE, refId: id },
      });
      expect(lines).toBe(1);
    });
  });

  describe('aislamiento entre negocios', () => {
    it('una línea con un producto de otro negocio rechaza el lote y no toca a ninguno', async () => {
      const own = await createProduct(tenantB, 5);
      const foreign = await createProduct(tenantA, 50);
      const receiptsBefore = await receiptCount(tenantB);

      await expect(
        receive(tenantB, {
          lines: [
            { productId: own, quantity: 1 },
            { productId: foreign, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });

      expect(await receiptCount(tenantB)).toBe(receiptsBefore);
      expect(await stockOf(own)).toMatchObject({ cached: 5, movements: 1 });
      expect(await stockOf(foreign)).toMatchObject({ cached: 50, movements: 1 });
    });

    it('otro negocio no ve la recepción ni sus líneas', async () => {
      const productId = await createProduct(tenantA, 1);
      const { receipt } = await receive(tenantA, { lines: [{ productId, quantity: 2 }] });

      const scopedB = forBusiness(prisma, tenantB.businessId);
      expect(await scopedB.inventoryReceipt.findFirst({ where: { id: receipt.id } })).toBeNull();
      expect(
        await scopedB.inventoryMovement.count({
          where: { refType: RECEIPT_REF_TYPE, refId: receipt.id },
        }),
      ).toBe(0);
    });
  });

  it('idempotencia: la misma Idempotency-Key, en paralelo y repetida, registra una sola recepción', async () => {
    const productId = await createProduct(tenantA, 1);
    const input: ReceiptBatchInput = { lines: [{ productId, quantity: 7 }] };
    const key = randomUUID();
    const run = () =>
      idempotency.run({
        businessId: tenantA.businessId,
        key,
        endpoint: 'inventory/receipts',
        requestHash: idempotency.hashRequest(input),
        handler: async () => ({
          status: 201,
          body: await receive(tenantA, input),
        }),
      });

    const parallel = await Promise.all([run(), run(), run()]);
    const replay = await run();

    const ids = new Set([...parallel, replay].map((r) => r.body.receipt.id));
    expect(ids.size).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(await stockOf(productId)).toMatchObject({ cached: 8, sum: 8, movements: 2 });
    expect(await prisma.inventoryReceipt.count({ where: { id: [...ids][0] } })).toBe(1);
  });

  describe('concurrencia', () => {
    it('espera el bloqueo de otra operación sobre el mismo producto y suma sobre su saldo confirmado', async () => {
      const productId = await createProduct(tenantA, 10);

      // T1 descuenta 4 y retiene el bloqueo sin confirmar.
      const holder = await holdLockWithUse(tenantA, productId, -4);
      const receipt = receive(tenantA, { lines: [{ productId, quantity: 5 }] });
      await waitForLockWaiter();

      holder.release();
      await holder.done;
      const { lines } = await receipt;

      // Parte de 6 (lo que dejó T1), no del 10 que había al empezar.
      expect(Number(lines[0]!.resultingBalance)).toBe(11);
      expect(await stockOf(productId)).toMatchObject({ cached: 11, sum: 11, movements: 3 });
    });

    it('recepciones y consumos simultáneos sobre los mismos productos no pierden actualizaciones', async () => {
      const first = await createProduct(tenantA, 100);
      const second = await createProduct(tenantA, 100);

      await Promise.all([
        // Órdenes de línea distintos: el ledger bloquea por id, sin deadlock.
        ...Array.from({ length: 3 }, () =>
          receive(tenantA, {
            lines: [
              { productId: first, quantity: 5 },
              { productId: second, quantity: 2 },
            ],
          }),
        ),
        ...Array.from({ length: 3 }, () =>
          receive(tenantA, {
            lines: [
              { productId: second, quantity: 1 },
              { productId: first, quantity: 1 },
            ],
          }),
        ),
        ...Array.from({ length: 4 }, () =>
          forBusiness(prisma, tenantA.businessId).$transaction((tx) =>
            applyStockMovements(tx, {
              businessId: tenantA.businessId,
              createdById: tenantA.userId,
              policy: 'WARN',
              entries: [
                {
                  productId: first,
                  type: InventoryMovementType.MAINTENANCE_USE,
                  quantityDelta: -2,
                  occurredAt: new Date(),
                },
              ],
            }),
          ),
        ),
      ]);

      // first: 100 + 3×5 + 3×1 − 4×2 = 110 · second: 100 + 3×2 + 3×1 = 109.
      expect(await stockOf(first)).toMatchObject({ cached: 110, sum: 110, movements: 11 });
      expect(await stockOf(second)).toMatchObject({ cached: 109, sum: 109, movements: 7 });
    });
  });
});

describe('Historial y detalle de recepciones contra Postgres (R3)', () => {
  it('lista vacía para un negocio sin recepciones', async () => {
    const tenant = await createTenant();

    await expect(inventory.listReceipts(tenant.businessId, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('más recientes primero; con la misma fecha desempata por id y el cursor no repite ni salta', async () => {
    const tenant = await createTenant();
    const product = await createProduct(tenant);
    const sameDate = '2026-09-22T10:00:00.000Z';
    const ids = Array.from({ length: 5 }, () => randomUUID());
    for (const id of ids) {
      await receive(tenant, {
        id,
        occurredAt: sameDate,
        lines: [{ productId: product, quantity: 1 }],
      });
    }
    const newest = await receive(tenant, {
      occurredAt: '2026-09-24T10:00:00.000Z',
      lines: [{ productId: product, quantity: 1 }],
    });
    const oldest = await receive(tenant, {
      occurredAt: '2026-09-01T10:00:00.000Z',
      lines: [{ productId: product, quantity: 1 }],
    });

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await inventory.listReceipts(tenant.businessId, { limit: 2, cursor });
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    const tied = [...ids].sort().reverse();
    expect(seen).toEqual([newest.receipt.id, ...tied, oldest.receipt.id]);
  });

  it('lineCount cuenta las líneas de cada recepción y no mezcla otros movimientos', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 5); // su COUNT no es una línea de recepción
    const b = await createProduct(tenant);
    const c = await createProduct(tenant);
    const three = await receive(tenant, {
      occurredAt: '2026-09-23T10:00:00.000Z',
      lines: [
        { productId: a, quantity: 1 },
        { productId: b, quantity: 2 },
        { productId: c, quantity: 3 },
      ],
    });
    const one = await receive(tenant, {
      occurredAt: '2026-09-22T10:00:00.000Z',
      lines: [{ productId: a, quantity: 1 }],
    });

    const page = await inventory.listReceipts(tenant.businessId, {});

    expect(page.items.map((r) => [r.id, r.lineCount])).toEqual([
      [three.receipt.id, 3],
      [one.receipt.id, 1],
    ]);
  });

  it('detalle con varias líneas: cabecera y sus PURCHASE_IN con el saldo resultante', async () => {
    const tenant = await createTenant();
    const a = await createProduct(tenant, 10);
    const b = await createProduct(tenant);
    const created = await receive(tenant, {
      note: 'Reposición semanal',
      lines: [
        { productId: b, quantity: 2.5 },
        { productId: a, quantity: 4 },
      ],
    });
    await receive(tenant, { lines: [{ productId: a, quantity: 1 }] }); // otra recepción

    const { receipt, lines } = await inventory.getReceipt(tenant.businessId, created.receipt.id);

    expect(receipt).toEqual(created.receipt);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.productId)).toEqual([a, b].sort());
    const byProduct = new Map(lines.map((l) => [l.productId, l]));
    expect(Number(byProduct.get(a)!.quantityDelta)).toBe(4);
    expect(Number(byProduct.get(a)!.resultingBalance)).toBe(14);
    expect(Number(byProduct.get(b)!.resultingBalance)).toBe(2.5);
    expect(
      lines.every(
        (l) =>
          l.type === InventoryMovementType.PURCHASE_IN &&
          l.refType === RECEIPT_REF_TYPE &&
          l.refId === created.receipt.id,
      ),
    ).toBe(true);
  });

  it('inexistente y de otro negocio: RECEIPT_NOT_FOUND; la lista no cruza negocios', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const productB = await createProduct(tenantB);
    const fromB = await receive(tenantB, { lines: [{ productId: productB, quantity: 1 }] });

    await expect(inventory.getReceipt(tenantA.businessId, randomUUID())).rejects.toMatchObject({
      code: 'RECEIPT_NOT_FOUND',
    });
    await expect(inventory.getReceipt(tenantA.businessId, fromB.receipt.id)).rejects.toMatchObject({
      code: 'RECEIPT_NOT_FOUND',
    });
    expect((await inventory.listReceipts(tenantA.businessId, {})).items).toEqual([]);
    expect((await inventory.listReceipts(tenantB.businessId, {})).items.map((r) => r.id)).toEqual([
      fromB.receipt.id,
    ]);
  });
});
