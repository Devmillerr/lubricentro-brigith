import { randomUUID } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PayablesService } from '../../src/payables/payables.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';
import { SuppliersService } from '../../src/suppliers/suppliers.service';

/**
 * Idempotencia atómica contra Postgres real: la reserva de la clave, la
 * operación (venta, recepción, pago) y la respuesta guardada se confirman
 * juntas. Simula lo que antes duplicaba: la operación se guardó pero falló
 * el paso siguiente (guardar la respuesta, la función cortada, la red), el
 * cliente no supo el resultado y repitió con la misma clave.
 *
 * Para fallar justo después de la operación sin tocar el código, el handler
 * lanza un error después de que el servicio terminó (como una función cortada).
 *
 * Usa `TEST_DATABASE_URL`. Cada corrida crea sus propios negocios.
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
const sales = new SalesService(prisma);
const inventory = new InventoryService(prisma);
const payables = new PayablesService(prisma);
const suppliers = new SuppliersService(prisma);
const idempotency = new IdempotencyService(prisma);

const NOW = new Date('2026-10-10T17:00:00.000Z');

interface Tenant {
  businessId: string;
  userId: string;
  supplierId: string;
  productId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `IDEM ${suffix}`, slug: `idem-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'IDEM', username: `idem-${suffix}`, passwordHash: 'x' },
  });
  const supplier = await suppliers.create(business.id, user.id, { name: 'Distribuidora' });
  const product = await prisma.product.create({
    data: { businessId: business.id, name: `Aceite ${suffix}`, unit: 'litro', salePrice: 30 },
  });
  return {
    businessId: business.id,
    userId: user.id,
    supplierId: supplier.id,
    productId: product.id,
  };
}

/** Falla después de que la operación terminó (función cortada, error al responder). */
function failAfterSaving(): never {
  throw new Error('falla después de guardar');
}

function run<T>(tenant: Tenant, key: string, endpoint: string, handler: () => Promise<T>) {
  return idempotency.run({
    businessId: tenant.businessId,
    key,
    endpoint,
    requestHash: `hash-${endpoint}`,
    handler: async () => ({ status: 201, body: await handler() }),
  });
}

const count = {
  sales: (t: Tenant) => prisma.sale.count({ where: { businessId: t.businessId } }),
  receipts: (t: Tenant) => prisma.inventoryReceipt.count({ where: { businessId: t.businessId } }),
  payments: (t: Tenant) => prisma.supplierPayment.count({ where: { businessId: t.businessId } }),
  movements: (t: Tenant) => prisma.inventoryMovement.count({ where: { businessId: t.businessId } }),
  records: (t: Tenant) => prisma.idempotencyRecord.count({ where: { businessId: t.businessId } }),
};

function sell(tenant: Tenant) {
  return sales.create(tenant.businessId, tenant.userId, {
    paymentMethod: PaymentMethod.CASH,
    lines: [{ productId: tenant.productId, quantity: 1, unitPrice: 30 }],
  });
}

function receiveOnCredit(tenant: Tenant) {
  return inventory.createReceiptBatch(
    tenant.businessId,
    tenant.userId,
    {
      acknowledgePossibleDuplicate: true,
      supplierId: tenant.supplierId,
      currency: 'PEN',
      paymentTerms: 'CREDIT',
      occurredAt: '2026-09-15T15:00:00.000Z',
      purchaseDate: '2026-09-15',
      lines: [{ productId: tenant.productId, quantity: 10, purchaseCost: 500 }],
    },
    NOW,
  );
}

