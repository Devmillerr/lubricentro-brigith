import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RemindersService } from '../../src/reminders/reminders.service';
import { SalesService } from '../../src/sales/sales.service';

/**
 * Stock y recordatorios del dashboard (R7, B-163, DEC-82) contra Postgres real.
 * Reutilizan la lógica existente: `InventoryService.getAlerts` (la de
 * `GET /inventory/alerts`, BR-P19) y la evaluación de `GET /reminders?due=now`
 * (`checkReminderDue`, BR-R3 a BR-R6). Los saldos salen del ledger real.
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
const inventory = new InventoryService(prisma);
const maintenances = new MaintenancesService(prisma);
const reminders = new RemindersService(prisma, maintenances);
const sales = new SalesService(prisma);
const dashboard = new DashboardService(prisma, inventory, reminders);

const DAY = 24 * 60 * 60 * 1000;

interface Tenant {
  businessId: string;
  userId: string;
  maintenanceTypeId: string;
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

async function createProduct(tenant: Tenant, name: string, counted?: number): Promise<string> {
  const product = await prisma.product.create({
    data: { businessId: tenant.businessId, name, unit: 'unidad' },
  });
  if (counted !== undefined) {
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: counted,
    });
  }
  return product.id;
}

function useInMaintenance(tenant: Tenant, productId: string, quantity: number) {
  return maintenances.create(tenant.businessId, tenant.userId, {
    maintenanceTypeId: tenant.maintenanceTypeId,
    performedAt: new Date().toISOString(),
    items: [{ productId, quantity }],
  });
}

async function createVehicle(tenant: Tenant): Promise<string> {
  const plate = `R7${randomUUID().slice(0, 4)}`.toUpperCase();
  const vehicle = await prisma.vehicle.create({
    data: {
      businessId: tenant.businessId,
      createdById: tenant.userId,
      plate,
      plateNormalized: plate,
    },
  });
  return vehicle.id;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /dashboard: stock (B-163)', () => {
  let t: Tenant;
  let negative: string;
  let zero: string;
  let counted: string;
  let uncounted: string;
  let uncountedNegative: string;
  let untrackedCountedZero: string;

  beforeAll(async () => {
    t = await createTenant('stock');
    // Negativo: contado en 1 y un mantenimiento consume 3 (DEC-26: no se bloquea).
    negative = await createProduct(t, 'B negativo', 1);
    await useInMaintenance(t, negative, 3);
    // Agotado: contado en 2 y vendido 2.
    zero = await createProduct(t, 'A agotado', 2);
    await sales.create(t.businessId, t.userId, {
      paymentMethod: 'CASH',
      lines: [{ productId: zero, quantity: 2, unitPrice: 10 }],
    });
    // Con conteo vigente y saldo positivo: no requiere atención.
    counted = await createProduct(t, 'C con saldo', 5);
    // Sin conteo (uno de ellos con saldo negativo): solo suman en notCounted.
    uncounted = await createProduct(t, 'D sin conteo');
    uncountedNegative = await createProduct(t, 'E sin conteo negativo');
    await useInMaintenance(t, uncountedNegative, 1);
    // Contado en 0 y después marcado sin control de stock: ya no es una alerta.
    untrackedCountedZero = await createProduct(t, 'F sin control contado', 0);
    await prisma.product.update({
      where: { id: untrackedCountedZero },
      data: { tracksStock: false },
    });
    // Sin control de stock y sin conteo: tampoco suma en notCounted.
    const untrackedUncounted = await createProduct(t, 'G sin control');
    await prisma.product.update({
      where: { id: untrackedUncounted },
      data: { tracksStock: false },
    });
  });

  it('negativos, agotados y sin conteo con la regla de /inventory/alerts', async () => {
    const { stock } = await dashboard.get(t.businessId, {});
    expect(stock).toEqual({
      outOfStock: 1,
      negative: 1,
      notCounted: 2,
      items: [
        { productId: negative, name: 'B negativo', unit: 'unidad', balance: -2 },
        { productId: zero, name: 'A agotado', unit: 'unidad', balance: 0 },
      ],
    });
    const ids = stock.items.map((item) => item.productId);
    expect(ids).not.toContain(counted);
    expect(ids).not.toContain(uncounted);
    expect(ids).not.toContain(uncountedNegative);
  });

  it('tracksStock=false queda fuera, también en GET /inventory/alerts (mismo método)', async () => {
    const { stock } = await dashboard.get(t.businessId, {});
    expect(stock.items.map((item) => item.productId)).not.toContain(untrackedCountedZero);

    const alerts = await inventory.getAlerts(t.businessId);
    expect(alerts.outOfStock.map((item) => item.productId)).toEqual([zero]);
    expect(alerts.negative.map((item) => item.productId)).toEqual([negative]);
    expect(alerts.notCountedCount).toBe(2);
  });

  it('es el saldo actual: no cambia con el período elegido', async () => {
    const today = await dashboard.get(t.businessId, {});
    const pastMonth = await dashboard.get(t.businessId, { period: 'month', date: '2026-01-15' });
    expect(pastMonth.stock).toEqual(today.stock);
  });

  it('otro negocio no ve este stock ni suma el suyo', async () => {
    const other = await createTenant('stock-otro');
    const foreign = await createProduct(other, 'Ajeno negativo', 0);
    await useInMaintenance(other, foreign, 4);

    const own = await dashboard.get(t.businessId, {});
    expect(own.stock.items.map((item) => item.productId)).not.toContain(foreign);
    expect(own.stock.negative).toBe(1);

    const theirs = await dashboard.get(other.businessId, {});
    expect(theirs.stock).toEqual({
      outOfStock: 0,
      negative: 1,
      notCounted: 0,
      items: [{ productId: foreign, name: 'Ajeno negativo', unit: 'unidad', balance: -4 }],
    });
  });

  it('muestra hasta 10 items, primero negativos y luego agotados', async () => {
    const many = await createTenant('stock-muchos');
    for (let i = 0; i < 8; i += 1) await createProduct(many, `Agotado ${i}`, 0);
    for (let i = 0; i < 4; i += 1) {
      const id = await createProduct(many, `Negativo ${i}`, 0);
      await useInMaintenance(many, id, 1);
    }
    const { stock } = await dashboard.get(many.businessId, {});
    expect(stock.outOfStock).toBe(8);
    expect(stock.negative).toBe(4);
    expect(stock.items).toHaveLength(10);
    expect(stock.items.slice(0, 4).every((item) => item.balance < 0)).toBe(true);
    expect(stock.items.slice(4).every((item) => item.balance === 0)).toBe(true);
  });
});

describe('GET /dashboard: recordatorios (B-163)', () => {
  let t: Tenant;

  async function maintainWithReminder(
    tenant: Tenant,
    opts: { daysAgo: number; nextDueInDays?: number; odometerKm?: number; nextDueKm?: number },
  ) {
    const vehicleId = await createVehicle(tenant);
    const performedAt = new Date(Date.now() - opts.daysAgo * DAY);
    return maintenances.create(tenant.businessId, tenant.userId, {
      vehicleId,
      maintenanceTypeId: tenant.maintenanceTypeId,
      performedAt: performedAt.toISOString(),
      odometerKm: opts.odometerKm,
      nextDueKm: opts.nextDueKm,
      nextDueDate:
        opts.nextDueInDays === undefined
          ? undefined
          : new Date(Date.now() + opts.nextDueInDays * DAY).toISOString(),
    });
  }

  beforeAll(async () => {
    t = await createTenant('avisos');
    // Vencidos por fecha: dos (uno de ellos pasa a CONTACTED y deja de contar).
    await maintainWithReminder(t, { daysAgo: 60, nextDueInDays: -5 });
    const contacted = await maintainWithReminder(t, { daysAgo: 60, nextDueInDays: -3 });
    await prisma.reminder.update({
      where: { id: contacted.reminder!.id },
      data: { status: 'CONTACTED' },
    });
    await maintainWithReminder(t, { daysAgo: 40, nextDueInDays: -1 });
    // No vencido: la fecha está a varios días.
    await maintainWithReminder(t, { daysAgo: 10, nextDueInDays: 20 });
    // Solo por km, sin un km nuevo: no se activa solo (BR-R4, no se estima).
    await maintainWithReminder(t, { daysAgo: 30, odometerKm: 1000, nextDueKm: 6000 });
    // Sin próximo km ni fecha: no genera recordatorio ni inventa vencimiento.
    await maintainWithReminder(t, { daysAgo: 30 });
  });

  it('dueNow cuenta los PENDING que corresponde avisar, igual que GET /reminders?due=now&status=PENDING', async () => {
    const { reminders: dash } = await dashboard.get(t.businessId, {});
    const listed = await reminders.list(t.businessId, { due: 'now', status: 'PENDING' });
    expect(dash).toEqual({ dueNow: 2 });
    expect(listed.items).toHaveLength(2);
  });

  it('no vencidos, solo-km sin dato nuevo y mantenimientos sin próxima fecha no cuentan', async () => {
    const all = await prisma.reminder.findMany({ where: { businessId: t.businessId } });
    // 5 recordatorios creados (el mantenimiento sin próximo km/fecha no genera ninguno).
    expect(all).toHaveLength(5);
    const upcoming = await reminders.list(t.businessId, { due: 'upcoming', status: 'PENDING' });
    expect(upcoming.items).toHaveLength(2);
  });

  it('es el estado actual: no depende del período ni de la fecha elegidos', async () => {
    const week = await dashboard.get(t.businessId, { period: 'week', date: '2026-01-05' });
    const month = await dashboard.get(t.businessId, { period: 'month', date: '2030-12-01' });
    expect(week.reminders).toEqual({ dueNow: 2 });
    expect(month.reminders).toEqual({ dueNow: 2 });
  });

  it('otro negocio no suma sus recordatorios', async () => {
    const other = await createTenant('avisos-otro');
    await maintainWithReminder(other, { daysAgo: 60, nextDueInDays: -2 });
    expect((await dashboard.get(t.businessId, {})).reminders).toEqual({ dueNow: 2 });
    expect((await dashboard.get(other.businessId, {})).reminders).toEqual({ dueNow: 1 });
  });

  it('sin recordatorios: dueNow en cero', async () => {
    const empty = await createTenant('avisos-vacio');
    expect((await dashboard.get(empty.businessId, {})).reminders).toEqual({ dueNow: 0 });
  });
});
