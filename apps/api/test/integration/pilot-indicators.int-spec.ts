import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { PilotIndicatorsService } from '../../src/pilot/pilot-indicators.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';
import { WashTypesService } from '../../src/washes/wash-types.service';
import { WashesService } from '../../src/washes/washes.service';

/**
 * BR-I1 en `GET /pilot-indicators` (R7, DEC-85) contra Postgres real y con los
 * servicios de verdad: ventas de mostrador, lavados y mantenimientos, por
 * separado. El endpoint mantiene su semántica: `from`/`to` son instantes
 * inclusivos y opcionales, y la zona horaria la pone quien llama (la web manda
 * 00:00 y 23:59:59.999 en hora local; aquí, en America/Lima, UTC−5).
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
const pilot = new PilotIndicatorsService(prisma);
const sales = new SalesService(prisma);
const maintenances = new MaintenancesService(prisma);
const washTypes = new WashTypesService(prisma);
const washes = new WashesService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
  maintenanceTypeId: string;
  productId: string;
  washTypeId: string;
  washPriceId: string;
}

/** Instante ISO de una hora local de Lima (UTC−5). */
function lima(localIso: string): string {
  return new Date(`${localIso}-05:00`).toISOString();
}

/** Día local de Lima como lo manda la web: 00:00 a 23:59:59.999, inclusivos. */
function limaDay(date: string) {
  return { from: lima(`${date}T00:00:00.000`), to: lima(`${date}T23:59:59.999`) };
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
  // Sin conteo: se puede vender con aviso (DEC-27), sin depender de saldos.
  const product = await prisma.product.create({
    data: { businessId: business.id, name: `Aceite ${suffix}`, unit: 'litro' },
  });
  const washType = await washTypes.create(business.id, { name: `Auto ${suffix.slice(0, 8)}` });
  const price = await washTypes.createPrice(business.id, washType.id, { amount: 15 });
  return {
    businessId: business.id,
    userId: user.id,
    maintenanceTypeId: type.id,
    productId: product.id,
    washTypeId: washType.id,
    washPriceId: price.id,
  };
}

function counterSale(tenant: Tenant, occurredAt: string) {
  return sales.create(tenant.businessId, tenant.userId, {
    paymentMethod: 'CASH',
    occurredAt,
    lines: [{ productId: tenant.productId, quantity: 1, unitPrice: 30 }],
  });
}

function wash(tenant: Tenant, occurredAt: string) {
  return washes.create(tenant.businessId, tenant.userId, {
    washTypeId: tenant.washTypeId,
    priceOptionId: tenant.washPriceId,
    paymentMethod: 'YAPE',
    occurredAt,
  });
}

function maintenance(tenant: Tenant, performedAt: string, charged = false) {
  return maintenances.create(tenant.businessId, tenant.userId, {
    maintenanceTypeId: tenant.maintenanceTypeId,
    performedAt,
    ...(charged ? { charge: { paymentMethod: 'CASH' as const, totalAmount: 95.9 } } : {}),
  });
}

let t: Tenant;

beforeAll(async () => {
  await prisma.$connect();
  t = await createTenant('pilot');

  // Lunes 15 de junio de 2026 en Lima.
  await counterSale(t, lima('2026-06-15T10:00:00'));
  await counterSale(t, lima('2026-06-15T23:30:00')); // 04:30 UTC del 16: sigue siendo el 15 en Lima.
  const voidedSale = await counterSale(t, lima('2026-06-15T12:00:00'));
  await sales.void(t.businessId, t.userId, voidedSale.sale.id, { reason: 'prueba' });

  await wash(t, lima('2026-06-15T11:00:00'));
  const voidedWash = await wash(t, lima('2026-06-15T13:00:00'));
  await sales.void(t.businessId, t.userId, voidedWash.id, { reason: 'prueba' });

  // Un mantenimiento cobrado (su venta MAINTENANCE nace con la hora del servidor) y uno anulado.
  await maintenance(t, lima('2026-06-15T09:00:00'), true);
  const voided = await maintenance(t, lima('2026-06-15T15:00:00'));
  await maintenances.void(t.businessId, t.userId, voided.maintenance.id, { reason: 'prueba' });

  // Martes 16 a las 00:10: fuera del lunes.
  await counterSale(t, lima('2026-06-16T00:10:00'));
  await wash(t, lima('2026-06-16T00:10:00'));
  await maintenance(t, lima('2026-06-16T00:00:00'));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /pilot-indicators: BR-I1 (R7, DEC-85)', () => {
  it('lunes 15 en Lima: cada fuente por separado, sin anulados; el cobro no suma otro mantenimiento', async () => {
    const { adoption } = await pilot.get(t.businessId, limaDay('2026-06-15'));
    expect(adoption).toEqual({ activeMaintenances: 1, counterSales: 2, washes: 1 });
  });

  it('martes 16: lo de las 00:00 y 00:10 cae en el martes', async () => {
    const { adoption } = await pilot.get(t.businessId, limaDay('2026-06-16'));
    expect(adoption).toEqual({ activeMaintenances: 1, counterSales: 1, washes: 1 });
  });

  it('el límite superior es inclusivo, como el resto del endpoint', async () => {
    const { adoption } = await pilot.get(t.businessId, {
      from: lima('2026-06-15T00:00:00.000'),
      to: lima('2026-06-15T23:30:00.000'),
    });
    expect(adoption.counterSales).toBe(2);
  });

  it('sin from/to cuenta todo el historial', async () => {
    const { adoption } = await pilot.get(t.businessId, {});
    expect(adoption).toEqual({ activeMaintenances: 2, counterSales: 3, washes: 2 });
  });

  it('no mezcla negocios', async () => {
    const other = await createTenant('pilot-otro');
    await counterSale(other, lima('2026-06-15T10:00:00'));
    await wash(other, lima('2026-06-15T10:00:00'));
    await maintenance(other, lima('2026-06-15T10:00:00'));

    expect((await pilot.get(t.businessId, limaDay('2026-06-15'))).adoption).toEqual({
      activeMaintenances: 1,
      counterSales: 2,
      washes: 1,
    });
    expect((await pilot.get(other.businessId, limaDay('2026-06-15'))).adoption).toEqual({
      activeMaintenances: 1,
      counterSales: 1,
      washes: 1,
    });
  });

  it('período sin operaciones: ceros; solo conteos, sin metas ni porcentajes', async () => {
    const result = await pilot.get(t.businessId, limaDay('2026-01-10'));
    expect(result.adoption).toEqual({ activeMaintenances: 0, counterSales: 0, washes: 0 });
    expect(Object.keys(result.adoption).sort()).toEqual([
      'activeMaintenances',
      'counterSales',
      'washes',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/goal|target|meta|percent|porcentaje|score|rank/i);
  });

  it('los otros indicadores (BR-I2, BR-I3) no cambian de forma', async () => {
    const result = await pilot.get(t.businessId, limaDay('2026-06-15'));
    expect(Object.keys(result).sort()).toEqual([
      'adoption',
      'from',
      'inventory',
      'maintenance',
      'to',
    ]);
    expect(Object.keys(result.maintenance).sort()).toEqual([
      'maintenancesWithNextDue',
      'remindersOpenedInWhatsApp',
    ]);
    expect(Object.keys(result.inventory).sort()).toEqual([
      'movementsByType',
      'productsCountedAndMovedInPeriod',
      'totalMovements',
    ]);
  });
});
