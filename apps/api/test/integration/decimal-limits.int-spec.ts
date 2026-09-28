import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { MAX_MONEY, MAX_QUANTITY } from '../../src/common/decimal-limits';
import type { Env } from '../../src/config/env.validation';
import { InventoryService } from '../../src/inventory/inventory.service';
import { MaintenancesService } from '../../src/maintenances/maintenances.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';

/**
 * Topes Decimal contra Postgres real (hallazgo H4): el máximo de cada columna
 * se escribe sin error, y lo que no cabe —aunque cada dato suelto sea
 * válido— responde 400 `VALIDATION_ERROR` sin escribir nada, en vez de un
 * 500 del driver ("numeric field overflow").
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas.
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
const sales = new SalesService(prisma);
const inventory = new InventoryService(prisma);
const maintenances = new MaintenancesService(prisma);

let businessId: string;
let userId: string;
let vehicleId: string;
let maintenanceTypeId: string;

beforeAll(async () => {
  await prisma.$connect();
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `H4 ${suffix}`, slug: `h4-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'H4', username: `h4-${suffix}`, passwordHash: 'x' },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      businessId: business.id,
      createdById: user.id,
      plate: 'H4-001',
      plateNormalized: 'H4001',
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

async function createProduct(data: { tracksStock?: boolean; counted?: number } = {}) {
  const product = await prisma.product.create({
    data: {
      businessId,
      name: `H4 ${randomUUID()}`,
      unit: 'litro',
      tracksStock: data.tracksStock ?? true,
    },
  });
  if (data.counted !== undefined) {
    await inventory.count(businessId, userId, {
      productId: product.id,
      countedQuantity: data.counted,
    });
  }
  return product.id;
}

const validationError = (field: string) => ({
  code: 'VALIDATION_ERROR',
  status: 400,
  errors: expect.arrayContaining([expect.objectContaining({ field })]),
});

async function movementsOf(productId: string) {
  return prisma.inventoryMovement.count({ where: { productId } });
}

describe('Topes de dinero contra Postgres (H4)', () => {
  it('venta con precio 99 999 999,99: se guarda con el monto exacto', async () => {
    const productId = await createProduct({ tracksStock: false });
    const { sale } = await sales.create(businessId, userId, {
      paymentMethod: 'CASH',
      lines: [{ productId, quantity: 1, unitPrice: MAX_MONEY }],
    });
    expect(String(sale.total)).toBe('99999999.99');
  });

  it('venta cuyo subtotal no cabe en Decimal(10,2): 400 sin escribir la venta', async () => {
    const productId = await createProduct({ tracksStock: false });
    const before = await prisma.sale.count({ where: { businessId } });
    await expect(
      sales.create(businessId, userId, {
        paymentMethod: 'CASH',
        lines: [{ productId, quantity: 1000, unitPrice: MAX_MONEY }],
      }),
    ).rejects.toMatchObject(validationError('lines.0.subtotal'));
    expect(await prisma.sale.count({ where: { businessId } })).toBe(before);
  });

  it('cobro de mantenimiento de 99 999 999,99: se guarda', async () => {
    const { maintenance } = await maintenances.create(businessId, userId, {
      vehicleId,
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
      charge: { paymentMethod: 'YAPE', totalAmount: MAX_MONEY },
    });
    const sale = await prisma.sale.findFirstOrThrow({ where: { maintenanceId: maintenance.id } });
    expect(sale.total.toString()).toBe('99999999.99');
  });
});

describe('Topes de cantidades contra Postgres (H4)', () => {
  it('conteo de 999 999 999,999: se guarda como saldo', async () => {
    const productId = await createProduct({ counted: MAX_QUANTITY });
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
    expect(product.stockQuantity.toString()).toBe('999999999.999');
  });

  it('recepción que dejaría el saldo por encima de Decimal(12,3): 400 en lines sin escribir', async () => {
    const productId = await createProduct({ counted: MAX_QUANTITY });
    const movements = await movementsOf(productId);
    await expect(
      inventory.createReceiptBatch(businessId, userId, { lines: [{ productId, quantity: 1 }] }),
    ).rejects.toMatchObject(validationError('lines'));
    expect(await movementsOf(productId)).toBe(movements);
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
    expect(product.stockQuantity.toString()).toBe('999999999.999');
  });

  it('conteo cuya diferencia con un saldo negativo no cabe: 400 en countedQuantity sin escribir', async () => {
    const productId = await createProduct({ counted: 0 });
    // Mantenimiento con política WARN: deja el saldo en −999 999 999,999.
    await maintenances.create(businessId, userId, {
      vehicleId,
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
      items: [{ productId, quantity: MAX_QUANTITY }],
    });
    const movements = await movementsOf(productId);
    await expect(
      inventory.count(businessId, userId, { productId, countedQuantity: 1 }),
    ).rejects.toMatchObject(validationError('countedQuantity'));
    expect(await movementsOf(productId)).toBe(movements);
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
    expect(product.stockQuantity.toString()).toBe('-999999999.999');
  });
});
