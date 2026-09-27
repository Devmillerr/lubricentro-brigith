import { randomUUID } from 'node:crypto';
import { PaymentMethod, Prisma, SaleSource, SaleStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';
import { WashTypesService } from '../../src/washes/wash-types.service';
import {
  WASH_IDEMPOTENCY_ENDPOINT,
  WashesService,
  type CreateWashInput,
} from '../../src/washes/washes.service';

/**
 * Lavados (R5, `POST /washes`) contra Postgres real: lo que el fake y el e2e
 * no demuestran. Rollback real a mitad de escritura, idempotencia concurrente
 * con el unique de `idempotency_records`, aislamiento entre negocios y que un
 * lavado nunca toca el inventario (DEC-54), ni al crearse ni al anularse.
 *
 * Para detener un lavado a mitad de camino sin tocar el código se aprovecha
 * el orden de escritura de `writeSale`: primero la cabecera y después la
 * línea, cuya FK hacia `wash_types` pide `FOR KEY SHARE`. Si la prueba
 * retiene `FOR UPDATE` sobre el tipo, el lavado queda esperando con la
 * cabecera ya escrita.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas (incluida
 * `r5_washes`). Cada corrida crea sus propios negocios.
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
const washes = new WashesService(prisma);
const washTypes = new WashTypesService(prisma);
const idempotency = new IdempotencyService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

interface WashFixture {
  typeId: string;
  priceId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R5 ${suffix}`, slug: `r5-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'R5',
      username: `r5-${suffix}`,
      passwordHash: 'no-se-usa',
    },
  });
  return { businessId: business.id, userId: user.id };
}

async function createWashType(tenant: Tenant, amount = 25): Promise<WashFixture> {
  const type = await washTypes.create(tenant.businessId, { name: `Lavado ${randomUUID()}` });
  const price = await washTypes.createPrice(tenant.businessId, type.id, { amount });
  return { typeId: type.id, priceId: price.id };
}

function registerWash(tenant: Tenant, fixture: WashFixture, extra: Partial<CreateWashInput> = {}) {
  return washes.create(tenant.businessId, tenant.userId, {
    washTypeId: fixture.typeId,
    priceOptionId: fixture.priceId,
    paymentMethod: PaymentMethod.CASH,
    ...extra,
  });
}

async function inventoryFootprint(tenant: Tenant) {
  const [movements, products] = await Promise.all([
    prisma.inventoryMovement.count({ where: { businessId: tenant.businessId } }),
    prisma.product.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
      select: { id: true, stockQuantity: true, isCounted: true },
    }),
  ]);
  return {
    movements,
    products: products.map((p) => ({ ...p, stockQuantity: p.stockQuantity.toString() })),
  };
}

/**
 * Transacción de prueba que toma `FOR UPDATE` sobre un tipo de lavado y no
 * confirma hasta `release()`. `release(action)` corre `action` dentro de la
 * misma transacción antes de confirmar.
 */
async function holdWashTypeLock(typeId: string) {
  type Action = (tx: Prisma.TransactionClient) => Promise<unknown>;
  let release!: (action?: Action) => void;
  const released = new Promise<Action | undefined>((resolve) => (release = resolve));
  let signalLocked!: () => void;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));

  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "wash_types" WHERE "id" = ${typeId}::text FOR UPDATE`;
      signalLocked();
      const action = await released;
      if (action) await action(tx);
    },
    { timeout: 30_000 },
  );
  await locked;
  return { release, done };
}

async function waitForLockWaiter(pattern: RegExp) {
  for (let i = 0; i < 100; i++) {
    const waiting = await prisma.$queryRaw<{ query: string }[]>`
      SELECT query FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (waiting.some((w) => pattern.test(w.query))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Ninguna sesión quedó esperando un bloqueo en ${pattern}`);
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeAll(async () => {
  await prisma.$connect();
  tenantA = await createTenant();
  tenantB = await createTenant();
  // Un producto con conteo en cada negocio: los lavados no deben tocarlo.
  for (const tenant of [tenantA, tenantB]) {
    const product = await prisma.product.create({
      data: { businessId: tenant.businessId, name: `Aceite ${randomUUID()}`, unit: 'litro' },
    });
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: 6,
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Lavados contra Postgres (R5)', () => {
  it('crea la Sale WASH con una línea y el total de la opción, sin movimientos', async () => {
    const fixture = await createWashType(tenantA, 12.5);
    const before = await inventoryFootprint(tenantA);

    const created = await registerWash(tenantA, fixture, { note: 'int' });

    const stored = await sales.get(tenantA.businessId, created.id);
    expect(stored).toMatchObject({ source: SaleSource.WASH, status: SaleStatus.ACTIVE });
    expect(stored.total.toString()).toBe('12.5');
    expect(stored.lines).toHaveLength(1);
    expect(stored.lines[0]).toMatchObject({
      kind: 'WASH',
      productId: null,
      washTypeId: fixture.typeId,
      movesStock: false,
    });
    expect(stored.lines[0]!.quantity.toString()).toBe('1');
    expect(stored.lines[0]!.unitPrice.toString()).toBe('12.5');
    expect(await inventoryFootprint(tenantA)).toEqual(before);
  });

  it('si falla después de escribir la cabecera, se revierte todo: ni venta ni línea', async () => {
    const fixture = await createWashType(tenantA);
    const id = randomUUID();

    const holder = await holdWashTypeLock(fixture.typeId);
    const pending = registerWash(tenantA, fixture, { id });
    await waitForLockWaiter(/INSERT INTO "public"\."sale_lines"/);

    // A medio camino: la cabecera está escrita pero no es visible.
    await expect(sales.get(tenantA.businessId, id)).rejects.toMatchObject({
      code: 'SALE_NOT_FOUND',
    });

    // Falla forzada: el tipo desaparece y la FK rechaza la línea.
    holder.release(async (tx) => {
      await tx.washPriceOption.deleteMany({ where: { washTypeId: fixture.typeId } });
      await tx.washType.delete({ where: { id: fixture.typeId } });
    });
    await holder.done;
    await expect(pending).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.sale.count({ where: { id } })).resolves.toBe(0);
    await expect(prisma.saleLine.count({ where: { saleId: id } })).resolves.toBe(0);
  });

  it('la misma Idempotency-Key en paralelo: un solo lavado; con otro cuerpo, 409 sin efectos', async () => {
    const fixture = await createWashType(tenantA);
    const key = randomUUID();
    const note = `idem ${key}`;
    const input: CreateWashInput = {
      washTypeId: fixture.typeId,
      priceOptionId: fixture.priceId,
      paymentMethod: PaymentMethod.CASH,
      note,
    };
    const run = (body: CreateWashInput) =>
      idempotency.run({
        businessId: tenantA.businessId,
        key,
        endpoint: WASH_IDEMPOTENCY_ENDPOINT,
        requestHash: idempotency.hashRequest(body),
        handler: async () => ({
          status: 201,
          body: { id: (await washes.create(tenantA.businessId, tenantA.userId, body)).id },
        }),
      });

    const results = await Promise.all(Array.from({ length: 5 }, () => run(input)));

    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    await expect(
      prisma.sale.count({ where: { businessId: tenantA.businessId, note } }),
    ).resolves.toBe(1);

    await expect(run({ ...input, paymentMethod: PaymentMethod.YAPE })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    await expect(
      prisma.sale.count({ where: { businessId: tenantA.businessId, note } }),
    ).resolves.toBe(1);
  });

  it('entre negocios: no se cobra con un tipo o precio ajeno ni se anula un lavado ajeno', async () => {
    const fixtureA = await createWashType(tenantA);
    const fixtureB = await createWashType(tenantB);
    const id = randomUUID();

    await expect(registerWash(tenantB, fixtureA, { id })).rejects.toMatchObject({
      code: 'WASH_TYPE_NOT_FOUND',
    });
    await expect(
      registerWash(tenantB, { typeId: fixtureB.typeId, priceId: fixtureA.priceId }, { id }),
    ).rejects.toMatchObject({ code: 'WASH_PRICE_NOT_FOUND' });
    await expect(prisma.sale.count({ where: { id } })).resolves.toBe(0);

    const washA = await registerWash(tenantA, fixtureA);
    await expect(
      sales.void(tenantB.businessId, tenantB.userId, washA.id, { reason: 'ajeno' }),
    ).rejects.toMatchObject({ code: 'SALE_NOT_FOUND' });
    const pageB = await sales.list(tenantB.businessId, { source: SaleSource.WASH, limit: 100 });
    expect(pageB.items.map((s) => s.id)).not.toContain(washA.id);
    expect((await sales.get(tenantA.businessId, washA.id)).status).toBe(SaleStatus.ACTIVE);
  });

  it('se anula por SalesService.void: VOIDED, sin SALE_VOID ni cambios de stock (DEC-59)', async () => {
    const fixture = await createWashType(tenantA);
    const created = await registerWash(tenantA, fixture);
    const before = await inventoryFootprint(tenantA);

    const voided = await sales.void(tenantA.businessId, tenantA.userId, created.id, {
      reason: 'mal registrado',
    });

    expect(voided).toMatchObject({ status: SaleStatus.VOIDED, voidReason: 'mal registrado' });
    expect(await inventoryFootprint(tenantA)).toEqual(before);
    const page = await sales.list(tenantA.businessId, { source: SaleSource.WASH, limit: 100 });
    expect(page.items.find((s) => s.id === created.id)).toMatchObject({
      status: SaleStatus.VOIDED,
    });
  });

  describe('invariantes al final', () => {
    it('ningún lavado tiene movimientos de inventario enlazados y solo existe el COUNT inicial', async () => {
      const tenants = [tenantA.businessId, tenantB.businessId];
      const linked = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "inventory_movements" m
        JOIN "sales" s ON s."id" = m."refId"
        WHERE s."source" = 'WASH' AND s."businessId" = ANY(${tenants}::text[])`;
      expect(Number(linked[0]!.n)).toBe(0);

      for (const tenant of [tenantA, tenantB]) {
        const footprint = await inventoryFootprint(tenant);
        expect(footprint.movements).toBe(1);
        expect(footprint.products).toEqual([
          expect.objectContaining({ stockQuantity: '6', isCounted: true }),
        ]);
      }
    });

    it('cada lavado: una sola línea WASH sin producto ni stock, y total = subtotal', async () => {
      const rows = await prisma.$queryRaw<
        {
          lines: bigint;
          washLines: bigint;
          total: Prisma.Decimal;
          subtotals: Prisma.Decimal;
        }[]
      >`
        SELECT COUNT(l."id") AS lines,
               COUNT(*) FILTER (
                 WHERE l."kind" = 'WASH' AND l."productId" IS NULL
                   AND l."washTypeId" IS NOT NULL AND l."movesStock" = false
                   AND l."quantity" = 1
               ) AS "washLines",
               s."total", SUM(l."subtotal") AS subtotals
        FROM "sales" s JOIN "sale_lines" l ON l."saleId" = s."id"
        WHERE s."source" = 'WASH' AND s."businessId" = ANY(${[tenantA.businessId, tenantB.businessId]}::text[])
        GROUP BY s."id"`;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Number(row.lines)).toBe(1);
        expect(Number(row.washLines)).toBe(1);
        expect(Number(row.total)).toBe(Number(row.subtotals));
      }
    });
  });
});
