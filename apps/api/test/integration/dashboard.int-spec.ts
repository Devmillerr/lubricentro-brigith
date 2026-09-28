import { randomUUID } from 'node:crypto';
import type { PaymentMethod, SaleSource, SaleStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * `GET /dashboard` (R7, B-160/B-161, DEC-78 a DEC-80) contra Postgres real:
 * las agregaciones son SQL crudo, que el fake no ejecuta. Cubre los límites
 * del día en America/Lima (23:30 y 00:10), la semana de lunes a domingo, el
 * mes calendario, la exclusión de anuladas, el cobro de mantenimiento en otro
 * día que el servicio y el aislamiento entre negocios.
 *
 * Los datos se crean directo con Prisma para fijar `occurredAt`/`performedAt`
 * (el cobro real usa la hora del servidor, DEC-75). Junio de 2026: el lunes 15
 * abre la semana 15–21. Lima es UTC−5: 00:00 local = 05:00 UTC.
 *
 * El Postgres local de pruebas corre con la sesión en UTC−5, distinta de UTC:
 * si el SQL dependiera de la zona de la sesión, estos resultados cambiarían.
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

interface Tenant {
  businessId: string;
  userId: string;
  maintenanceTypeId: string;
}

/** Instante UTC de una hora local de Lima (UTC−5). */
function lima(localIso: string): Date {
  return new Date(`${localIso}-05:00`);
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

async function createSale(
  tenant: Tenant,
  opts: {
    source: SaleSource;
    paymentMethod: PaymentMethod;
    total: string;
    at: Date;
    status?: SaleStatus;
    washTypeId?: string;
    washName?: string;
    maintenanceId?: string;
  },
) {
  const kind =
    opts.source === 'WASH' ? 'WASH' : opts.source === 'MAINTENANCE' ? 'SERVICE' : 'PRODUCT';
  return prisma.sale.create({
    data: {
      businessId: tenant.businessId,
      source: opts.source,
      status: opts.status ?? 'ACTIVE',
      paymentMethod: opts.paymentMethod,
      total: opts.total,
      occurredAt: opts.at,
      createdById: tenant.userId,
      maintenanceId: opts.maintenanceId,
      ...(opts.status === 'VOIDED'
        ? { voidedAt: opts.at, voidedById: tenant.userId, voidReason: 'prueba' }
        : {}),
      lines: {
        create: [
          {
            businessId: tenant.businessId,
            kind,
            washTypeId: opts.washTypeId,
            descriptionSnapshot: opts.washName ?? `Línea ${kind}`,
            quantity: '1',
            unitPrice: opts.total,
            subtotal: opts.total,
            movesStock: false,
          },
        ],
      },
    },
  });
}

async function createMaintenance(tenant: Tenant, performedAt: Date, voided = false) {
  return prisma.maintenance.create({
    data: {
      businessId: tenant.businessId,
      maintenanceTypeId: tenant.maintenanceTypeId,
      performedAt,
      ...(voided
        ? {
            status: 'VOIDED',
            voidedAt: performedAt,
            voidedById: tenant.userId,
            voidReason: 'prueba',
          }
        : {}),
    },
  });
}

let a: Tenant;
let b: Tenant;
let autoId: string;
let motoId: string;

beforeAll(async () => {
  await prisma.$connect();
  a = await createTenant('a');
  b = await createTenant('b');
  const auto = await prisma.washType.create({ data: { businessId: a.businessId, name: 'Auto' } });
  const moto = await prisma.washType.create({
    data: { businessId: a.businessId, name: 'Moto lineal' },
  });
  autoId = auto.id;
  motoId = moto.id;

  // Lunes 15: mostrador a las 23:30 (ya es 16 en UTC) y una anulada.
  await createSale(a, {
    source: 'COUNTER',
    paymentMethod: 'CASH',
    total: '10.10',
    at: lima('2026-06-15T23:30:00'),
  });
  await createSale(a, {
    source: 'COUNTER',
    paymentMethod: 'CASH',
    total: '99.99',
    at: lima('2026-06-15T12:00:00'),
    status: 'VOIDED',
  });
  // Lunes 15: tres lavados.
  await createSale(a, {
    source: 'WASH',
    paymentMethod: 'YAPE',
    total: '15.00',
    at: lima('2026-06-15T10:00:00'),
    washTypeId: autoId,
    washName: 'Auto',
  });
  await createSale(a, {
    source: 'WASH',
    paymentMethod: 'CASH',
    total: '15.00',
    at: lima('2026-06-15T11:15:00'),
    washTypeId: autoId,
    washName: 'Auto',
  });
  await createSale(a, {
    source: 'WASH',
    paymentMethod: 'CASH',
    total: '8.00',
    at: lima('2026-06-15T12:40:00'),
    washTypeId: motoId,
    washName: 'Moto lineal',
  });

  // Mantenimientos del lunes 15: uno cobrado el martes 16, uno sin cobro y uno anulado (con su cobro anulado).
  const charged = await createMaintenance(a, lima('2026-06-15T09:00:00'));
  await createSale(a, {
    source: 'MAINTENANCE',
    paymentMethod: 'CASH',
    total: '95.90',
    at: lima('2026-06-16T10:00:00'),
    maintenanceId: charged.id,
  });
  await createMaintenance(a, lima('2026-06-15T16:00:00'));
  const voided = await createMaintenance(a, lima('2026-06-15T17:00:00'), true);
  await createSale(a, {
    source: 'MAINTENANCE',
    paymentMethod: 'YAPE',
    total: '50.00',
    at: lima('2026-06-15T17:05:00'),
    status: 'VOIDED',
    maintenanceId: voided.id,
  });

  // Martes 16 a las 00:10.
  await createSale(a, {
    source: 'COUNTER',
    paymentMethod: 'YAPE',
    total: '20.20',
    at: lima('2026-06-16T00:10:00'),
  });
  // Bordes de la semana: domingo 21 a las 23:59 (dentro) y lunes 22 a las 00:00 (semana siguiente).
  await createSale(a, {
    source: 'COUNTER',
    paymentMethod: 'CASH',
    total: '1.00',
    at: lima('2026-06-21T23:59:00'),
  });
  await createSale(a, {
    source: 'COUNTER',
    paymentMethod: 'CASH',
    total: '2.00',
    at: lima('2026-06-22T00:00:00'),
  });
  // Bordes del mes: 31 de mayo a las 23:30 y 1 de julio a las 00:00 (fuera de junio).
  await createSale(a, {
    source: 'COUNTER',
    paymentMethod: 'CASH',
    total: '3.00',
    at: lima('2026-05-31T23:30:00'),
  });
  await createSale(a, {
    source: 'COUNTER',
    paymentMethod: 'CASH',
    total: '4.00',
    at: lima('2026-07-01T00:00:00'),
  });

  // Otro negocio, el mismo lunes 15: nunca debe aparecer en el de "a".
  await createSale(b, {
    source: 'COUNTER',
    paymentMethod: 'CASH',
    total: '1000.00',
    at: lima('2026-06-15T10:00:00'),
  });
  const foreign = await createMaintenance(b, lima('2026-06-15T10:00:00'));
  await createSale(b, {
    source: 'MAINTENANCE',
    paymentMethod: 'YAPE',
    total: '500.00',
    at: lima('2026-06-15T11:00:00'),
    maintenanceId: foreign.id,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /dashboard: día (today)', () => {
  it('lunes 15: incluye la venta de las 23:30 y excluye la anulada; el cobro del martes no suma dinero', async () => {
    const result = await dashboard.get(a.businessId, { period: 'today', date: '2026-06-15' });

    expect(result.period).toEqual({
      kind: 'today',
      date: '2026-06-15',
      from: '2026-06-15T05:00:00.000Z',
      to: '2026-06-16T05:00:00.000Z',
      timezone: 'America/Lima',
    });
    expect(result.totals).toEqual({
      total: '48.1',
      cash: '33.1',
      yape: '15',
      salesCount: 4,
      bySource: { counter: '10.1', wash: '38', maintenance: '0' },
    });
    expect(result.washes).toEqual({
      count: 3,
      amount: '38',
      byType: [
        { washTypeId: autoId, name: 'Auto', count: 2, amount: '30' },
        { washTypeId: motoId, name: 'Moto lineal', count: 1, amount: '8' },
      ],
    });
    // Dos mantenimientos activos por performedAt: uno cobrado (aunque el cobro sea del 16) y uno sin cobro.
    expect(result.maintenances).toEqual({ count: 2, charged: 1, uncharged: 1 });
  });

  it('lunes 15: la serie por hora ubica cada venta en su hora local', async () => {
    const { series } = await dashboard.get(a.businessId, { period: 'today', date: '2026-06-15' });
    expect(series).toHaveLength(24);
    const nonZero = series.filter(
      (p) => p.counter !== '0' || p.wash !== '0' || p.maintenance !== '0',
    );
    expect(nonZero).toEqual([
      { bucket: '2026-06-15T15:00:00.000Z', counter: '0', wash: '15', maintenance: '0' }, // 10:00
      { bucket: '2026-06-15T16:00:00.000Z', counter: '0', wash: '15', maintenance: '0' }, // 11:15
      { bucket: '2026-06-15T17:00:00.000Z', counter: '0', wash: '8', maintenance: '0' }, // 12:40
      { bucket: '2026-06-16T04:00:00.000Z', counter: '10.1', wash: '0', maintenance: '0' }, // 23:30
    ]);
  });

  it('martes 16: la venta de las 00:10 y el cobro del mantenimiento, sin contarlo como mantenimiento', async () => {
    const result = await dashboard.get(a.businessId, { period: 'today', date: '2026-06-16' });
    expect(result.totals).toEqual({
      total: '116.1',
      cash: '95.9',
      yape: '20.2',
      salesCount: 2,
      bySource: { counter: '20.2', wash: '0', maintenance: '95.9' },
    });
    expect(result.maintenances).toEqual({ count: 0, charged: 0, uncharged: 0 });
    expect(result.washes).toEqual({ count: 0, amount: '0', byType: [] });
  });
});

describe('GET /dashboard: semana y mes', () => {
  it('semana del jueves 18 = lunes 15 a domingo 21: incluye el domingo 23:59, excluye el lunes 22 00:00', async () => {
    const result = await dashboard.get(a.businessId, { period: 'week', date: '2026-06-18' });
    expect(result.period.from).toBe('2026-06-15T05:00:00.000Z');
    expect(result.period.to).toBe('2026-06-22T05:00:00.000Z');
    expect(result.totals).toEqual({
      total: '165.2',
      cash: '130',
      yape: '35.2',
      salesCount: 7,
      bySource: { counter: '31.3', wash: '38', maintenance: '95.9' },
    });
    expect(result.maintenances).toEqual({ count: 2, charged: 1, uncharged: 1 });

    expect(result.series.map((p) => p.bucket)).toEqual([
      '2026-06-15T05:00:00.000Z',
      '2026-06-16T05:00:00.000Z',
      '2026-06-17T05:00:00.000Z',
      '2026-06-18T05:00:00.000Z',
      '2026-06-19T05:00:00.000Z',
      '2026-06-20T05:00:00.000Z',
      '2026-06-21T05:00:00.000Z',
    ]);
    expect(result.series[0]).toMatchObject({ counter: '10.1', wash: '38', maintenance: '0' });
    expect(result.series[1]).toMatchObject({ counter: '20.2', wash: '0', maintenance: '95.9' });
    expect(result.series[6]).toMatchObject({ counter: '1', wash: '0', maintenance: '0' });
  });

  it('mes de junio: incluye el lunes 22, excluye el 31 de mayo 23:30 y el 1 de julio 00:00', async () => {
    const result = await dashboard.get(a.businessId, { period: 'month', date: '2026-06-30' });
    expect(result.period.from).toBe('2026-06-01T05:00:00.000Z');
    expect(result.period.to).toBe('2026-07-01T05:00:00.000Z');
    expect(result.totals.salesCount).toBe(8);
    expect(result.totals.bySource).toEqual({ counter: '33.3', wash: '38', maintenance: '95.9' });
    expect(result.totals.total).toBe('167.2');
    expect(result.series).toHaveLength(30);
  });
});

describe('GET /dashboard: aislamiento y formato', () => {
  it('cada negocio ve solo lo suyo', async () => {
    const own = await dashboard.get(a.businessId, { period: 'today', date: '2026-06-15' });
    expect(own.totals.total).toBe('48.1');

    const foreign = await dashboard.get(b.businessId, { period: 'today', date: '2026-06-15' });
    expect(foreign.totals).toEqual({
      total: '1500',
      cash: '1000',
      yape: '500',
      salesCount: 2,
      bySource: { counter: '1000', wash: '0', maintenance: '500' },
    });
    expect(foreign.maintenances).toEqual({ count: 1, charged: 1, uncharged: 0 });
    expect(foreign.washes.byType).toEqual([]);
  });

  it('un negocio sin operaciones en el período: todo en cero', async () => {
    const empty = await createTenant('vacio');
    const result = await dashboard.get(empty.businessId, { period: 'month', date: '2026-06-01' });
    expect(result.totals).toEqual({
      total: '0',
      cash: '0',
      yape: '0',
      salesCount: 0,
      bySource: { counter: '0', wash: '0', maintenance: '0' },
    });
    expect(result.maintenances).toEqual({ count: 0, charged: 0, uncharged: 0 });
  });

  it('montos como string decimal exacto (sin float)', async () => {
    const result = await dashboard.get(a.businessId, { period: 'week', date: '2026-06-15' });
    const amounts = [
      result.totals.total,
      result.totals.cash,
      result.totals.yape,
      ...Object.values(result.totals.bySource),
      result.washes.amount,
      ...result.series.flatMap((p) => [p.counter, p.wash, p.maintenance]),
    ];
    for (const amount of amounts) {
      expect(typeof amount).toBe('string');
      expect(amount).toMatch(/^\d+(\.\d{1,2})?$/);
    }
    // 10.10 + 20.20 + 1.00 en float daría 31.299999999999997.
    expect(result.totals.bySource.counter).toBe('31.3');
  });
});
