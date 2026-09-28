import { randomUUID } from 'node:crypto';
import { InventoryMovementType } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';

/**
 * Cobro de mantenimiento y anulación conjunta contra Postgres real (R6,
 * B-153/B-154, DEC-69 a DEC-77): lo que el fake no puede probar (el único
 * de `Sale.maintenanceId`, el `FOR UPDATE` del cobro, la concurrencia entre
 * cobros y anulaciones y la idempotencia con el unique real).
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas (en CI: el
 * Postgres del workflow). Cada corrida crea su propio negocio.
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
const maintenances = new MaintenancesService(prisma);
const inventory = new InventoryService(prisma);
const idempotency = new IdempotencyService(prisma);
const salesService = new SalesService(prisma);

let businessId: string;
let userId: string;
let vehicleId: string;
let maintenanceTypeId: string;

const charge = { paymentMethod: 'CASH' as const, totalAmount: 95.9 };

beforeAll(async () => {
  await prisma.$connect();
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R6 cobro ${suffix}`, slug: `r6-cobro-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'R6',
      username: `r6-cobro-${suffix}`,
      passwordHash: 'x',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      businessId: business.id,
      createdById: user.id,
      plate: 'R6-002',
      plateNormalized: 'R6002',
    },
  });
  const type = await prisma.maintenanceType.create({
    data: { businessId: business.id, name: 'Cambio de aceite' },
  });
  businessId = business.id;
  userId = user.id;
  vehicleId = vehicle.id;
  maintenanceTypeId = type.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createProduct(counted: number): Promise<string> {
  const product = await prisma.product.create({
    data: { businessId, name: `Aceite ${randomUUID()}`, unit: 'litro' },
  });
  await inventory.count(businessId, userId, { productId: product.id, countedQuantity: counted });
  return product.id;
}

async function stockOf(productId: string) {
  const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
  const sum = await prisma.inventoryMovement.aggregate({
    where: { productId },
    _sum: { quantityDelta: true },
  });
  return { cached: Number(product.stockQuantity), sum: Number(sum._sum.quantityDelta ?? 0) };
}

async function createMaintenance(extra: Record<string, unknown> = {}) {
  return maintenances.create(businessId, userId, {
    vehicleId,
    maintenanceTypeId,
    performedAt: new Date().toISOString(),
    ...extra,
  });
}

/** Como el controlador: cada solicitud con su propia (o la misma) Idempotency-Key. */
function chargeWithKey(maintenanceId: string, key: string, body = charge) {
  return idempotency.run({
    businessId,
    key,
    endpoint: `maintenances/${maintenanceId}/charge`,
    requestHash: idempotency.hashRequest(body),
    handler: async () => ({
      status: 201,
      body: await maintenances.charge(businessId, userId, maintenanceId, body),
    }),
  });
}

function voidWithKey(maintenanceId: string, reason: string) {
  const dto = { reason };
  return idempotency.run({
    businessId,
    key: randomUUID(),
    endpoint: `maintenances/${maintenanceId}/void`,
    requestHash: idempotency.hashRequest(dto),
    handler: async () => ({
      status: 200,
      body: await maintenances.void(businessId, userId, maintenanceId, dto),
    }),
  });
}

