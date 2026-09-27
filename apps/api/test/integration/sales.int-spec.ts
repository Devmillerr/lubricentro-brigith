import { randomUUID } from 'node:crypto';
import { InventoryMovementType, PaymentMethod, Prisma, SaleStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { applyStockMovements } from '../../src/inventory/stock-ledger';
import { forBusiness } from '../../src/prisma/business-scope';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  SALE_IDEMPOTENCY_ENDPOINT,
  SALE_REF_TYPE,
  SalesService,
  saleVoidIdempotencyEndpoint,
  type CreateSaleInput,
} from '../../src/sales/sales.service';

/**
 * Ventas de mostrador (R4) contra Postgres real: lo que el fake y el e2e no
 * demuestran. Rollback real ante un id repetido (T4), anulación concurrente
 * (T3), el orden de bloqueos del StockLedger con ventas y anulaciones sobre
 * los mismos productos, aislamiento de transacciones en READ COMMITTED y las
 * invariantes de caché y stock al final.
 *
 * Para detener una venta real a mitad de camino sin tocar el código, se
 * aprovecha el orden de escritura de `SalesService.create`: una línea de un
 * producto con `tracksStock = false` no pasa por el ledger, pero su
 * `SaleLine` pide `FOR KEY SHARE` sobre el producto (la FK). Si la prueba
 * retiene `FOR UPDATE` sobre ese producto, la venta queda esperando después
 * de escribir el `SALE`, el saldo, la cabecera y las líneas anteriores.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas (incluida
 * `r4_sales`). Cada corrida crea sus propios negocios.
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
const sales = new SalesService(prisma);
const idempotency = new IdempotencyService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R4 ${suffix}`, slug: `r4-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'R4',
      username: `r4-${suffix}`,
      passwordHash: 'no-se-usa',
    },
  });
  return { businessId: business.id, userId: user.id };
}

async function createProduct(
  tenant: Tenant,
  options: { counted?: number; tracksStock?: boolean } = {},
): Promise<string> {
  const product = await prisma.product.create({
    data: {
      businessId: tenant.businessId,
      name: `Aceite ${randomUUID()}`,
      unit: 'litro',
      tracksStock: options.tracksStock ?? true,
    },
  });
  if (options.counted !== undefined) {
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: options.counted,
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

/** Lo que una venta dejó en la base: cabecera, líneas y movimientos enlazados. */
async function traceOf(saleId: string) {
  const [sale, lines, movements] = await Promise.all([
    prisma.sale.findFirst({ where: { id: saleId } }),
    prisma.saleLine.count({ where: { saleId } }),
    prisma.inventoryMovement.findMany({ where: { refType: SALE_REF_TYPE, refId: saleId } }),
  ]);
  return {
    sale,
    lines,
    sales: movements.filter((m) => m.type === InventoryMovementType.SALE).length,
    voids: movements.filter((m) => m.type === InventoryMovementType.SALE_VOID).length,
  };
}

function sell(tenant: Tenant, lines: CreateSaleInput['lines'], id?: string) {
  return sales.create(tenant.businessId, tenant.userId, {
    ...(id ? { id } : {}),
    paymentMethod: PaymentMethod.CASH,
    lines,
  });
}

function voidSale(tenant: Tenant, saleId: string, reason = 'Cliente devolvió') {
  return sales.void(tenant.businessId, tenant.userId, saleId, { reason });
}

/** Solo rechazos con estos códigos: un deadlock (40P01/P2034) o cualquier otro error falla. */
function expectRejectedWith(results: PromiseSettledResult<unknown>[], code: string) {
  for (const result of results) {
    if (result.status === 'rejected') {
      expect(result.reason).toMatchObject({ code });
    }
  }
}

/**
 * Transacción de prueba que toma `FOR UPDATE` sobre un producto y no
 * confirma hasta `release()`. `release(action)` corre `action` dentro de la
 * misma transacción antes de confirmar (p. ej. borrar el producto).
 */
