import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProductsService } from '../../src/products/products.service';

/**
 * Compras por mes (DEC-94) contra Postgres real: el historial filtrado por
 * mes en la zona del negocio, la vista previa de cada recepción y lo
 * comprado de cada producto, sin estimar nada de lo que no tiene monto.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas. Cada prueba crea
 * su propio negocio.
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
const products = new ProductsService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `DEC-94 ${suffix}`, slug: `dec94-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'DEC-94',
      username: `dec94-${suffix}`,
      passwordHash: 'no-se-usa',
    },
  });
  return { businessId: business.id, userId: user.id };
}

async function createProduct(tenant: Tenant, name: string, unit: string) {
  const product = await products.create(tenant.businessId, { name, unit });
  return product.id;
}

function receive(
  tenant: Tenant,
  occurredAt: string,
  lines: { productId: string; quantity: number; purchaseCost?: number }[],
) {
  return inventory.createReceiptBatch(tenant.businessId, tenant.userId, { occurredAt, lines });
}

/** Lo que una consulta no debe cambiar: movimientos, cabeceras y saldos. */
async function snapshot(tenant: Tenant) {
  const [movements, receipts, stock] = await Promise.all([
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
      select: { id: true, stockQuantity: true, salePrice: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return JSON.stringify({ movements, receipts, stock });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Historial de recepciones por mes (DEC-94)', () => {
  it('con mes: solo las recepciones de ese mes en la hora de Lima; sin mes: todo el historial', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, 'Filtro', 'unidad');
    // Lima es UTC−5: el 1 de octubre 00:30 de Lima ya es octubre; el 30 de
    // septiembre 23:30 de Lima (04:30 UTC del 1) todavía no.
    const { receipt: octStart } = await receive(tenant, '2026-10-01T05:30:00.000Z', [
      { productId, quantity: 1, purchaseCost: 10 },
    ]);
    const { receipt: octMid } = await receive(tenant, '2026-10-15T15:00:00.000Z', [
      { productId, quantity: 2 },
    ]);
    const { receipt: sepEnd } = await receive(tenant, '2026-10-01T04:30:00.000Z', [
      { productId, quantity: 3, purchaseCost: 30 },
    ]);
    const { receipt: nov } = await receive(tenant, '2026-11-01T05:00:00.000Z', [
      { productId, quantity: 4 },
    ]);

    const october = await inventory.listReceipts(tenant.businessId, { month: '2026-10' });
    expect(october.items.map((r) => r.id)).toEqual([octMid.id, octStart.id]);

    const september = await inventory.listReceipts(tenant.businessId, { month: '2026-09' });
    expect(september.items.map((r) => r.id)).toEqual([sepEnd.id]);

    const empty = await inventory.listReceipts(tenant.businessId, { month: '2026-08' });
    expect(empty).toEqual({ items: [], nextCursor: null });

    const all = await inventory.listReceipts(tenant.businessId, {});
    expect(all.items.map((r) => r.id)).toEqual([nov.id, octMid.id, octStart.id, sepEnd.id]);

    // El resumen del mes y la lista del mes cuentan lo mismo.
    const summary = await inventory.receiptsMonthSummary(tenant.businessId, '2026-10');
    expect(summary.receiptCount).toBe(october.items.length);
  });

  it('pagina dentro del mes sin mezclar otros meses', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, 'Silicona', 'unidad');
    for (const day of ['03', '05', '07']) {
      await receive(tenant, `2026-10-${day}T15:00:00.000Z`, [{ productId, quantity: 1 }]);
    }
    await receive(tenant, '2026-09-20T15:00:00.000Z', [{ productId, quantity: 1 }]);

    const first = await inventory.listReceipts(tenant.businessId, { month: '2026-10', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await inventory.listReceipts(tenant.businessId, {
      month: '2026-10',
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const dates = [...first.items, ...second.items].map((r) => r.occurredAt.toISOString());
    expect(dates.every((date) => date.startsWith('2026-10'))).toBe(true);
  });

  it('cada fila trae qué llegó: hasta 3 productos por nombre, con unidad, cantidad y monto', async () => {
    const tenant = await createTenant();
    const atf = await createProduct(tenant, 'ATF, Brikson lt', 'unidad');
    const granel = await createProduct(tenant, 'Aceite Balde granel', 'litro');
    const silicona = await createProduct(tenant, 'Silicona 300ml', 'unidad');
    const filtro = await createProduct(tenant, 'Filtro de aire', 'unidad');

    const { receipt: multi } = await receive(tenant, '2026-10-07T15:00:00.000Z', [
      { productId: silicona, quantity: 12 },
      { productId: atf, quantity: 1, purchaseCost: 341.6 },
      { productId: granel, quantity: 20, purchaseCost: 115 },
      { productId: filtro, quantity: 2, purchaseCost: 40 },
    ]);
    const { receipt: single } = await receive(tenant, '2026-10-08T15:00:00.000Z', [
      { productId: granel, quantity: 0.5 },
    ]);

    const page = await inventory.listReceipts(tenant.businessId, { month: '2026-10' });
    const byId = new Map(page.items.map((r) => [r.id, r]));

    expect(byId.get(multi.id)).toMatchObject({
      lineCount: 4,
      totalCost: expect.anything(),
      preview: [
        {
          productId: granel,
          name: 'Aceite Balde granel',
          unit: 'litro',
          quantity: '20',
          purchaseCost: '115.00',
        },
        {
          productId: atf,
          name: 'ATF, Brikson lt',
          unit: 'unidad',
          quantity: '1',
          purchaseCost: '341.60',
        },
        {
          productId: filtro,
          name: 'Filtro de aire',
          unit: 'unidad',
          quantity: '2',
          purchaseCost: '40.00',
        },
      ],
    });
    expect(byId.get(multi.id)!.totalCost!.toString()).toBe('496.6');
    expect(byId.get(single.id)).toMatchObject({
      lineCount: 1,
      totalCost: null,
      preview: [{ productId: granel, unit: 'litro', quantity: '0.5', purchaseCost: null }],
    });
  });
});

describe('Compras del mes por producto (DEC-94)', () => {
  it('agrupa por producto en su unidad, separa lo que no tiene monto y calcula el costo unitario', async () => {
    const tenant = await createTenant();
    const atf = await createProduct(tenant, 'ATF, Brikson lt', 'unidad');
    const granel = await createProduct(tenant, 'Aceite Balde granel', 'litro');
    const silicona = await createProduct(tenant, 'Silicona 300ml', 'unidad');

    // Octubre: el balde se recibe con el atajo "+1 Balde (20 L)" = 20 litros.
    await receive(tenant, '2026-10-02T15:00:00.000Z', [{ productId: silicona, quantity: 12 }]);
    await receive(tenant, '2026-10-07T14:46:00.000Z', [
      { productId: granel, quantity: 20, purchaseCost: 115 },
    ]);
    await receive(tenant, '2026-10-07T14:54:00.000Z', [
      { productId: atf, quantity: 1, purchaseCost: 341.6 },
      { productId: silicona, quantity: 1, purchaseCost: 88.62 },
    ]);
    // Otro mes: no entra.
    await receive(tenant, '2026-09-15T15:00:00.000Z', [
      { productId: granel, quantity: 20, purchaseCost: 999 },
    ]);

    const before = await snapshot(tenant);
    const october = await inventory.receiptsMonthSummary(tenant.businessId, '2026-10');

    expect(october).toMatchObject({
      receiptCount: 3,
      totalCost: '545.22',
      receiptsWithoutCost: 1,
      linesWithoutCost: 1,
    });
    expect(october.products).toEqual([
      {
        productId: atf,
        name: 'ATF, Brikson lt',
        brand: null,
        unit: 'unidad',
        quantity: '1',
        receiptCount: 1,
        totalCost: '341.60',
        quantityWithCost: '1',
        linesWithoutCost: 0,
        unitCost: '341.60',
      },
      {
        productId: granel,
        name: 'Aceite Balde granel',
        brand: null,
        unit: 'litro',
        quantity: '20',
        receiptCount: 1,
        totalCost: '115.00',
        quantityWithCost: '20',
        linesWithoutCost: 0,
        unitCost: '5.75',
      },
      {
        // 12 sin monto + 1 con monto: cuenta 13 recibidas, el costo usa solo la que tiene monto.
        productId: silicona,
        name: 'Silicona 300ml',
        brand: null,
        unit: 'unidad',
        quantity: '13',
        receiptCount: 2,
        totalCost: '88.62',
        quantityWithCost: '1',
        linesWithoutCost: 1,
        unitCost: '88.62',
      },
    ]);
    // La suma por producto coincide con el total del mes.
    const sum = october.products.reduce((acc, p) => acc + Math.round(Number(p.totalCost) * 100), 0);
    expect(sum).toBe(54522);

    // Consultar no cambia nada: ni movimientos, ni recepciones, ni saldos, ni precios.
    await inventory.listReceipts(tenant.businessId, { month: '2026-10' });
    expect(await snapshot(tenant)).toBe(before);
  });

  it('un mes solo con recepciones sin monto: cantidades y recepciones, sin total ni costo unitario', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, 'Filtro de aceite 916', 'unidad');
    await receive(tenant, '2026-10-01T15:00:00.000Z', [{ productId, quantity: 5 }]);
    await receive(tenant, '2026-10-03T15:00:00.000Z', [{ productId, quantity: 3 }]);

    const october = await inventory.receiptsMonthSummary(tenant.businessId, '2026-10');
    expect(october).toMatchObject({ receiptCount: 2, totalCost: '0.00', receiptsWithoutCost: 2 });
    expect(october.products).toEqual([
      expect.objectContaining({
        quantity: '8',
        receiptCount: 2,
        totalCost: '0.00',
        linesWithoutCost: 2,
        unitCost: null,
      }),
    ]);
  });

  it('un mes vacío o de otro negocio no trae productos', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, 'Refrigerante', 'litro');
    await receive(tenant, '2026-10-10T15:00:00.000Z', [
      { productId, quantity: 4, purchaseCost: 40 },
    ]);

    const empty = await inventory.receiptsMonthSummary(tenant.businessId, '2026-08');
    expect(empty).toMatchObject({ receiptCount: 0, totalCost: '0.00', products: [] });

    const other = await createTenant();
    expect((await inventory.receiptsMonthSummary(other.businessId, '2026-10')).products).toEqual(
      [],
    );
    expect((await inventory.listReceipts(other.businessId, { month: '2026-10' })).items).toEqual(
      [],
    );
  });
});