describe('Cobro de mantenimiento contra Postgres (R6, B-153)', () => {
  it('crear con charge: venta MAINTENANCE con una línea SERVICE, sin cliente y sin movimientos de stock', async () => {
    const productId = await createProduct(10);
    const before = new Date();

    const result = await createMaintenance({ items: [{ productId, quantity: 2 }], charge });

    const sale = await prisma.sale.findFirstOrThrow({
      where: { maintenanceId: result.maintenance.id },
      include: { lines: true },
    });
    expect(sale).toMatchObject({
      source: 'MAINTENANCE',
      status: 'ACTIVE',
      paymentMethod: 'CASH',
      vehicleId,
      customerId: null,
      maintenanceId: result.maintenance.id,
    });
    expect(Number(sale.total)).toBe(95.9);
    expect(sale.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(sale.lines).toHaveLength(1);
    expect(sale.lines[0]).toMatchObject({
      kind: 'SERVICE',
      productId: null,
      washTypeId: null,
      descriptionSnapshot: 'Cambio de aceite',
      movesStock: false,
    });
    expect(Number(sale.lines[0]!.quantity)).toBe(1);
    expect(Number(sale.lines[0]!.subtotal)).toBe(95.9);
    expect(await prisma.inventoryMovement.count({ where: { refId: sale.id } })).toBe(0);
    expect(await stockOf(productId)).toEqual({ cached: 8, sum: 8 });
  });

  it('sin vehículo también se cobra: la venta queda con vehicleId NULL', async () => {
    const result = await maintenances.create(businessId, userId, {
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
      charge,
    });

    const sale = await prisma.sale.findFirstOrThrow({
      where: { maintenanceId: result.maintenance.id },
    });
    expect(sale.vehicleId).toBeNull();
  });

  it('cobro posterior idempotente: la misma clave, en paralelo y repetida, crea una sola venta', async () => {
    const { maintenance } = await createMaintenance();
    const key = randomUUID();

    const parallel = await Promise.all([
      chargeWithKey(maintenance.id, key),
      chargeWithKey(maintenance.id, key),
      chargeWithKey(maintenance.id, key),
    ]);
    const replay = await chargeWithKey(maintenance.id, key);

    const ids = new Set([...parallel, replay].map((r) => r.body.id));
    expect(ids.size).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(await prisma.sale.count({ where: { maintenanceId: maintenance.id } })).toBe(1);

    await expect(chargeWithKey(maintenance.id, randomUUID())).rejects.toMatchObject({
      code: 'MAINTENANCE_ALREADY_CHARGED',
    });
  });

  it('dos cobros simultáneos con claves distintas: uno cobra y el otro 409 MAINTENANCE_ALREADY_CHARGED', async () => {
    const { maintenance } = await createMaintenance();

    const results = await Promise.allSettled([
      chargeWithKey(maintenance.id, randomUUID()),
      chargeWithKey(maintenance.id, randomUUID()),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'MAINTENANCE_ALREADY_CHARGED' });
    expect(await prisma.sale.count({ where: { maintenanceId: maintenance.id } })).toBe(1);
  });
});

describe('Anulación conjunta contra Postgres (R6, B-154)', () => {
  it('anular uno cobrado deja ambos VOIDED con el mismo motivo; la relación queda y no se vuelve a cobrar', async () => {
    const productId = await createProduct(10);
    const { maintenance, sale } = await createMaintenance({
      items: [{ productId, quantity: 3 }],
      charge,
    });

    await maintenances.void(businessId, userId, maintenance.id, { reason: 'Error de registro' });

    const storedSale = await prisma.sale.findFirstOrThrow({ where: { id: sale!.id } });
    expect(storedSale).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Error de registro',
      voidedById: userId,
      maintenanceId: maintenance.id,
    });
    expect(
      await prisma.inventoryMovement.count({
        where: { type: InventoryMovementType.SALE_VOID, refId: sale!.id },
      }),
    ).toBe(0);
    expect(await stockOf(productId)).toEqual({ cached: 10, sum: 10 });
    expect(await prisma.sale.count({ where: { maintenanceId: maintenance.id } })).toBe(1);

    await expect(chargeWithKey(maintenance.id, randomUUID())).rejects.toMatchObject({
      code: 'MAINTENANCE_VOIDED',
    });
  });

  it('si la venta ya estaba VOIDED, la anulación del mantenimiento continúa sin tocarla', async () => {
    const { maintenance, sale } = await createMaintenance({ charge });
    await prisma.sale.update({
      where: { id: sale!.id },
      data: { status: 'VOIDED', voidReason: 'Antes', voidedAt: new Date(), voidedById: userId },
    });

    const voided = await maintenances.void(businessId, userId, maintenance.id, {
      reason: 'Después',
    });

    expect(voided.maintenance.status).toBe('VOIDED');
    expect(voided.sale).toMatchObject({ id: sale!.id, status: 'VOIDED', voidReason: 'Antes' });
    const storedSale = await prisma.sale.findFirstOrThrow({ where: { id: sale!.id } });
    expect(storedSale).toMatchObject({ status: 'VOIDED', voidReason: 'Antes' });
  });

  it('anular sin motivo: VALIDATION_ERROR y ni el mantenimiento ni la venta cambian', async () => {
    const { maintenance, sale } = await createMaintenance({ charge });

    await expect(
      maintenances.void(businessId, userId, maintenance.id, { reason: '   ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(
      (await prisma.maintenance.findFirstOrThrow({ where: { id: maintenance.id } })).status,
    ).toBe('ACTIVE');
    expect((await prisma.sale.findFirstOrThrow({ where: { id: sale!.id } })).status).toBe('ACTIVE');
  });

  it('dos anulaciones simultáneas de uno cobrado: 200 y 409, un solo MAINTENANCE_VOID y la venta anulada una vez', async () => {
    const productId = await createProduct(10);
    const { maintenance, sale } = await createMaintenance({
      items: [{ productId, quantity: 4 }],
      charge,
    });

    const results = await Promise.allSettled([
      voidWithKey(maintenance.id, 'A'),
      voidWithKey(maintenance.id, 'B'),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const loser = rejected[0]!.reason as { code: string; getStatus(): number };
    expect(loser.code).toBe('MAINTENANCE_ALREADY_VOIDED');
    expect(loser.getStatus()).toBe(409);

    const winnerReason = ok[0]!.value.body.maintenance.voidReason;
    expect(
      await prisma.inventoryMovement.count({
        where: { type: InventoryMovementType.MAINTENANCE_VOID, refId: maintenance.id },
      }),
    ).toBe(1);
    expect(await stockOf(productId)).toEqual({ cached: 10, sum: 10 });
    const storedSale = await prisma.sale.findFirstOrThrow({ where: { id: sale!.id } });
    expect(storedSale).toMatchObject({ status: 'VOIDED', voidReason: winnerReason });
  });

  it('cobro y anulación simultáneos: nunca queda una venta ACTIVE de un mantenimiento VOIDED', async () => {
    for (let i = 0; i < 5; i++) {
      const { maintenance } = await createMaintenance();

      await Promise.allSettled([
        chargeWithKey(maintenance.id, randomUUID()),
        voidWithKey(maintenance.id, 'Carrera'),
      ]);

      const stored = await prisma.maintenance.findFirstOrThrow({ where: { id: maintenance.id } });
      expect(stored.status).toBe('VOIDED');
      const activeSales = await prisma.sale.count({
        where: { maintenanceId: maintenance.id, status: 'ACTIVE' },
      });
      expect(activeSales).toBe(0);
    }
  });
});

describe('Venta MAINTENANCE y lecturas contra Postgres (R6, B-155/B-156)', () => {
  it('POST /sales/:id/void de una venta MAINTENANCE: 409 SALE_MANAGED_BY_MAINTENANCE sin tocar venta ni mantenimiento', async () => {
    const { maintenance, sale } = await createMaintenance({ charge });

    await expect(
      salesService.void(businessId, userId, sale!.id, { reason: 'desde ventas' }),
    ).rejects.toMatchObject({ code: 'SALE_MANAGED_BY_MAINTENANCE', status: 409 });

    const storedSale = await prisma.sale.findFirstOrThrow({ where: { id: sale!.id } });
    expect(storedSale).toMatchObject({ status: 'ACTIVE', voidReason: null, voidedAt: null });
    const storedMaintenance = await prisma.maintenance.findFirstOrThrow({
      where: { id: maintenance.id },
    });
    expect(storedMaintenance.status).toBe('ACTIVE');
  });

  it('findOne y listByVehicle devuelven el cobro con su línea, y null sin cobro; tras anular, la venta VOIDED', async () => {
    const charged = await createMaintenance({ charge });
    const uncharged = await createMaintenance();

    const detail = await maintenances.findOne(businessId, charged.maintenance.id);
    expect(detail.sale).toMatchObject({ id: charged.sale!.id, status: 'ACTIVE' });
    expect(detail.sale!.lines).toEqual([expect.objectContaining({ kind: 'SERVICE' })]);
    expect((await maintenances.findOne(businessId, uncharged.maintenance.id)).sale).toBeNull();

    const history = await maintenances.listByVehicle(businessId, vehicleId);
    const byId = new Map(history.map((m) => [m.id, m]));
    expect(byId.get(charged.maintenance.id)!.sale?.id).toBe(charged.sale!.id);
    expect(byId.get(uncharged.maintenance.id)!.sale).toBeNull();

    const voided = await maintenances.void(businessId, userId, charged.maintenance.id, {
      reason: 'Fin',
    });
    expect(voided.sale).toMatchObject({
      id: charged.sale!.id,
      status: 'VOIDED',
      voidReason: 'Fin',
    });
    expect((await maintenances.findOne(businessId, charged.maintenance.id)).sale?.status).toBe(
      'VOIDED',
    );
  });
});
