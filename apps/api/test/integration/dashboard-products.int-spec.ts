import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';

/**
 * Productos más vendidos y consumo de mantenimiento del dashboard (R7, B-162,
 * DEC-81, BR-D5) contra Postgres real. Las operaciones pasan por los servicios
 * de verdad, así que los movimientos salen del ledger real:
 *
 * - venta de mostrador → línea `PRODUCT` (+ `SALE` si el producto controla stock);
 * - mantenimiento → `MAINTENANCE_USE` con `occurredAt = performedAt`;
 * - anulaciones → `SALE_VOID`/`MAINTENANCE_VOID` con la fecha de la anulación;
 * - conteo, recepción y ajuste → `COUNT`, `PURCHASE_IN`, `ADJUSTMENT` (no son consumo).
 *
 * Junio de 2026, America/Lima (UTC−5). El lunes 15 es el día principal.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas. Cada corrida crea
 * sus propios negocios.
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
const dashboard = new DashboardService(prisma);
const inventory = new InventoryService(prisma);
const sales = new SalesService(prisma);
const maintenances = new MaintenancesService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
  maintenanceTypeId: string;
}

/** Hora local de Lima (UTC−5) como ISO. */
function lima(localIso: string): string {
  return new Date(`${localIso}-05:00`).toISOString();
}

async function createTenant(label: string): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R7 ${label} ${suffix}`, slug: `r7-${label}-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'R7',
      username: `r7-${label}-${suffix}`,
      passwordHash: 'x',
    },
  });
  const type = await prisma.maintenanceType.create({
    data: { businessId: business.id, name: 'Cambio de aceite' },
  });
  return { businessId: business.id, userId: user.id, maintenanceTypeId: type.id };
}

async function createProduct(
  tenant: Tenant,
  name: string,
  opts: { unit?: string; counted?: number; tracksStock?: boolean } = {},
): Promise<string> {
  const product = await prisma.product.create({
    data: {
      businessId: tenant.businessId,
      name,
      unit: opts.unit ?? 'unidad',
      tracksStock: opts.tracksStock ?? true,
    },
  });
  if (opts.counted !== undefined) {
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: opts.counted,
      occurredAt: lima('2026-06-01T08:00:00'),
    });
  }
  return product.id;
}

function sell(
  tenant: Tenant,
  at: string,
  lines: { productId: string; quantity: number; unitPrice: number }[],
) {
  return sales.create(tenant.businessId, tenant.userId, {
    paymentMethod: 'CASH',
    occurredAt: at,
    lines,
  });
}

function maintain(
  tenant: Tenant,
  performedAt: string,
  items: { productId: string; quantity: number }[],
) {
  return maintenances.create(tenant.businessId, tenant.userId, {
    maintenanceTypeId: tenant.maintenanceTypeId,
    performedAt,
    items,
  });
}

let t: Tenant;
let aceite: string;
let filtro: string;
let servicio: string;
let bujia: string;

