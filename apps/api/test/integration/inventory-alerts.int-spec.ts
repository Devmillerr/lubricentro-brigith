import { randomUUID } from 'node:crypto';
import { InventoryMovementType } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { InventoryService } from '../../src/inventory/inventory.service';
import { applyStockMovements } from '../../src/inventory/stock-ledger';
import { forBusiness } from '../../src/prisma/business-scope';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Stock que requiere atención (R3, BR-P19, DEC-50) contra Postgres real: el
 * filtro por la caché `Decimal` de `Product` después de movimientos reales
 * (conteo, consumo, recepción y ajuste físico), productos inactivos y
 * aislamiento entre negocios.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas. Cada corrida
 * crea sus propios negocios.
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

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R3 alertas ${suffix}`, slug: `r3-alertas-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'R3 alertas',
      username: `r3-alertas-${suffix}`,
      passwordHash: 'no-se-usa',
    },
  });
  return { businessId: business.id, userId: user.id };
}

async function createProduct(tenant: Tenant, name: string, counted?: number): Promise<string> {
  const product = await prisma.product.create({
    data: { businessId: tenant.businessId, name, unit: 'litro' },
  });
  if (counted !== undefined) {
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: counted,
    });
  }
  return product.id;
}

/** Consumo directo al ledger (como un mantenimiento): puede dejar el saldo negativo. */
function use(tenant: Tenant, productId: string, quantity: number) {
  return forBusiness(prisma, tenant.businessId).$transaction((tx) =>
    applyStockMovements(tx, {
      businessId: tenant.businessId,
      createdById: tenant.userId,
      policy: 'WARN',
      entries: [
        {
          productId,
          type: InventoryMovementType.MAINTENANCE_USE,
          quantityDelta: -quantity,
          occurredAt: new Date(),
        },
      ],
    }),
  );
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Alertas de stock contra Postgres (R3)', () => {
  it('negocio sin productos: listas vacías y notCountedCount 0', async () => {
    const tenant = await createTenant();

    await expect(inventory.getAlerts(tenant.businessId)).resolves.toEqual({
      outOfStock: [],
      negative: [],
      notCountedCount: 0,
    });
  });

  it('clasifica por la caché después de movimientos reales; sin conteo solo cuenta', async () => {
    const tenant = await createTenant();
    const consumed = await createProduct(tenant, 'B consumido a cero', 2);
    await use(tenant, consumed, 2);
    const negative = await createProduct(tenant, 'C negativo', 1);
    await use(tenant, negative, 1.5);
    const adjusted = await createProduct(tenant, 'A ajustado a cero', 5);
    await inventory.adjustment(tenant.businessId, tenant.userId, {
      productId: adjusted,
      physicalQuantity: 0,
      reason: 'Consumo interno',
    });
    const refilled = await createProduct(tenant, 'D repuesto', 0);
    await inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      lines: [{ productId: refilled, quantity: 3 }],
    });
    await createProduct(tenant, 'E con saldo', 0.001);
    const uncountedNegative = await createProduct(tenant, 'F sin conteo');
    await use(tenant, uncountedNegative, 4);
    await createProduct(tenant, 'G sin conteo');
    const untracked = await createProduct(tenant, 'H no controla stock');
    await prisma.product.update({ where: { id: untracked }, data: { tracksStock: false } });

    const alerts = await inventory.getAlerts(tenant.businessId);

    expect(alerts.outOfStock).toEqual([
      { productId: adjusted, name: 'A ajustado a cero', unit: 'litro', balance: 0 },
      { productId: consumed, name: 'B consumido a cero', unit: 'litro', balance: 0 },
    ]);
    expect(alerts.negative).toEqual([
      { productId: negative, name: 'C negativo', unit: 'litro', balance: -0.5 },
    ]);
    expect(alerts.notCountedCount).toBe(2);
  });

  it('los productos inactivos no aparecen ni suman', async () => {
    const tenant = await createTenant();
    const outOfStock = await createProduct(tenant, 'Inactivo agotado', 0);
    const uncounted = await createProduct(tenant, 'Inactivo sin conteo');
    await prisma.product.updateMany({
      where: { id: { in: [outOfStock, uncounted] } },
      data: { isActive: false },
    });

    await expect(inventory.getAlerts(tenant.businessId)).resolves.toEqual({
      outOfStock: [],
      negative: [],
      notCountedCount: 0,
    });
  });

  it('aislamiento: cada negocio solo ve sus productos', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const mine = await createProduct(tenantA, 'Mío agotado', 0);
    const theirs = await createProduct(tenantB, 'Ajeno agotado', 0);
    await createProduct(tenantB, 'Ajeno sin conteo');

    const alertsA = await inventory.getAlerts(tenantA.businessId);
    const alertsB = await inventory.getAlerts(tenantB.businessId);

    expect(alertsA.outOfStock.map((p) => p.productId)).toEqual([mine]);
    expect(alertsA.notCountedCount).toBe(0);
    expect(alertsB.outOfStock.map((p) => p.productId)).toEqual([theirs]);
    expect(alertsB.notCountedCount).toBe(1);
  });
});