async function holdProductLock(productId: string) {
  type Action = (tx: Prisma.TransactionClient) => Promise<unknown>;
  let release!: (action?: Action) => void;
  const released = new Promise<Action | undefined>((resolve) => (release = resolve));
  let signalLocked!: () => void;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));

  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "products" WHERE "id" = ${productId}::text FOR UPDATE`;
      signalLocked();
      const action = await released;
      if (action) await action(tx);
    },
    { timeout: 30_000 },
  );
  await locked;
  return { release, done };
}

/** Como el de R1/R3: aplica un movimiento (toma el FOR UPDATE) y no confirma hasta `release()`. */
async function holdLockWithMovement(
  tenant: Tenant,
  productId: string,
  type: InventoryMovementType,
  quantityDelta: number,
) {
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
        entries: [{ productId, type, quantityDelta, occurredAt: new Date() }],
      });
      signalLocked();
      await released;
    },
    { timeout: 30_000 },
  );
  await locked;
  return { release, done };
}

/** Sentencias de esta base que esperan un lock de fila. */
async function lockWaiters() {
  return prisma.$queryRaw<{ query: string }[]>`
    SELECT query FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`;
}

async function waitForLockWaiters(count: number) {
  for (let i = 0; i < 100; i++) {
    if ((await lockWaiters()).length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`No quedaron ${count} sesiones esperando un bloqueo`);
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

describe('Ventas contra Postgres (R4)', () => {
  describe('T4: id o clave repetidos, sin efectos parciales', () => {
    it('un id de venta repetido: P2002 y se revierten el SALE y el saldo que el ledger ya había escrito', async () => {
      const first = await createProduct(tenantA, { counted: 10 });
      const second = await createProduct(tenantA, { counted: 10 });
      const id = randomUUID();
      await sell(tenantA, [{ productId: first, quantity: 1, unitPrice: 30 }], id);

      // El ledger escribe los dos SALE y los saldos antes de que el insert de
      // la cabecera choque con la clave primaria: todo debe revertirse.
      await expect(
        sell(
          tenantA,
          [
            { productId: first, quantity: 2, unitPrice: 30 },
            { productId: second, quantity: 3, unitPrice: 18 },
          ],
          id,
        ),
      ).rejects.toMatchObject({ code: 'P2002' });

      expect(await stockOf(first)).toMatchObject({ cached: 9, sum: 9, movements: 2 });
      expect(await stockOf(second)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
      const trace = await traceOf(id);
      expect(trace).toMatchObject({ lines: 1, sales: 1, voids: 0 });
      expect(trace.sale!.total.toString()).toBe('30');
    });

    it('el id de una venta de otro negocio: falla igual, sin tocar a ninguno de los dos', async () => {
      const ownA = await createProduct(tenantA, { counted: 5 });
      const ownB = await createProduct(tenantB, { counted: 5 });
      const id = randomUUID();
      await sell(tenantA, [{ productId: ownA, quantity: 1, unitPrice: 10 }], id);

      await expect(
        sell(tenantB, [{ productId: ownB, quantity: 1, unitPrice: 10 }], id),
      ).rejects.toMatchObject({ code: 'P2002' });

      expect(await stockOf(ownB)).toMatchObject({ cached: 5, sum: 5, movements: 1 });
      expect(await stockOf(ownA)).toMatchObject({ cached: 4, sum: 4, movements: 2 });
      const trace = await traceOf(id);
      expect(trace.sale!.businessId).toBe(tenantA.businessId);
      expect(trace).toMatchObject({ lines: 1, sales: 1 });
      expect(await prisma.saleLine.count({ where: { businessId: tenantB.businessId } })).toBe(0);
    });

    it('otra Idempotency-Key con el mismo id: falla, libera su clave y la clave original sigue repitiendo la venta', async () => {
      const productId = await createProduct(tenantA, { counted: 10 });
      const input: CreateSaleInput = {
        id: randomUUID(),
        paymentMethod: PaymentMethod.YAPE,
        lines: [{ productId, quantity: 2, unitPrice: 25 }],
      };
      const run = (key: string) =>
        idempotency.run({
          businessId: tenantA.businessId,
          key,
          endpoint: SALE_IDEMPOTENCY_ENDPOINT,
          requestHash: idempotency.hashRequest(input),
          handler: async () => ({
            status: 201,
            body: await sales.create(tenantA.businessId, tenantA.userId, input),
          }),
        });

      const original = randomUUID();
      const other = randomUUID();
      await run(original);
      await expect(run(other)).rejects.toMatchObject({ code: 'P2002' });

      // La clave fallida no queda reservada ni "en curso".
      expect(
        await prisma.idempotencyRecord.count({
          where: { businessId: tenantA.businessId, key: other },
        }),
      ).toBe(0);
      const replay = await run(original);
      expect(replay.replayed).toBe(true);
      expect(replay.body.sale.id).toBe(input.id);
      expect(await stockOf(productId)).toMatchObject({ cached: 8, sum: 8, movements: 2 });
      expect(await traceOf(input.id!)).toMatchObject({ lines: 1, sales: 1 });
    });

    it('la misma Idempotency-Key en paralelo y repetida: una venta y el stock baja una vez; con otro cuerpo, 409 sin efectos', async () => {
      const first = await createProduct(tenantA, { counted: 10 });
      const second = await createProduct(tenantA, { tracksStock: false });
      const input: CreateSaleInput = {
        paymentMethod: PaymentMethod.CASH,
        lines: [
          { productId: first, quantity: 3, unitPrice: 20 },
          { productId: second, quantity: 1, unitPrice: 5 },
        ],
      };
      const key = randomUUID();
      const run = (body: CreateSaleInput) =>
        idempotency.run({
          businessId: tenantA.businessId,
          key,
          endpoint: SALE_IDEMPOTENCY_ENDPOINT,
          requestHash: idempotency.hashRequest(body),
          handler: async () => ({
            status: 201,
            body: await sales.create(tenantA.businessId, tenantA.userId, body),
          }),
        });

      const parallel = await Promise.all([run(input), run(input), run(input)]);
      const replay = await run(input);

      const ids = new Set([...parallel, replay].map((r) => r.body.sale.id));
      expect(ids.size).toBe(1);
      expect(replay.replayed).toBe(true);
      const [saleId] = [...ids];
      expect(await traceOf(saleId!)).toMatchObject({ lines: 2, sales: 1 });
      expect(await stockOf(first)).toMatchObject({ cached: 7, sum: 7, movements: 2 });

      await expect(run({ ...input, paymentMethod: PaymentMethod.YAPE })).rejects.toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
      expect(await stockOf(first)).toMatchObject({ cached: 7, sum: 7, movements: 2 });
      expect(
        await prisma.sale.count({
          where: { businessId: tenantA.businessId, id: { in: [...ids] } },
        }),
      ).toBe(1);
    });
  });

  describe('anulación concurrente de la misma venta (T3)', () => {
    it('seis anulaciones simultáneas con claves distintas: una sola transición ACTIVE → VOIDED, el resto 409, sin deadlock', async () => {
      const first = await createProduct(tenantA, { counted: 10 });
      const second = await createProduct(tenantA, { counted: 10 });
      const untracked = await createProduct(tenantA, { tracksStock: false });
      const { sale } = await sell(tenantA, [
        { productId: second, quantity: 2, unitPrice: 10 },
        { productId: first, quantity: 3, unitPrice: 10 },
        { productId: untracked, quantity: 1, unitPrice: 5 },
      ]);

      const reasons = Array.from({ length: 6 }, (_, i) => `Motivo ${i}`);
      const results = await Promise.allSettled(
        reasons.map((reason) => voidSale(tenantA, sale.id, reason)),
      );

      const ok = results.filter((r) => r.status === 'fulfilled');
      expect(ok).toHaveLength(1);
      expectRejectedWith(results, 'SALE_ALREADY_VOIDED');

      const winner = reasons[results.findIndex((r) => r.status === 'fulfilled')];
      const trace = await traceOf(sale.id);
      expect(trace.sale).toMatchObject({
        status: SaleStatus.VOIDED,
        voidReason: winner,
        voidedById: tenantA.userId,
      });
      expect(trace).toMatchObject({ sales: 2, voids: 2 });
      expect(await stockOf(first)).toMatchObject({ cached: 10, sum: 10, movements: 3 });
      expect(await stockOf(second)).toMatchObject({ cached: 10, sum: 10, movements: 3 });
      expect(await stockOf(untracked)).toMatchObject({ cached: 0, movements: 0 });
    });

    it('intercalado forzado: mientras la primera espera el producto, nadie ve VOIDED; la segunda espera la fila y al final recibe 409', async () => {
      const productId = await createProduct(tenantA, { counted: 10 });
      const { sale } = await sell(tenantA, [{ productId, quantity: 2, unitPrice: 10 }]);

      // Con el producto retenido, la primera anulación marca la venta (sin
      // confirmar) y queda esperando en el ledger; la segunda espera la fila
      // de la venta; una venta nueva del mismo producto espera también.
      const holder = await holdProductLock(productId);
      const voids = [voidSale(tenantA, sale.id, 'Primera'), voidSale(tenantA, sale.id, 'Segunda')];
      const another = sell(tenantA, [{ productId, quantity: 1, unitPrice: 10 }]);
      await waitForLockWaiters(3);

      // READ COMMITTED: fuera de esas transacciones la venta sigue ACTIVE y el stock intacto.
      const during = await traceOf(sale.id);
      expect(during.sale).toMatchObject({ status: SaleStatus.ACTIVE, voidedAt: null });
      expect(during.voids).toBe(0);
      expect(await stockOf(productId)).toMatchObject({ cached: 8, sum: 8 });

      holder.release();
      await holder.done;
      const results = await Promise.allSettled([...voids, another]);

      expect(results[2]!.status).toBe('fulfilled');
      expect(results.slice(0, 2).filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expectRejectedWith(results, 'SALE_ALREADY_VOIDED');
      expect(await traceOf(sale.id)).toMatchObject({ sales: 1, voids: 1 });
      // 10 − 2 (venta) + 2 (anulación) − 1 (venta nueva).
      expect(await stockOf(productId)).toMatchObject({ cached: 9, sum: 9, movements: 4 });
    });

    it('la misma Idempotency-Key de anulación en paralelo: una sola anulación y las demás la repiten', async () => {
      const productId = await createProduct(tenantA, { counted: 10 });
      const { sale } = await sell(tenantA, [{ productId, quantity: 4, unitPrice: 10 }]);
      const dto = { reason: 'Error de cobro' };
      const key = randomUUID();
      const run = () =>
        idempotency.run({
          businessId: tenantA.businessId,
          key,
          endpoint: saleVoidIdempotencyEndpoint(sale.id),
          requestHash: idempotency.hashRequest(dto),
          handler: async () => ({
            status: 200,
            body: await sales.void(tenantA.businessId, tenantA.userId, sale.id, dto),
          }),
        });

      const results = await Promise.all([run(), run(), run()]);

      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      // El replay viene del JSON guardado: la fecha llega como string.
      const voidedAts = results.map((r) => new Date(r.body.voidedAt!).toISOString());
      expect(new Set(voidedAts).size).toBe(1);
      expect(await traceOf(sale.id)).toMatchObject({ sales: 1, voids: 1 });
      expect(await stockOf(productId)).toMatchObject({ cached: 10, sum: 10, movements: 3 });
    });
  });

  describe('ventas concurrentes sobre los mismos productos (StockLedger)', () => {
    it('espera el bloqueo y evalúa BLOCK contra el saldo confirmado: entra stock mientras espera y la venta pasa', async () => {
      const productId = await createProduct(tenantA, { counted: 2 });

      const holder = await holdLockWithMovement(
        tenantA,
        productId,
        InventoryMovementType.PURCHASE_IN,
        5,
      );
      const sale = sell(tenantA, [{ productId, quantity: 6, unitPrice: 10 }]);
      await waitForLockWaiters(1);

      holder.release();
      await holder.done;
      const { sale: created } = await sale;

      // Contra el 2 que había al empezar habría sido 422.
      const [movement] = await prisma.inventoryMovement.findMany({
        where: { refType: SALE_REF_TYPE, refId: created.id },
      });
      expect(Number(movement!.resultingBalance)).toBe(1);
      expect(await stockOf(productId)).toMatchObject({ cached: 1, sum: 1, movements: 3 });
    });

    it('y al revés: se consume mientras espera y la venta recibe 422 contra el saldo confirmado, sin tocar la otra línea', async () => {
      const scarce = await createProduct(tenantA, { counted: 3 });
      const other = await createProduct(tenantA, { counted: 10 });

      const holder = await holdLockWithMovement(
        tenantA,
        scarce,
        InventoryMovementType.MAINTENANCE_USE,
        -2,
      );
      const id = randomUUID();
      const sale = sell(
        tenantA,
        [
          { productId: other, quantity: 1, unitPrice: 10 },
          { productId: scarce, quantity: 2, unitPrice: 10 },
        ],
        id,
      );
      await waitForLockWaiters(1);

      holder.release();
      await holder.done;
      await expect(sale).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 422 });

      expect(await traceOf(id)).toMatchObject({ sale: null, lines: 0, sales: 0 });
      expect(await stockOf(scarce)).toMatchObject({ cached: 1, sum: 1, movements: 2 });
      expect(await stockOf(other)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
    });

    it('ventas simultáneas con BLOCK sobre un producto escaso: nunca queda negativo y los rechazos no dejan nada', async () => {
      const scarce = await createProduct(tenantA, { counted: 5 });
      const plenty = await createProduct(tenantA, { counted: 100 });
      const ids = Array.from({ length: 8 }, () => randomUUID());

      const results = await Promise.allSettled(
        ids.map((id, i) =>
          sell(
            tenantA,
            // Órdenes de línea distintos: el ledger bloquea por id, sin deadlock.
            i % 2 === 0
              ? [
                  { productId: scarce, quantity: 1, unitPrice: 10 },
                  { productId: plenty, quantity: 1, unitPrice: 10 },
                ]
              : [
                  { productId: plenty, quantity: 1, unitPrice: 10 },
                  { productId: scarce, quantity: 1, unitPrice: 10 },
                ],
            id,
          ),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expectRejectedWith(results, 'INSUFFICIENT_STOCK');
      for (const [i, result] of results.entries()) {
        const trace = await traceOf(ids[i]!);
        if (result.status === 'fulfilled') {
          expect(trace).toMatchObject({ lines: 2, sales: 2 });
        } else {
          expect(trace).toMatchObject({ sale: null, lines: 0, sales: 0 });
        }
      }
      expect(await stockOf(scarce)).toMatchObject({ cached: 0, sum: 0, movements: 6 });
      expect(await stockOf(plenty)).toMatchObject({ cached: 95, sum: 95, movements: 6 });
    });

    it('ventas, anulaciones, recepciones y consumos cruzados sobre los mismos productos: sin deadlock ni actualizaciones perdidas', async () => {
      const first = await createProduct(tenantA, { counted: 100 });
      const second = await createProduct(tenantA, { counted: 100 });

      for (let round = 0; round < 3; round++) {
        const toVoid = await Promise.all(
          Array.from({ length: 3 }, () =>
            sell(tenantA, [
              { productId: first, quantity: 2, unitPrice: 10 },
              { productId: second, quantity: 1, unitPrice: 10 },
            ]),
          ),
        );

        // Nueve transacciones a la vez (el pool tiene 10 conexiones).
        await Promise.all([
          ...toVoid.map(({ sale }) => voidSale(tenantA, sale.id)),
          ...Array.from({ length: 2 }, () =>
            sell(tenantA, [
              { productId: first, quantity: 1, unitPrice: 10 },
              { productId: second, quantity: 1, unitPrice: 10 },
            ]),
          ),
          ...Array.from({ length: 2 }, () =>
            sell(tenantA, [
              { productId: second, quantity: 1, unitPrice: 10 },
              { productId: first, quantity: 1, unitPrice: 10 },
            ]),
          ),
          inventory.createReceiptBatch(tenantA.businessId, tenantA.userId, {
            lines: [
              { productId: second, quantity: 5 },
              { productId: first, quantity: 5 },
            ],
          }),
          forBusiness(prisma, tenantA.businessId).$transaction((tx) =>
            applyStockMovements(tx, {
              businessId: tenantA.businessId,
              createdById: tenantA.userId,
              policy: 'WARN',
              entries: [
                {
                  productId: first,
                  type: InventoryMovementType.MAINTENANCE_USE,
                  quantityDelta: -3,
                  occurredAt: new Date(),
                },
              ],
            }),
          ),
        ]);
      }

      // Por ronda: first −6 +6 −4 +5 −3 = −2; second −3 +3 −4 +5 = +1.
      expect(await stockOf(first)).toMatchObject({ cached: 94, sum: 94 });
      expect(await stockOf(second)).toMatchObject({ cached: 103, sum: 103 });
    });
  });

  describe('aislamiento transaccional', () => {
    it('las transacciones de venta corren en READ COMMITTED (lo que asumen el ledger y la anulación)', async () => {
      const [row] = await forBusiness(prisma, tenantA.businessId).$transaction(
        (tx) =>
          tx.$queryRaw<
            { level: string }[]
          >`SELECT current_setting('transaction_isolation') AS level`,
      );
      expect(row!.level).toBe('read committed');
    });

    it('una venta a medio escribir no es visible: ni cabecera, ni líneas, ni SALE, ni saldo; al confirmar aparece completa', async () => {
      const tracked = await createProduct(tenantA, { counted: 10 });
      const untracked = await createProduct(tenantA, { tracksStock: false });
      const id = randomUUID();

      const holder = await holdProductLock(untracked);
      const sale = sell(
        tenantA,
        [
          { productId: tracked, quantity: 3, unitPrice: 10 },
          { productId: untracked, quantity: 1, unitPrice: 5 },
        ],
        id,
      );
      await waitForLockWaiters(1);

      // La venta ya escribió SALE, saldo, cabecera y la primera línea: espera
      // en el insert de la segunda línea.
      const waiting = await lockWaiters();
      expect(waiting.some((w) => /INSERT INTO "public"\."sale_lines"/.test(w.query))).toBe(true);

      await expect(sales.get(tenantA.businessId, id)).rejects.toMatchObject({
        code: 'SALE_NOT_FOUND',
      });
      const page = await sales.list(tenantA.businessId, { limit: 100 });
      expect(page.items.map((s) => s.id)).not.toContain(id);
      expect(await traceOf(id)).toMatchObject({ sale: null, lines: 0, sales: 0 });
      expect(await stockOf(tracked)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
      expect(await inventory.getStock(tenantA.businessId, tracked)).toMatchObject({ balance: 10 });

      holder.release();
      await holder.done;
      await sale;

      const created = await sales.get(tenantA.businessId, id);
      expect(created.lines).toHaveLength(2);
      expect(created.total.toString()).toBe('35');
      expect(await traceOf(id)).toMatchObject({ lines: 2, sales: 1 });
      expect(await stockOf(tracked)).toMatchObject({ cached: 7, sum: 7, movements: 2 });
    });

    it('si falla después de escribir la mitad, se revierte todo: SALE, saldo, cabecera y líneas', async () => {
      const tracked = await createProduct(tenantA, { counted: 10 });
      const untracked = await createProduct(tenantA, { tracksStock: false });
      const id = randomUUID();

      const holder = await holdProductLock(untracked);
      const sale = sell(
        tenantA,
        [
          { productId: tracked, quantity: 3, unitPrice: 10 },
          { productId: untracked, quantity: 1, unitPrice: 5 },
        ],
        id,
      );
      await waitForLockWaiters(1);

      // Falla forzada: el producto de la segunda línea desaparece y la FK
      // rechaza la línea cuando la venta ya escribió todo lo anterior.
      holder.release((tx) => tx.product.delete({ where: { id: untracked } }));
      await holder.done;
      await expect(sale).rejects.toMatchObject({ code: 'P2003' });

      expect(await traceOf(id)).toMatchObject({ sale: null, lines: 0, sales: 0 });
      expect(await stockOf(tracked)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
    });

    it('entre negocios: no se vende un producto ajeno (rollback de la línea propia) ni se anula una venta ajena', async () => {
      const ownB = await createProduct(tenantB, { counted: 5 });
      const foreignA = await createProduct(tenantA, { counted: 5 });
      const id = randomUUID();

      await expect(
        sell(
          tenantB,
          [
            { productId: ownB, quantity: 1, unitPrice: 10 },
            { productId: foreignA, quantity: 1, unitPrice: 10 },
          ],
          id,
        ),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      expect(await traceOf(id)).toMatchObject({ sale: null, lines: 0, sales: 0 });
      expect(await stockOf(ownB)).toMatchObject({ cached: 5, movements: 1 });

      const { sale } = await sell(tenantA, [{ productId: foreignA, quantity: 2, unitPrice: 10 }]);
      await expect(voidSale(tenantB, sale.id)).rejects.toMatchObject({ code: 'SALE_NOT_FOUND' });
      await expect(sales.get(tenantB.businessId, sale.id)).rejects.toMatchObject({
        code: 'SALE_NOT_FOUND',
      });
      const pageB = await sales.list(tenantB.businessId, { limit: 100 });
      expect(pageB.items.every((s) => s.businessId === tenantB.businessId)).toBe(true);

      expect((await traceOf(sale.id)).sale).toMatchObject({ status: SaleStatus.ACTIVE });
      expect(await stockOf(foreignA)).toMatchObject({ cached: 3, sum: 3, movements: 2 });
    });
  });

  describe('invariantes al final (después de concurrencia y rollback)', () => {
    const tenants = () => [tenantA.businessId, tenantB.businessId];

    it('caché de cada producto = suma de sus movimientos', async () => {
      const rows = await prisma.$queryRaw<
        { id: string; cached: Prisma.Decimal; sum: Prisma.Decimal }[]
      >`
        SELECT p."id", p."stockQuantity" AS cached, COALESCE(SUM(m."quantityDelta"), 0) AS sum
        FROM "products" p
        LEFT JOIN "inventory_movements" m ON m."productId" = p."id"
        WHERE p."businessId" = ANY(${tenants()}::text[])
        GROUP BY p."id"`;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Number(row.cached)).toBe(Number(row.sum));
      }
    });

    it('cada venta: total = suma de subtotales, al menos una línea, y datos de anulación solo si está VOIDED', async () => {
      const rows = await prisma.$queryRaw<
        {
          id: string;
          status: SaleStatus;
          total: Prisma.Decimal;
          lines: bigint;
          subtotals: Prisma.Decimal | null;
          voidFields: bigint;
        }[]
      >`
        SELECT s."id", s."status", s."total",
               COUNT(l."id") AS lines,
               SUM(l."subtotal") AS subtotals,
               (s."voidedAt" IS NOT NULL)::int + (s."voidedById" IS NOT NULL)::int
                 + (s."voidReason" IS NOT NULL)::int AS "voidFields"
        FROM "sales" s
        LEFT JOIN "sale_lines" l ON l."saleId" = s."id"
        WHERE s."businessId" = ANY(${tenants()}::text[])
        GROUP BY s."id"`;
      expect(rows.some((r) => r.status === SaleStatus.VOIDED)).toBe(true);
      expect(rows.some((r) => r.status === SaleStatus.ACTIVE)).toBe(true);
      for (const row of rows) {
        expect(Number(row.lines)).toBeGreaterThan(0);
        expect(Number(row.total)).toBe(Number(row.subtotals));
        expect(Number(row.voidFields)).toBe(row.status === SaleStatus.VOIDED ? 3 : 0);
      }
    });

    it('cada línea: un SALE por −cantidad si mueve stock, y un SALE_VOID por +cantidad solo si la venta está anulada', async () => {
      const rows = await prisma.$queryRaw<
        {
          movesStock: boolean;
          status: SaleStatus;
          quantity: Prisma.Decimal;
          sales: bigint;
          saleDelta: Prisma.Decimal;
          voids: bigint;
          voidDelta: Prisma.Decimal;
        }[]
      >`
        SELECT l."movesStock", s."status", l."quantity",
               COUNT(m."id") FILTER (WHERE m."type" = 'SALE') AS sales,
               COALESCE(SUM(m."quantityDelta") FILTER (WHERE m."type" = 'SALE'), 0) AS "saleDelta",
               COUNT(m."id") FILTER (WHERE m."type" = 'SALE_VOID') AS voids,
               COALESCE(SUM(m."quantityDelta") FILTER (WHERE m."type" = 'SALE_VOID'), 0) AS "voidDelta"
        FROM "sale_lines" l
        JOIN "sales" s ON s."id" = l."saleId"
        LEFT JOIN "inventory_movements" m
          ON m."refType" = ${SALE_REF_TYPE} AND m."refId" = l."saleId" AND m."productId" = l."productId"
        WHERE l."businessId" = ANY(${tenants()}::text[])
        GROUP BY l."id", s."status"`;
      expect(rows.some((r) => !r.movesStock)).toBe(true);
      for (const row of rows) {
        const quantity = Number(row.quantity);
        const voided = row.status === SaleStatus.VOIDED;
        if (!row.movesStock) {
          expect([Number(row.sales), Number(row.voids)]).toEqual([0, 0]);
          continue;
        }
        expect(Number(row.sales)).toBe(1);
        expect(Number(row.saleDelta)).toBe(-quantity);
        expect(Number(row.voids)).toBe(voided ? 1 : 0);
        expect(Number(row.voidDelta)).toBe(voided ? quantity : 0);
      }
    });

    it('ningún movimiento de venta huérfano: todo SALE/SALE_VOID apunta a una venta confirmada del mismo negocio', async () => {
      const [row] = await prisma.$queryRaw<{ orphans: bigint }[]>`
        SELECT COUNT(*) AS orphans
        FROM "inventory_movements" m
        LEFT JOIN "sales" s ON s."id" = m."refId" AND s."businessId" = m."businessId"
        WHERE m."businessId" = ANY(${tenants()}::text[])
          AND (m."refType" = ${SALE_REF_TYPE} OR m."type" IN ('SALE', 'SALE_VOID'))
          AND s."id" IS NULL`;
      expect(Number(row!.orphans)).toBe(0);
    });
  });
});