beforeAll(async () => {
  await prisma.$connect();
  t = await createTenant('prod');
  aceite = await createProduct(t, 'Aceite 20W50', { unit: 'litro', counted: 100 });
  filtro = await createProduct(t, 'Filtro de aceite', { counted: 50 });
  servicio = await createProduct(t, 'Servicio sin stock', { tracksStock: false });
  bujia = await createProduct(t, 'Bujía', { counted: 20 });

  // Lunes 15: dos ventas (la segunda a las 23:30) y una anulada.
  await sell(t, lima('2026-06-15T10:00:00'), [
    { productId: aceite, quantity: 2.5, unitPrice: 30 },
    { productId: filtro, quantity: 1, unitPrice: 25 },
    { productId: servicio, quantity: 1, unitPrice: 10 },
  ]);
  await sell(t, lima('2026-06-15T23:30:00'), [
    { productId: aceite, quantity: 1.25, unitPrice: 30 },
  ]);
  const voided = await sell(t, lima('2026-06-15T12:00:00'), [
    { productId: aceite, quantity: 10, unitPrice: 30 },
  ]);
  await sales.void(t.businessId, t.userId, voided.sale.id, { reason: 'prueba' });

  // Lunes 15: un mantenimiento vigente y uno anulado.
  await maintain(t, lima('2026-06-15T09:00:00'), [
    { productId: aceite, quantity: 4 },
    { productId: filtro, quantity: 1 },
  ]);
  const voidedMaintenance = await maintain(t, lima('2026-06-15T15:00:00'), [
    { productId: aceite, quantity: 3 },
  ]);
  await maintenances.void(t.businessId, t.userId, voidedMaintenance.maintenance.id, {
    reason: 'prueba',
  });

  // Martes 16 a las 00:00 y 00:10: fuera del lunes, dentro de la semana.
  await maintain(t, lima('2026-06-16T00:00:00'), [{ productId: filtro, quantity: 2 }]);
  await sell(t, lima('2026-06-16T00:10:00'), [{ productId: filtro, quantity: 3, unitPrice: 25 }]);

  // Lunes 15, movimientos que no son consumo: recepción, conteo y un ajuste a la baja.
  await inventory.createReceiptBatch(t.businessId, t.userId, {
    occurredAt: lima('2026-06-15T08:00:00'),
    lines: [
      { productId: aceite, quantity: 20 },
      { productId: bujia, quantity: 5 },
    ],
  });
  await inventory.count(t.businessId, t.userId, {
    productId: bujia,
    countedQuantity: 25,
    occurredAt: lima('2026-06-15T08:30:00'),
  });
  // El ajuste no acepta fecha: se inserta con el mismo formato que escribe el ledger.
  await prisma.inventoryMovement.create({
    data: {
      businessId: t.businessId,
      productId: bujia,
      type: 'ADJUSTMENT',
      quantityDelta: -5,
      reason: 'Producto dañado',
      previousBalance: 25,
      resultingBalance: 20,
      occurredAt: lima('2026-06-15T18:00:00'),
      createdById: t.userId,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /dashboard: productos (B-162)', () => {
  it('lunes 15: vendido en mostrador y consumo de mantenimiento, por separado y con cantidades exactas', async () => {
    const result = await dashboard.get(t.businessId, { period: 'today', date: '2026-06-15' });

    // 2.5 + 1 + 1 + 1.25 (la venta anulada no cuenta).
    expect(result.productsSold).toEqual({ units: '5.75' });
    expect(result.topProducts).toEqual([
      // 3.75 vendidos + 4 en mantenimiento (el mantenimiento anulado no cuenta).
      {
        productId: aceite,
        name: 'Aceite 20W50',
        soldUnits: '3.75',
        soldAmount: '112.5',
        maintenanceUnits: '4',
      },
      {
        productId: filtro,
        name: 'Filtro de aceite',
        soldUnits: '1',
        soldAmount: '25',
        maintenanceUnits: '1',
      },
      // Sin control de stock: no tiene movimiento SALE, pero se vendió (línea PRODUCT).
      {
        productId: servicio,
        name: 'Servicio sin stock',
        soldUnits: '1',
        soldAmount: '10',
        maintenanceUnits: '0',
      },
    ]);
  });

  it('el consumo en mantenimiento no suma ingresos: el dinero es solo lo vendido', async () => {
    const result = await dashboard.get(t.businessId, { period: 'today', date: '2026-06-15' });
    // 75 + 25 + 10 + 37.5. Ningún monto por los 4 L y el filtro del mantenimiento.
    expect(result.totals.total).toBe('147.5');
    expect(result.totals.bySource).toEqual({ counter: '147.5', wash: '0', maintenance: '0' });
    const soldAmounts = result.topProducts.reduce(
      (sum, p) => sum.plus(p.soldAmount),
      new Prisma.Decimal(0),
    );
    expect(soldAmounts.toString()).toBe(result.totals.bySource.counter);
  });

  it('recepción, conteo y ajuste a la baja no son consumo: la bujía no aparece', async () => {
    const result = await dashboard.get(t.businessId, { period: 'today', date: '2026-06-15' });
    expect(result.topProducts.map((p) => p.productId)).not.toContain(bujia);
    // Y la recepción de 20 L de aceite no reduce ni aumenta su consumo.
    expect(result.topProducts.find((p) => p.productId === aceite)?.maintenanceUnits).toBe('4');
  });

  it('[from, to): lo del martes 00:00 y 00:10 cae en el martes, no en el lunes', async () => {
    const tuesday = await dashboard.get(t.businessId, { period: 'today', date: '2026-06-16' });
    expect(tuesday.topProducts).toEqual([
      {
        productId: filtro,
        name: 'Filtro de aceite',
        soldUnits: '3',
        soldAmount: '75',
        maintenanceUnits: '2',
      },
    ]);
    expect(tuesday.productsSold).toEqual({ units: '3' });

    const week = await dashboard.get(t.businessId, { period: 'week', date: '2026-06-18' });
    expect(week.topProducts.map((p) => [p.name, p.soldUnits, p.maintenanceUnits])).toEqual([
      ['Aceite 20W50', '3.75', '4'],
      ['Filtro de aceite', '4', '3'],
      ['Servicio sin stock', '1', '0'],
    ]);
  });

  it('otro negocio con los mismos productos y consumo el mismo día no se mezcla', async () => {
    const other = await createTenant('prod-otro');
    const otherAceite = await createProduct(other, 'Aceite 20W50', { unit: 'litro' });
    await sell(other, lima('2026-06-15T10:00:00'), [
      { productId: otherAceite, quantity: 50, unitPrice: 1 },
    ]);
    await maintain(other, lima('2026-06-15T10:00:00'), [{ productId: otherAceite, quantity: 7 }]);

    const own = await dashboard.get(t.businessId, { period: 'today', date: '2026-06-15' });
    expect(own.topProducts.map((p) => p.productId)).toEqual([aceite, filtro, servicio]);
    expect(own.productsSold).toEqual({ units: '5.75' });

    const foreign = await dashboard.get(other.businessId, { period: 'today', date: '2026-06-15' });
    expect(foreign.topProducts).toEqual([
      {
        productId: otherAceite,
        name: 'Aceite 20W50',
        soldUnits: '50',
        soldAmount: '50',
        maintenanceUnits: '7',
      },
    ]);
  });

  it('sin consumo en el período: productsSold en cero y ranking vacío', async () => {
    const result = await dashboard.get(t.businessId, { period: 'month', date: '2026-01-10' });
    expect(result.productsSold).toEqual({ units: '0' });
    expect(result.topProducts).toEqual([]);
  });
});

describe('GET /dashboard: top 10 determinista (B-162)', () => {
  it('máximo 10, por consumo total descendente, luego nombre y luego id; estable entre llamadas', async () => {
    const tenant = await createTenant('top');
    const dupA = await createProduct(tenant, 'Dup');
    const dupB = await createProduct(tenant, 'Dup');
    const named: Record<string, string> = {};
    const quantities: [string, number][] = [
      ['P01', 5],
      ['P02', 4],
      ['P03', 4],
      ['P04', 3],
      ['P05', 3],
      ['P06', 2],
      ['P07', 2],
      ['P08', 1],
      ['P09', 1],
      ['P10', 1],
    ];
    for (const [name] of quantities) named[name] = await createProduct(tenant, name);
    // P03 llega a 4 sumando venta y mantenimiento: el orden usa el total.
    await sell(tenant, lima('2026-06-15T10:00:00'), [
      { productId: dupA, quantity: 5, unitPrice: 1 },
      { productId: dupB, quantity: 5, unitPrice: 1 },
      ...quantities
        .filter(([name]) => name !== 'P03')
        .map(([name, quantity]) => ({ productId: named[name]!, quantity, unitPrice: 1 })),
      { productId: named.P03!, quantity: 1, unitPrice: 1 },
    ]);
    await maintain(tenant, lima('2026-06-15T11:00:00'), [{ productId: named.P03!, quantity: 3 }]);

    const [firstDup, secondDup] = [dupA, dupB].sort();
    const expected = [
      firstDup,
      secondDup,
      named.P01,
      named.P02,
      named.P03,
      named.P04,
      named.P05,
      named.P06,
      named.P07,
      named.P08,
    ];
    const first = await dashboard.get(tenant.businessId, { period: 'today', date: '2026-06-15' });
    const second = await dashboard.get(tenant.businessId, { period: 'today', date: '2026-06-15' });
    expect(first.topProducts.map((p) => p.productId)).toEqual(expected);
    expect(second.topProducts).toEqual(first.topProducts);
    expect(first.topProducts.find((p) => p.productId === named.P03)).toMatchObject({
      soldUnits: '1',
      maintenanceUnits: '3',
    });
    // productsSold cuenta todo lo vendido, no solo los 10 del ranking: 5 + 5 + (5+4+3+3+2+2+1+1+1) + 1.
    expect(first.productsSold).toEqual({ units: '33' });
  });
});