function pay(tenant: Tenant, payableId: string) {
  return payables.addPayment(
    tenant.businessId,
    tenant.userId,
    payableId,
    { paidOn: '2026-10-10', paymentCurrency: 'PEN', amountPaid: 100, method: 'TRANSFER' },
    NOW,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Idempotencia atómica (Postgres real)', () => {
  it('venta: si falla después de guardar, no queda nada; el reintento con la misma clave la crea una sola vez', async () => {
    const tenant = await createTenant();
    const key = randomUUID();

    await expect(
      run(tenant, key, '/sales', async () => {
        await sell(tenant);
        failAfterSaving();
      }),
    ).rejects.toThrow();
    expect(await count.sales(tenant)).toBe(0);
    expect(await count.movements(tenant)).toBe(0);
    expect(await count.records(tenant)).toBe(0);

    const retry = await run(tenant, key, '/sales', async () => ({
      id: (await sell(tenant)).sale.id,
    }));
    const replay = await run(tenant, key, '/sales', async () => ({
      id: (await sell(tenant)).sale.id,
    }));

    expect(retry.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.body).toEqual(retry.body);
    expect(await count.sales(tenant)).toBe(1);
  });

  it('recepción a crédito: si falla después de guardar, no queda recepción, deuda, stock ni reserva', async () => {
    const tenant = await createTenant();
    const key = randomUUID();

    await expect(
      run(tenant, key, '/inventory/receipts', async () => {
        await receiveOnCredit(tenant);
        failAfterSaving();
      }),
    ).rejects.toThrow();

    expect(await count.receipts(tenant)).toBe(0);
    expect(await prisma.supplierPayable.count({ where: { businessId: tenant.businessId } })).toBe(
      0,
    );
    expect(await count.movements(tenant)).toBe(0);
    expect(await count.records(tenant)).toBe(0);

    await run(tenant, key, '/inventory/receipts', async () => ({
      id: (await receiveOnCredit(tenant)).receipt.id,
    }));
    await run(tenant, key, '/inventory/receipts', async () => ({
      id: (await receiveOnCredit(tenant)).receipt.id,
    }));
    expect(await count.receipts(tenant)).toBe(1);
  });

  it('pago a proveedor: si falla después de guardar, el saldo no cambia; repetir no paga dos veces', async () => {
    const tenant = await createTenant();
    const payableId = (await receiveOnCredit(tenant)).payable!.id;
    const key = randomUUID();

    await expect(
      run(tenant, key, '/payables/payments', async () => {
        await pay(tenant, payableId);
        failAfterSaving();
      }),
    ).rejects.toThrow();
    expect(await count.payments(tenant)).toBe(0);

    const first = await run(tenant, key, '/payables/payments', async () => ({
      balance: (await pay(tenant, payableId)).balance,
    }));
    const again = await run(tenant, key, '/payables/payments', async () => ({
      balance: (await pay(tenant, payableId)).balance,
    }));

    expect(await count.payments(tenant)).toBe(1);
    expect(again.replayed).toBe(true);
    expect(again.body).toEqual(first.body);
  });

  it('dos peticiones simultáneas con la misma clave: una sola venta y la misma respuesta', async () => {
    const tenant = await createTenant();
    const key = randomUUID();
    const handler = async () => {
      const sale = await sell(tenant);
      await sleep(300); // la operación sigue abierta mientras llega la segunda
      return { id: sale.sale.id };
    };

    const [a, b] = await Promise.all([
      run(tenant, key, '/sales', handler),
      run(tenant, key, '/sales', handler),
    ]);

    expect(await count.sales(tenant)).toBe(1);
    expect(a.body).toEqual(b.body);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
  });

  it('claves distintas con la misma venta: son dos operaciones', async () => {
    const tenant = await createTenant();
    await run(tenant, randomUUID(), '/sales', async () => ({ id: (await sell(tenant)).sale.id }));
    await run(tenant, randomUUID(), '/sales', async () => ({ id: (await sell(tenant)).sale.id }));
    expect(await count.sales(tenant)).toBe(2);
  });

  it('un error de dominio del handler (P2002 propio) no se confunde con la clave repetida', async () => {
    const tenant = await createTenant();
    const ruc = String(Date.now()).slice(-11).padStart(11, '2');
    await suppliers.create(tenant.businessId, tenant.userId, { name: 'Con RUC', taxId: ruc });

    await expect(
      run(tenant, randomUUID(), '/suppliers', () =>
        suppliers.create(tenant.businessId, tenant.userId, { name: 'Repetido', taxId: ruc }),
      ),
    ).rejects.toMatchObject({ code: expect.not.stringMatching(/^IDEMPOTENCY_/) });
    expect(await count.records(tenant)).toBe(0);
  });

  it('una reserva antigua sin respuesta (versión anterior) devuelve 409 en curso, sin colgarse', async () => {
    const tenant = await createTenant();
    const key = randomUUID();
    await prisma.idempotencyRecord.create({
      data: { businessId: tenant.businessId, key, endpoint: '/sales', requestHash: 'hash-/sales' },
    });

    const started = Date.now();
    await expect(
      run(tenant, key, '/sales', async () => ({ id: (await sell(tenant)).sale.id })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await count.sales(tenant)).toBe(0);
  });
});
