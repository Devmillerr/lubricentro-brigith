import { randomUUID } from 'node:crypto';
import { InventoryMovementType, Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { applyStockMovements, type StockPolicy } from '../../src/inventory/stock-ledger';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { forBusiness } from '../../src/prisma/business-scope';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * StockLedger contra Postgres real (R1): lo que el fake no puede probar
 * (bloqueo de filas, concurrencia, rollback, idempotencia con el unique real
 * y la invariante caché = suma de movimientos).
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas (en CI: el
 * Postgres del workflow). Cada corrida crea sus propios negocios con ids
 * nuevos, así que no depende de datos previos ni los pisa.
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
const maintenances = new MaintenancesService(prisma);
const idempotency = new IdempotencyService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
  vehicleId: string;
  maintenanceTypeId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R1 ${suffix}`, slug: `r1-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'R1',
      username: `r1-${suffix}`,
      passwordHash: 'no-se-usa',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      businessId: business.id,
      createdById: user.id,
      plate: 'R1-001',
      plateNormalized: 'R1001',
    },
  });
  const type = await prisma.maintenanceType.create({
    data: { businessId: business.id, name: 'Cambio de aceite' },
  });
  return {
    businessId: business.id,
    userId: user.id,
    vehicleId: vehicle.id,
    maintenanceTypeId: type.id,
  };
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
    isCounted: product.isCounted,
    sum: Number(sum._sum.quantityDelta ?? 0),
    movements: sum._count,
  };
}

