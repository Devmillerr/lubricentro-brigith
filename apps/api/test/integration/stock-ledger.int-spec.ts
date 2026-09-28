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

function applyPhysicalInTx(tenant: Tenant, productId: string, physicalQuantity: number) {
  return forBusiness(prisma, tenant.businessId).$transaction((tx) =>
    applyStockMovements(tx, {
      businessId: tenant.businessId,
      createdById: tenant.userId,
      policy: 'WARN',
      entries: [
        {
          productId,
          type: InventoryMovementType.ADJUSTMENT,
          physicalQuantity,
          reason: 'Conteo físico distinto',
          occurredAt: new Date(),
        },
      ],
    }),
  );
}

/**
 * Abre una transacción que aplica una entrada (y con ella toma el FOR UPDATE
 * del producto) y **no confirma** hasta que se llame a `release()`. Sirve
 * para forzar el intercalado: otra operación empieza mientras esta tiene el
 * bloqueo y el saldo nuevo todavía no está confirmado.
 */
async function holdLockWithReceipt(tenant: Tenant, productId: string, quantityDelta: number) {
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
            type: InventoryMovementType.PURCHASE_IN,
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
    const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS waiting FROM pg_stat_activity
                 WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
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
      physicalQuantity: 24.5,
      reason: 'Merma',
    });
    expect(Number(adjustment.previousBalance)).toBe(26);
    expect(Number(adjustment.quantityDelta)).toBe(-1.5);
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
        // Ajustes por delta directo al ledger: los físicos simultáneos se prueban abajo.
        ...Array.from({ length: 2 }, () =>
          applyInTx(tenantA, productId, InventoryMovementType.ADJUSTMENT, -1, 'WARN'),
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

    it('dos anulaciones simultáneas del mismo mantenimiento con claves distintas: 200 y 409, un solo MAINTENANCE_VOID por producto (Corte 0, DEC-77)', async () => {
      const oilId = await createProduct(tenantA, 10);
      const filterId = await createProduct(tenantA, 4);
      const created = await maintenances.create(tenantA.businessId, tenantA.userId, {
        vehicleId: tenantA.vehicleId,
        maintenanceTypeId: tenantA.maintenanceTypeId,
        performedAt: new Date().toISOString(),
        items: [
          { productId: oilId, quantity: 3 },
          { productId: filterId, quantity: 1 },
        ],
      });
      const maintenanceId = created.maintenance.id;
      expect(await stockOf(oilId)).toMatchObject({ cached: 7, sum: 7 });
      expect(await stockOf(filterId)).toMatchObject({ cached: 3, sum: 3 });

      // Como el controlador: cada solicitud con su propia Idempotency-Key.
      const voidWithOwnKey = (reason: string) => {
        const dto = { reason };
        return idempotency.run({
          businessId: tenantA.businessId,
          key: randomUUID(),
          endpoint: `maintenances/${maintenanceId}/void`,
          requestHash: idempotency.hashRequest(dto),
          handler: async () => ({
            status: 200,
            body: await maintenances.void(tenantA.businessId, tenantA.userId, maintenanceId, dto),
          }),
        });
      };

      const results = await Promise.allSettled([voidWithOwnKey('A'), voidWithOwnKey('B')]);

      const ok = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const winner = ok[0]!.value;
      const loser = rejected[0]!.reason as { code: string; getStatus(): number };
      expect(winner).toMatchObject({ status: 200, body: { maintenance: { status: 'VOIDED' } } });
      expect(loser.code).toBe('MAINTENANCE_ALREADY_VOIDED');
      expect(loser.getStatus()).toBe(409);

      for (const productId of [oilId, filterId]) {
        const voids = await prisma.inventoryMovement.count({
          where: {
            productId,
            refType: 'Maintenance',
            refId: maintenanceId,
            type: InventoryMovementType.MAINTENANCE_VOID,
          },
        });
        expect(voids).toBe(1);
      }
      expect(await stockOf(oilId)).toMatchObject({ cached: 10, sum: 10 });
      expect(await stockOf(filterId)).toMatchObject({ cached: 4, sum: 4 });

      const stored = await prisma.maintenance.findFirstOrThrow({ where: { id: maintenanceId } });
      expect(stored.status).toBe('VOIDED');
      expect(stored.voidReason).toBe(winner.body.maintenance.voidReason);
    });
  });

  describe('concurrencia del ajuste por cantidad física (R3, BR-P7b)', () => {
    it('espera el bloqueo y calcula la diferencia contra el saldo confirmado, no contra el que había al empezar', async () => {
      const productId = await createProduct(tenantA, 10);

      // T1 suma 5 y retiene el bloqueo sin confirmar.
      const holder = await holdLockWithReceipt(tenantA, productId, 5);
      // T2 empieza con el saldo confirmado todavía en 10 y queda esperando.
      const adjustment = applyPhysicalInTx(tenantA, productId, 12);
      await waitForLockWaiter();

      holder.release();
      await holder.done;
      const { movements } = await adjustment;

      // Con el bloqueo, T2 lee 15 (lo que dejó T1): 12 − 15 = −3. Si hubiera
      // usado el 10 obsoleto, habría escrito +2 y el estante quedaría en 17.
      const movement = movements[0]!;
      expect(Number(movement.previousBalance)).toBe(15);
      expect(Number(movement.countedQuantity)).toBe(12);
      expect(Number(movement.quantityDelta)).toBe(-3);
      expect(Number(movement.resultingBalance)).toBe(12);
      expect(await stockOf(productId)).toMatchObject({
        cached: 12,
        sum: 12,
        isCounted: true,
        movements: 3,
      });
    });

    it('si mientras esperaba el saldo llegó a lo físico: NO_DIFFERENCE sin escribir nada', async () => {
      const productId = await createProduct(tenantA, 10);

      const holder = await holdLockWithReceipt(tenantA, productId, 2);
      const adjustment = applyPhysicalInTx(tenantA, productId, 12);
      await waitForLockWaiter();

      holder.release();
      await holder.done;

      // Contra el 10 obsoleto habría escrito +2 y dejado 14.
      await expect(adjustment).rejects.toMatchObject({ code: 'NO_DIFFERENCE', status: 400 });
      expect(await stockOf(productId)).toMatchObject({ cached: 12, sum: 12, movements: 2 });
      const adjustments = await prisma.inventoryMovement.count({
        where: { productId, type: InventoryMovementType.ADJUSTMENT },
      });
      expect(adjustments).toBe(0);
    });

    it('dos ajustes simultáneos a la misma cantidad física: uno escribe y el otro no tiene diferencia', async () => {
      const productId = await createProduct(tenantA, 10);

      const results = await Promise.allSettled([
        applyPhysicalInTx(tenantA, productId, 20),
        applyPhysicalInTx(tenantA, productId, 20),
      ]);

      // Sin bloqueo, los dos leerían 10 y cada uno sumaría +10: quedaría en 30.
      const ok = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({ code: 'NO_DIFFERENCE' });
      expect(await stockOf(productId)).toMatchObject({ cached: 20, sum: 20, movements: 2 });
    });

    it('ajustes físicos y entradas simultáneos mantienen caché = suma, y el ajuste parte del saldo del momento', async () => {
      const productId = await createProduct(tenantA, 100);

      const receipts = Array.from({ length: 4 }, () =>
        inventory.receipt(tenantA.businessId, tenantA.userId, { productId, quantity: 3 }),
      );
      const adjustment = applyPhysicalInTx(tenantA, productId, 50);
      const [{ movements }] = await Promise.all([adjustment, ...receipts]);

      // El ajuste entró después de k entradas (0 ≤ k ≤ 4): partió de 100 + 3k,
      // dejó 50, y las 4 − k restantes sumaron 3 cada una sobre ese 50.
      const previous = Number(movements[0]!.previousBalance);
      const receiptsBefore = (previous - 100) / 3;
      expect(Number.isInteger(receiptsBefore)).toBe(true);
      expect(receiptsBefore).toBeGreaterThanOrEqual(0);
      expect(receiptsBefore).toBeLessThanOrEqual(4);
      expect(Number(movements[0]!.resultingBalance)).toBe(50);

      const expected = 50 + 3 * (4 - receiptsBefore);
      expect(await stockOf(productId)).toMatchObject({
        cached: expected,
        sum: expected,
        movements: 6,
      });
    });

    it('un rechazo del ajuste deshace toda la operación, también el otro producto', async () => {
      const counted = await createProduct(tenantA, 10);
      const notCounted = await createProduct(tenantA);

      await expect(
        forBusiness(prisma, tenantA.businessId).$transaction((tx) =>
          applyStockMovements(tx, {
            businessId: tenantA.businessId,
            createdById: tenantA.userId,
            policy: 'WARN',
            entries: [
              {
                productId: counted,
                type: InventoryMovementType.ADJUSTMENT,
                physicalQuantity: 7,
                reason: 'Producto dañado',
                occurredAt: new Date(),
              },
              {
                productId: notCounted,
                type: InventoryMovementType.ADJUSTMENT,
                physicalQuantity: 3,
                reason: 'Otro',
                occurredAt: new Date(),
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: 'ADJUSTMENT_REQUIRES_COUNT', status: 409 });

      expect(await stockOf(counted)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
      expect(await stockOf(notCounted)).toMatchObject({
        cached: 0,
        sum: 0,
        isCounted: false,
        movements: 0,
      });
    });

    it('POST de ajuste (servicio) sin conteo: ADJUSTMENT_REQUIRES_COUNT y el producto sigue sin conteo', async () => {
      const productId = await createProduct(tenantA);
      await applyInTx(tenantA, productId, InventoryMovementType.PURCHASE_IN, 4, 'WARN');

      await expect(
        inventory.adjustment(tenantA.businessId, tenantA.userId, {
          productId,
          physicalQuantity: 2,
          reason: 'Conteo físico distinto',
        }),
      ).rejects.toMatchObject({ code: 'ADJUSTMENT_REQUIRES_COUNT', status: 409 });

      expect(await stockOf(productId)).toMatchObject({
        cached: 4,
        sum: 4,
        movements: 1,
        isCounted: false,
      });
    });

    it('POST de ajuste (servicio) con conteo: no cambia isCounted y guarda la cantidad física', async () => {
      const productId = await createProduct(tenantA, 10);

      const movement = await inventory.adjustment(tenantA.businessId, tenantA.userId, {
        productId,
        physicalQuantity: 7,
        reason: 'Producto dañado',
      });

      expect(movement).toMatchObject({
        type: InventoryMovementType.ADJUSTMENT,
        reason: 'Producto dañado',
        createdById: tenantA.userId,
      });
      expect(Number(movement.countedQuantity)).toBe(7);
      expect(Number(movement.previousBalance)).toBe(10);
      expect(Number(movement.quantityDelta)).toBe(-3);
      expect(await stockOf(productId)).toMatchObject({ cached: 7, sum: 7, isCounted: true });
    });

    it('producto inactivo: PRODUCT_INACTIVE sin movimientos ni cambio de saldo', async () => {
      const productId = await createProduct(tenantA, 10);
      await prisma.product.update({ where: { id: productId }, data: { isActive: false } });

      await expect(applyPhysicalInTx(tenantA, productId, 4)).rejects.toMatchObject({
        code: 'PRODUCT_INACTIVE',
        status: 409,
      });
      expect(await stockOf(productId)).toMatchObject({ cached: 10, sum: 10, movements: 1 });
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
      await expect(
        inventory.adjustment(tenantB.businessId, tenantB.userId, {
          productId,
          physicalQuantity: 3,
          reason: 'Otro',
        }),
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