function applyInTx(
  tenant: Tenant,
  productId: string,
  type: InventoryMovementType,
  quantityDelta: number,
  policy: StockPolicy,
) {
  return forBusiness(prisma, tenant.businessId).$transaction((tx) =>
    applyStockMovements(tx, {
      businessId: tenant.businessId,
      createdById: tenant.userId,
      policy,
      entries: [{ productId, type, quantityDelta, occurredAt: new Date() }],
    }),
  );
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

describe('StockLedger contra Postgres', () => {
  it('entrada, salida y ajuste mantienen caché = suma de movimientos (casos 1, 2, 3)', async () => {
    const productId = await createProduct(tenantA, 10);

    const receipt = await inventory.receipt(tenantA.businessId, tenantA.userId, {
      productId,
      quantity: 20,
    });
    expect(Number(receipt.resultingBalance)).toBe(30);
    expect(receipt.createdById).toBe(tenantA.userId);

    await applyInTx(tenantA, productId, InventoryMovementType.SALE, -4, 'BLOCK');
    const adjustment = await inventory.adjustment(tenantA.businessId, tenantA.userId, {
      productId,
      quantityDelta: -1.5,
      reason: 'Merma',
    });
    expect(Number(adjustment.resultingBalance)).toBe(24.5);

    const stock = await stockOf(productId);
    expect(stock).toMatchObject({ cached: 24.5, sum: 24.5, isCounted: true, movements: 4 });
    expect(await inventory.getStock(tenantA.businessId, productId)).toEqual({
      productId,
      balance: 24.5,
      isCounted: true,
    });
  });

  it('venta con conteo y saldo insuficiente: 422 y rollback completo (caso 4)', async () => {
    const productId = await createProduct(tenantA, 2);

    await expect(
      applyInTx(tenantA, productId, InventoryMovementType.SALE, -3, 'BLOCK'),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(await stockOf(productId)).toMatchObject({ cached: 2, sum: 2, movements: 1 });
  });

  it('mantenimiento deja saldo negativo con aviso, y anularlo lo restaura (caso 5)', async () => {
    const productId = await createProduct(tenantA, 2);

    const result = await maintenances.create(tenantA.businessId, tenantA.userId, {
      vehicleId: tenantA.vehicleId,
      maintenanceTypeId: tenantA.maintenanceTypeId,
      performedAt: new Date().toISOString(),
      items: [{ productId, quantity: 5 }],
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'INSUFFICIENT_STOCK', balance: 2, requestedQuantity: 5 }),
    );
    expect(await stockOf(productId)).toMatchObject({ cached: -3, sum: -3 });

    await maintenances.void(tenantA.businessId, tenantA.userId, result.maintenance.id, {
      reason: 'Prueba R1',
    });
    expect(await stockOf(productId)).toMatchObject({ cached: 2, sum: 2 });
  });

  it('producto sin conteo inicial: la venta continúa con aviso (caso 6)', async () => {
    const productId = await createProduct(tenantA);

    const { warnings } = await applyInTx(
      tenantA,
      productId,
      InventoryMovementType.SALE,
      -1,
      'BLOCK',
    );

    expect(warnings).toEqual([expect.objectContaining({ code: 'PRODUCT_NOT_COUNTED' })]);
    expect(await stockOf(productId)).toMatchObject({ cached: -1, sum: -1, isCounted: false });
  });

  it('si la operación de origen falla después del ledger, no queda movimiento ni saldo', async () => {
    const productId = await createProduct(tenantA, 5);

    await expect(
      forBusiness(prisma, tenantA.businessId).$transaction(async (tx) => {
        await applyStockMovements(tx, {
          businessId: tenantA.businessId,
          createdById: tenantA.userId,
          policy: 'WARN',
          entries: [
            {
              productId,
              type: InventoryMovementType.SALE,
              quantityDelta: -1,
              occurredAt: new Date(),
            },
          ],
        });
        throw new Error('falla después de escribir el stock');
      }),
    ).rejects.toThrow('falla después de escribir el stock');

    expect(await stockOf(productId)).toMatchObject({ cached: 5, sum: 5, movements: 1 });
  });

  describe('concurrencia (caso 7)', () => {
    it('entradas, mantenimientos y ajustes simultáneos no pierden actualizaciones', async () => {
      const productId = await createProduct(tenantA, 100);

      const operations = [
        ...Array.from({ length: 4 }, () =>
          inventory.receipt(tenantA.businessId, tenantA.userId, { productId, quantity: 3 }),
        ),
        ...Array.from({ length: 4 }, () =>
          maintenances.create(tenantA.businessId, tenantA.userId, {
            vehicleId: tenantA.vehicleId,
            maintenanceTypeId: tenantA.maintenanceTypeId,
            performedAt: new Date().toISOString(),
            items: [{ productId, quantity: 2 }],
          }),
        ),
        ...Array.from({ length: 2 }, () =>
          inventory.adjustment(tenantA.businessId, tenantA.userId, {
            productId,
            quantityDelta: -1,
            reason: 'Concurrencia',
          }),
        ),
      ];
      await Promise.all(operations);

      // 100 + 4×3 − 4×2 − 2×1. Sin bloqueo, dos operaciones leerían el mismo
      // saldo y una pisaría a la otra: la caché dejaría de coincidir con la suma.
      expect(await stockOf(productId)).toMatchObject({ cached: 102, sum: 102, movements: 11 });
    });

    it('conteos simultáneos: cada uno parte del saldo que dejó el otro', async () => {
      const productId = await createProduct(tenantA, 10);

      await Promise.all([
        inventory.count(tenantA.businessId, tenantA.userId, { productId, countedQuantity: 50 }),
        inventory.count(tenantA.businessId, tenantA.userId, { productId, countedQuantity: 60 }),
      ]);

      const stock = await stockOf(productId);
      expect(stock.cached).toBe(stock.sum);
      expect([50, 60]).toContain(stock.cached);

      const counts = await prisma.inventoryMovement.findMany({
        where: { productId, type: InventoryMovementType.COUNT },
      });
      const [, second, third] = counts.sort(
        (a, b) => Number(a.previousBalance) - Number(b.previousBalance),
      );
      // El primer conteo (10) y luego los dos simultáneos, en cadena: el
      // último partió del resultado del anterior, no del mismo 10.
      expect(Number(second!.previousBalance)).toBe(10);
      expect(Number(third!.previousBalance)).toBe(Number(second!.resultingBalance));
    });

    it('ventas simultáneas con BLOCK nunca dejan negativo un producto contado', async () => {
      const productId = await createProduct(tenantA, 5);

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          applyInTx(tenantA, productId, InventoryMovementType.SALE, -1, 'BLOCK'),
        ),
      );

      const ok = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(5);
      expect(rejected).toHaveLength(3);
      for (const r of rejected) {
        expect(r.reason).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      }
      expect(await stockOf(productId)).toMatchObject({ cached: 0, sum: 0, movements: 6 });
    });
  });

  describe('idempotencia (caso 8)', () => {
    it('la misma clave, en paralelo y repetida después, registra un solo movimiento', async () => {
      const productId = await createProduct(tenantA, 1);
      const dto = { productId, quantity: 7 };
      const key = randomUUID();
      const run = () =>
        idempotency.run({
          businessId: tenantA.businessId,
          key,
          endpoint: 'inventory/receipts',
          requestHash: idempotency.hashRequest(dto),
          handler: async () => ({
            status: 201,
            body: await inventory.receipt(tenantA.businessId, tenantA.userId, dto),
          }),
        });

      const parallel = await Promise.all([run(), run(), run()]);
      const replay = await run();

      const ids = new Set([...parallel, replay].map((r) => r.body.id));
      expect(ids.size).toBe(1);
      expect(replay.replayed).toBe(true);
      expect(await stockOf(productId)).toMatchObject({ cached: 8, sum: 8, movements: 2 });
    });
  });

  describe('aislamiento entre negocios (caso 9)', () => {
    it('otro negocio no puede mover ni consultar el stock de un producto ajeno', async () => {
      const productId = await createProduct(tenantA, 10);

      await expect(
        inventory.receipt(tenantB.businessId, tenantB.userId, { productId, quantity: 5 }),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      await expect(
        applyInTx(tenantB, productId, InventoryMovementType.SALE, -1, 'WARN'),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      await expect(inventory.getStock(tenantB.businessId, productId)).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });

      expect(await stockOf(productId)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
      const leaked = await prisma.inventoryMovement.count({
        where: { businessId: tenantB.businessId },
      });
      expect(leaked).toBe(0);
    });
  });

  it('invariante: en ambos negocios, la caché de cada producto es igual a la suma de sus movimientos', async () => {
    const rows = await prisma.$queryRaw<
      { id: string; cached: Prisma.Decimal; sum: Prisma.Decimal }[]
    >(
      Prisma.sql`
        SELECT p."id", p."stockQuantity" AS cached, COALESCE(SUM(m."quantityDelta"), 0) AS sum
        FROM "products" p
        LEFT JOIN "inventory_movements" m ON m."productId" = p."id"
        WHERE p."businessId" IN (${tenantA.businessId}::text, ${tenantB.businessId}::text)
        GROUP BY p."id"`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Number(row.cached)).toBe(Number(row.sum));
    }
  });
});
