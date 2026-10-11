import { randomUUID } from 'node:crypto';
import { InventoryMovementType, PaymentMethod } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { InventoryService, RECEIPT_REF_TYPE } from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProductsService } from '../../src/products/products.service';
import { SALE_REF_TYPE, SalesService } from '../../src/sales/sales.service';

/**
 * Monto pagado en recepciones (DEC-90) y formas de venta (DEC-91) contra
 * Postgres real, con los casos de negocio del lubricentro: recibir un balde
 * de 5 galones y venderlo por octavo, cuarto, galón o balde completo.
 *
 * Usa `TEST_DATABASE_URL`, con las migraciones ya aplicadas (incluida
 * `purchase_cost_and_sale_units`). Cada corrida crea sus propios negocios.
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
const sales = new SalesService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `DEC-91 ${suffix}`, slug: `dec91-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'DEC-91',
      username: `dec91-${suffix}`,
      passwordHash: 'no-se-usa',
    },
  });
  return { businessId: business.id, userId: user.id };
}

async function createProduct(
  tenant: Tenant,
  options: { unit?: string; counted?: number; name?: string } = {},
): Promise<string> {
  const product = await products.create(tenant.businessId, {
    name: options.name ?? `Aceite ${randomUUID()}`,
    unit: options.unit ?? 'galón',
  });
  if (options.counted !== undefined) {
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: options.counted,
      occurredAt: '2026-01-01T00:00:00.000Z', // conteo inicial, anterior a las recepciones (R8)
    });
  }
  return product.id;
}

async function balanceOf(productId: string) {
  const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
  const sum = await prisma.inventoryMovement.aggregate({
    where: { productId },
    _sum: { quantityDelta: true },
  });
  // La caché y la suma de movimientos siempre coinciden (BR-P3).
  expect(Number(product.stockQuantity)).toBe(Number(sum._sum.quantityDelta ?? 0));
  return Number(product.stockQuantity);
}

/** Balde de 5 galones: Octavo, Cuarto, Galón y Balde, cada uno con su precio. */
async function bucketUnits(tenant: Tenant, productId: string) {
  const product = await products.setSaleUnits(tenant.businessId, productId, [
    { label: 'Octavo', factor: 0.125, salePrice: 6 },
    { label: 'Cuarto', factor: 0.25, salePrice: 11 },
    { label: 'Galón', factor: 1, salePrice: 40 },
    { label: 'Balde', factor: 5, salePrice: 180 },
  ]);
  return Object.fromEntries(product.saleUnits.map((unit) => [unit.label, unit])) as Record<
    'Octavo' | 'Cuarto' | 'Galón' | 'Balde',
    (typeof product.saleUnits)[number]
  >;
}

function sell(
  tenant: Tenant,
  lines: { productId: string; saleUnitId?: string; quantity: number; unitPrice: number }[],
) {
  return sales.create(tenant.businessId, tenant.userId, {
    paymentMethod: PaymentMethod.CASH,
    lines,
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Recepciones con monto pagado (DEC-90)', () => {
  it('sin monto: se guarda como antes, sin total y sin inventar costos', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { unit: 'unidad', counted: 0 });

    const { receipt, lines } = await inventory.createReceiptBatch(
      tenant.businessId,
      tenant.userId,
      {
        lines: [{ productId, quantity: 3 }],
      },
    );

    expect(receipt.totalCost).toBeNull();
    expect(lines[0]!.purchaseCost).toBeNull();
    expect(await balanceOf(productId)).toBe(3);
  });

  it('con monto en varias líneas: total = suma de lo pagado, sin tocar las cantidades', async () => {
    const tenant = await createTenant();
    const oil = await createProduct(tenant, { counted: 0 });
    const filter = await createProduct(tenant, { unit: 'unidad', counted: 2 });
    const silicone = await createProduct(tenant, { unit: 'unidad' });

    const { receipt, lines } = await inventory.createReceiptBatch(
      tenant.businessId,
      tenant.userId,
      {
        lines: [
          { productId: oil, quantity: 5, purchaseCost: 300 },
          { productId: filter, quantity: 4, purchaseCost: 62.5 },
          { productId: silicone, quantity: 12 },
        ],
      },
    );

    expect(receipt.totalCost?.toString()).toBe('362.5');
    expect(lines.map((line) => line.purchaseCost?.toString() ?? null)).toEqual([
      '300',
      '62.5',
      null,
    ]);
    expect(await balanceOf(oil)).toBe(5);
    expect(await balanceOf(filter)).toBe(6);
    expect(await balanceOf(silicone)).toBe(12);

    // Un PURCHASE_IN por línea: sin duplicados.
    const movements = await prisma.inventoryMovement.count({
      where: { refType: RECEIPT_REF_TYPE, refId: receipt.id },
    });
    expect(movements).toBe(3);

    const detail = await inventory.getReceipt(tenant.businessId, receipt.id);
    expect(detail.receipt.totalCost?.toString()).toBe('362.5');
  });

  it('total mensual: suma solo las recepciones del mes y cuenta aparte las que no tienen monto', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { counted: 0 });
    // Fechas posteriores a hoy en el calendario real: la prueba fija su reloj
    // (R8 rechaza recepciones futuras) y repite recepciones a propósito.
    const now = new Date('2027-01-01T00:00:00.000Z');
    const receive = (occurredAt: string, purchaseCost?: number) =>
      inventory.createReceiptBatch(
        tenant.businessId,
        tenant.userId,
        {
          occurredAt,
          acknowledgePossibleDuplicate: true,
          lines: [
            { productId, quantity: 1, ...(purchaseCost !== undefined ? { purchaseCost } : {}) },
          ],
        },
        now,
      );

    // Lima es UTC−5: el 1 de octubre a las 00:30 de Lima ya es octubre;
    // el 30 de septiembre a las 23:30 de Lima (04:30 UTC del 1) no.
    await receive('2026-10-01T05:30:00.000Z', 300);
    await receive('2026-10-15T15:00:00.000Z', 120.4);
    await receive('2026-10-20T15:00:00.000Z'); // sin monto
    await receive('2026-10-01T04:30:00.000Z', 999); // septiembre en Lima
    await receive('2026-11-01T05:00:00.000Z', 50); // noviembre

    const october = await inventory.receiptsMonthSummary(tenant.businessId, '2026-10');
    expect(october).toMatchObject({
      month: '2026-10',
      receiptCount: 3,
      totalCost: '420.40',
      receiptsWithoutCost: 1,
      linesWithoutCost: 1,
    });

    const september = await inventory.receiptsMonthSummary(tenant.businessId, '2026-09');
    expect(september).toMatchObject({ receiptCount: 1, totalCost: '999.00' });

    const empty = await inventory.receiptsMonthSummary(tenant.businessId, '2025-01');
    expect(empty).toMatchObject({ receiptCount: 0, totalCost: '0.00', receiptsWithoutCost: 0 });

    // Otro negocio no ve estas recepciones.
    const other = await createTenant();
    const isolated = await inventory.receiptsMonthSummary(other.businessId, '2026-10');
    expect(isolated).toMatchObject({ receiptCount: 0, totalCost: '0.00' });
  });

  it('las recepciones anteriores (sin columnas de costo) se siguen leyendo igual', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { counted: 1 });
    // Igual que una recepción de R3: cabecera y movimiento sin monto.
    const { receipt } = await inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      lines: [{ productId, quantity: 2 }],
    });

    const page = await inventory.listReceipts(tenant.businessId, {});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: receipt.id, lineCount: 1, totalCost: null });
    expect(await balanceOf(productId)).toBe(3);
  });
});

describe('Formas de venta (DEC-91)', () => {
  it('CASOS 1 a 5: recibir un balde de 5 galones y venderlo por octavo, cuarto, galón y balde', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { name: 'Aceite a granel', counted: 0 });
    const units = await bucketUnits(tenant, productId);

    // CASO 1: recibir 1 balde = 5 galones (la recepción va en la unidad de stock).
    await inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      lines: [{ productId, quantity: 5, purchaseCost: 150 }],
    });
    expect(await balanceOf(productId)).toBe(5);

    // CASO 2: 1 octavo → 0.125 galón, a su propio precio.
    const octavo = await sell(tenant, [
      { productId, saleUnitId: units.Octavo.id, quantity: 1, unitPrice: 6 },
    ]);
    expect(octavo.sale.total.toString()).toBe('6');
    expect(octavo.sale.lines[0]).toMatchObject({
      saleUnitId: units.Octavo.id,
      saleUnitLabel: 'Octavo',
    });
    expect(octavo.sale.lines[0]!.saleUnitFactor?.toString()).toBe('0.125');
    expect(await balanceOf(productId)).toBe(4.875);

    // CASO 3: 1 cuarto → 0.25 galón.
    await sell(tenant, [{ productId, saleUnitId: units.Cuarto.id, quantity: 1, unitPrice: 11 }]);
    expect(await balanceOf(productId)).toBe(4.625);

    // CASO 4: 1 galón → 1 galón.
    await sell(tenant, [{ productId, saleUnitId: units['Galón'].id, quantity: 1, unitPrice: 40 }]);
    expect(await balanceOf(productId)).toBe(3.625);

    // Movimiento SALE en galones, enlazado a la venta del octavo.
    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { refType: SALE_REF_TYPE, refId: octavo.sale.id, type: InventoryMovementType.SALE },
    });
    expect(movement.quantityDelta.toString()).toBe('-0.125');
  });

  it('CASO 5: un balde descuenta su capacidad completa (5 galones) y deja el saldo en 0', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { counted: 5 });
    const units = await bucketUnits(tenant, productId);

    const sale = await sell(tenant, [
      { productId, saleUnitId: units.Balde.id, quantity: 1, unitPrice: 180 },
    ]);
    expect(sale.sale.total.toString()).toBe('180');
    expect(await balanceOf(productId)).toBe(0);
  });

  it('CASO 6: no deja vender más de lo disponible (422, sin guardar nada)', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { counted: 4.875 });
    const units = await bucketUnits(tenant, productId);

    await expect(
      sell(tenant, [{ productId, saleUnitId: units.Balde.id, quantity: 1, unitPrice: 180 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    // 39 octavos = 4.875: alcanza justo; 40 no.
    await expect(
      sell(tenant, [{ productId, saleUnitId: units.Octavo.id, quantity: 40, unitPrice: 6 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await prisma.sale.count({ where: { businessId: tenant.businessId } })).toBe(0);
    expect(await balanceOf(productId)).toBe(4.875);

    await sell(tenant, [{ productId, saleUnitId: units.Octavo.id, quantity: 39, unitPrice: 6 }]);
    expect(await balanceOf(productId)).toBe(0);
  });

  it('el mismo producto en dos formas dentro de una venta suma ambos consumos', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { counted: 5 });
    const units = await bucketUnits(tenant, productId);

    const { sale } = await sell(tenant, [
      { productId, saleUnitId: units.Octavo.id, quantity: 2, unitPrice: 6 },
      { productId, saleUnitId: units['Galón'].id, quantity: 1, unitPrice: 40 },
    ]);
    expect(sale.total.toString()).toBe('52');
    expect(await balanceOf(productId)).toBe(3.75);

    // La misma forma dos veces sí es un repetido.
    await expect(
      sell(tenant, [
        { productId, saleUnitId: units.Octavo.id, quantity: 1, unitPrice: 6 },
        { productId, saleUnitId: units.Octavo.id, quantity: 1, unitPrice: 6 },
      ]),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PRODUCT_LINE' });
  });

  it('anular devuelve lo que descontó la forma al vender, aunque la forma cambie después', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { counted: 10 });
    const units = await bucketUnits(tenant, productId);

    const { sale } = await sell(tenant, [
      { productId, saleUnitId: units.Balde.id, quantity: 1, unitPrice: 180 },
    ]);
    expect(await balanceOf(productId)).toBe(5);

    // El dueño corrige la capacidad del balde a 4 galones después de vender.
    await products.setSaleUnits(tenant.businessId, productId, [
      { id: units.Balde.id, label: 'Balde', factor: 4, salePrice: 150 },
    ]);
    await sales.void(tenant.businessId, tenant.userId, sale.id, { reason: 'Prueba' });
    expect(await balanceOf(productId)).toBe(10);
  });

  it('CASO 7: un producto sin formas se vende como antes, en su unidad', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { unit: 'unidad', counted: 3 });

    const { sale } = await sell(tenant, [{ productId, quantity: 2, unitPrice: 15 }]);
    expect(sale.total.toString()).toBe('30');
    expect(sale.lines[0]).toMatchObject({
      saleUnitId: null,
      saleUnitLabel: null,
      saleUnitFactor: null,
    });
    expect(await balanceOf(productId)).toBe(1);
  });

  it('rechaza una forma de otro producto (404) o desactivada (409), sin guardar nada', async () => {
    const tenant = await createTenant();
    const first = await createProduct(tenant, { counted: 5 });
    const second = await createProduct(tenant, { counted: 5 });
    const units = await bucketUnits(tenant, first);

    await expect(
      sell(tenant, [{ productId: second, saleUnitId: units.Octavo.id, quantity: 1, unitPrice: 6 }]),
    ).rejects.toMatchObject({ code: 'SALE_UNIT_NOT_FOUND' });

    // Quitar "Octavo" de la lista lo desactiva (no lo borra).
    await products.setSaleUnits(tenant.businessId, first, [
      { id: units['Galón'].id, label: 'Galón', factor: 1, salePrice: 40 },
    ]);
    const octavo = await prisma.productSaleUnit.findFirstOrThrow({
      where: { id: units.Octavo.id },
    });
    expect(octavo.isActive).toBe(false);
    await expect(
      sell(tenant, [{ productId: first, saleUnitId: units.Octavo.id, quantity: 1, unitPrice: 6 }]),
    ).rejects.toMatchObject({ code: 'SALE_UNIT_INACTIVE' });

    // Una cantidad que no cabe en 3 decimales con la equivalencia: 400.
    await expect(
      sell(tenant, [
        { productId: first, saleUnitId: units['Galón'].id, quantity: 0.0005, unitPrice: 1 },
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.sale.count({ where: { businessId: tenant.businessId } })).toBe(0);
    expect(await balanceOf(first)).toBe(5);
  });

  it('volver a agregar una forma por nombre la reactiva, sin duplicarla', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await bucketUnits(tenant, productId);
    await products.setSaleUnits(tenant.businessId, productId, []);
    const again = await products.setSaleUnits(tenant.businessId, productId, [
      { label: 'octavo', factor: 0.125, salePrice: 7 },
    ]);
    expect(again.saleUnits).toHaveLength(1);
    expect(again.saleUnits[0]!.salePrice?.toString()).toBe('7');
    expect(await prisma.productSaleUnit.count({ where: { productId } })).toBe(4);
  });

  it('CASO 14: un producto con unidad "0" no recibe formas hasta corregir la unidad, y su dato no cambia', async () => {
    const tenant = await createTenant();
    // Como los productos existentes con unidad "0": se crean directo en la base.
    const legacy = await prisma.product.create({
      data: { businessId: tenant.businessId, name: 'Aceite antiguo', unit: '0' },
    });
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: legacy.id,
      countedQuantity: 2,
    });

    await expect(
      products.setSaleUnits(tenant.businessId, legacy.id, [{ label: 'Octavo', factor: 0.125 }]),
    ).rejects.toMatchObject({ code: 'PRODUCT_UNIT_INVALID' });

    // Sigue vendiéndose y recibiéndose en su unidad, sin tocar el dato.
    await sell(tenant, [{ productId: legacy.id, quantity: 1, unitPrice: 10 }]);
    await inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      lines: [{ productId: legacy.id, quantity: 1 }],
    });
    const after = await prisma.product.findFirstOrThrow({ where: { id: legacy.id } });
    expect(after.unit).toBe('0');
    expect(await balanceOf(legacy.id)).toBe(2);
  });

  it('las formas de un negocio no se ven ni se usan desde otro', async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const productId = await createProduct(tenant, { counted: 5 });
    const units = await bucketUnits(tenant, productId);
    const otherProduct = await createProduct(other, { counted: 5 });

    await expect(
      products.setSaleUnits(other.businessId, productId, [{ label: 'Octavo', factor: 0.125 }]),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    await expect(
      sell(other, [
        { productId: otherProduct, saleUnitId: units.Octavo.id, quantity: 1, unitPrice: 6 },
      ]),
    ).rejects.toMatchObject({ code: 'SALE_UNIT_NOT_FOUND' });
  });
});

/**
 * Validación aislada de la conversión (encargo del 2026-10-06): cada caso usa
 * un producto de prueba nuevo, en galones, que parte de 5 galones contados.
 * Sin datos reales.
 */
describe('Venta fraccionada aislada: un producto nuevo de 5 galones por caso', () => {
  const cases = [
    { form: 'Octavo', consumed: 0.125, final: 4.875 },
    { form: 'Cuarto', consumed: 0.25, final: 4.75 },
    { form: 'Galón', consumed: 1, final: 4 },
    { form: 'Balde', consumed: 5, final: 0 },
  ] as const;

  it.each(cases)(
    '1 $form: consume $consumed galón y deja $final',
    async ({ form, consumed, final }) => {
      const tenant = await createTenant();
      const productId = await createProduct(tenant, { name: `Prueba granel ${form}`, counted: 5 });
      const units = await bucketUnits(tenant, productId);
      const unit = units[form];
      expect(await balanceOf(productId)).toBe(5);

      // El precio es el de la forma elegida, distinto del de las otras formas.
      const price = Number(unit.salePrice);
      const otherPrices = Object.values(units)
        .filter((other) => other.id !== unit.id)
        .map((other) => Number(other.salePrice));
      expect(otherPrices).not.toContain(price);

      const { sale } = await sell(tenant, [
        { productId, saleUnitId: unit.id, quantity: 1, unitPrice: price },
      ]);

      // La venta queda registrada con la forma, su precio y su equivalencia.
      const stored = await prisma.sale.findFirstOrThrow({
        where: { id: sale.id },
        include: { lines: true },
      });
      expect(stored.status).toBe('ACTIVE');
      expect(Number(stored.total)).toBe(price);
      expect(stored.lines).toHaveLength(1);
      expect(stored.lines[0]).toMatchObject({ saleUnitId: unit.id, saleUnitLabel: form });
      expect(Number(stored.lines[0]!.quantity)).toBe(1);
      expect(Number(stored.lines[0]!.unitPrice)).toBe(price);
      expect(Number(stored.lines[0]!.saleUnitFactor)).toBe(consumed);

      // El movimiento registra lo descontado en galones (la unidad de stock).
      const movements = await prisma.inventoryMovement.findMany({
        where: { refType: SALE_REF_TYPE, refId: sale.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.SALE);
      expect(Number(movements[0]!.quantityDelta)).toBe(-consumed);
      expect(Number(movements[0]!.resultingBalance)).toBe(final);
      expect(await balanceOf(productId)).toBe(final);
    },
  );

  it('no deja vender más de lo disponible: con 5 galones, 2 baldes o 41 octavos se rechazan sin guardar nada', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant, { name: 'Prueba granel exceso', counted: 5 });
    const units = await bucketUnits(tenant, productId);

    await expect(
      sell(tenant, [{ productId, saleUnitId: units.Balde.id, quantity: 2, unitPrice: 180 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    await expect(
      sell(tenant, [{ productId, saleUnitId: units.Octavo.id, quantity: 41, unitPrice: 6 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(await prisma.sale.count({ where: { businessId: tenant.businessId } })).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: { productId, type: InventoryMovementType.SALE },
      }),
    ).toBe(0);
    expect(await balanceOf(productId)).toBe(5);
  });
});

/**
 * Balde abierto en litros (DEC-93): capacidad 20 L, vendido solo por 1/4 de
 * galón (1 L) y 1/8 de galón (0.5 L), sin precios asumidos. El saldo es el
 * contenido disponible. Productos de prueba, sin datos reales.
 */
describe('Balde de 20 litros vendido por 1/4 y 1/8 de galón (DEC-93)', () => {
  async function bucketProduct(tenant: Tenant, name: string) {
    const product = await products.create(tenant.businessId, {
      name,
      unit: 'litro',
      containerCapacity: 20,
      containerLabel: 'Balde',
    });
    const configured = await products.setSaleUnits(tenant.businessId, product.id, [
      { label: '1/4 de galón', factor: 1 },
      { label: '1/8 de galón', factor: 0.5 },
    ]);
    // Conteo inicial en 0 (el saldo real lo pone el dueño), luego el balde lleno.
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: 0,
    });
    const [quarter, eighth] = configured.saleUnits;
    return { id: product.id, product: configured, quarter: quarter!, eighth: eighth! };
  }

  const receiveBucket = (tenant: Tenant, productId: string, buckets = 1) =>
    inventory.createReceiptBatch(tenant.businessId, tenant.userId, {
      lines: [{ productId, quantity: 20 * buckets }],
    });

  it('se configura con capacidad, envase y solo dos formas, sin precio asumido', async () => {
    const tenant = await createTenant();
    const { product } = await bucketProduct(tenant, 'Aceite Balde granel');
    expect(product.unit).toBe('litro');
    expect(product.containerCapacity?.toString()).toBe('20');
    expect(product.containerLabel).toBe('Balde');
    expect(
      product.saleUnits.map((unit) => [unit.label, unit.factor.toString(), unit.salePrice]),
    ).toEqual([
      ['1/4 de galón', '1', null],
      ['1/8 de galón', '0.5', null],
    ]);
  });

  it('20 L → 1/4 → 19 → 1/8 → 18.5 → 1/4 → 17.5 → 1/8 → 17 (precio escrito al vender)', async () => {
    const tenant = await createTenant();
    const { id, quarter, eighth } = await bucketProduct(tenant, 'Aceite Balde 25w60 diesel');
    await receiveBucket(tenant, id);
    expect(await balanceOf(id)).toBe(20);

    const expected = [
      [quarter, 19],
      [eighth, 18.5],
      [quarter, 17.5],
      [eighth, 17],
    ] as const;
    for (const [unit, remaining] of expected) {
      const price = unit === quarter ? 12 : 7;
      const { sale } = await sell(tenant, [
        { productId: id, saleUnitId: unit.id, quantity: 1, unitPrice: price },
      ]);
      expect(Number(sale.total)).toBe(price);
      const movement = await prisma.inventoryMovement.findFirstOrThrow({
        where: { refType: SALE_REF_TYPE, refId: sale.id },
      });
      expect(Number(movement.quantityDelta)).toBe(-Number(unit.factor));
      expect(Number(movement.resultingBalance)).toBe(remaining);
      expect(await balanceOf(id)).toBe(remaining);
    }
  });

  it('con 0.5 L: 1/4 se rechaza sin guardar nada, 1/8 vacía el balde y luego nada se vende', async () => {
    const tenant = await createTenant();
    const { id, quarter, eighth } = await bucketProduct(tenant, 'Aceite Balde 15w40 diesel');
    await receiveBucket(tenant, id);
    // 39 octavos = 19.5 L: quedan 0.5 L.
    await sell(tenant, [{ productId: id, saleUnitId: eighth.id, quantity: 39, unitPrice: 7 }]);
    expect(await balanceOf(id)).toBe(0.5);

    await expect(
      sell(tenant, [{ productId: id, saleUnitId: quarter.id, quantity: 1, unitPrice: 12 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await balanceOf(id)).toBe(0.5);

    await sell(tenant, [{ productId: id, saleUnitId: eighth.id, quantity: 1, unitPrice: 7 }]);
    expect(await balanceOf(id)).toBe(0);

    // Agotado: aparece en las alertas existentes y no deja vender más.
    const alerts = await inventory.getAlerts(tenant.businessId);
    expect(alerts.outOfStock.map((product) => product.productId)).toContain(id);
    await expect(
      sell(tenant, [{ productId: id, saleUnitId: eighth.id, quantity: 1, unitPrice: 7 }]),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('anular devuelve exactamente los litros descontados', async () => {
    const tenant = await createTenant();
    const { id, quarter, eighth } = await bucketProduct(tenant, 'Balde anulación');
    await receiveBucket(tenant, id);
    const { sale } = await sell(tenant, [
      { productId: id, saleUnitId: quarter.id, quantity: 2, unitPrice: 12 },
      { productId: id, saleUnitId: eighth.id, quantity: 3, unitPrice: 7 },
    ]);
    expect(await balanceOf(id)).toBe(16.5);
    await sales.void(tenant.businessId, tenant.userId, sale.id, { reason: 'Prueba' });
    expect(await balanceOf(id)).toBe(20);
  });

  it('dos baldes recibidos = 40 L y la venta sigue descontando litros del total', async () => {
    const tenant = await createTenant();
    const { id, quarter } = await bucketProduct(tenant, 'Balde doble');
    await receiveBucket(tenant, id, 2);
    expect(await balanceOf(id)).toBe(40);
    await sell(tenant, [{ productId: id, saleUnitId: quarter.id, quantity: 1, unitPrice: 12 }]);
    expect(await balanceOf(id)).toBe(39);
  });

  it('los tres productos de balde son independientes entre sí', async () => {
    const tenant = await createTenant();
    const a = await bucketProduct(tenant, 'Aceite Balde granel');
    const b = await bucketProduct(tenant, 'Aceite Balde 25w60 diesel');
    const c = await bucketProduct(tenant, 'Aceite Balde 15w40 diesel');
    for (const product of [a, b, c]) await receiveBucket(tenant, product.id);
    await sell(tenant, [
      { productId: a.id, saleUnitId: a.quarter.id, quantity: 1, unitPrice: 12 },
      { productId: b.id, saleUnitId: b.eighth.id, quantity: 1, unitPrice: 7 },
    ]);
    expect(await balanceOf(a.id)).toBe(19);
    expect(await balanceOf(b.id)).toBe(19.5);
    expect(await balanceOf(c.id)).toBe(20);
    // Las formas de un balde no sirven para otro.
    await expect(
      sell(tenant, [{ productId: c.id, saleUnitId: a.quarter.id, quantity: 1, unitPrice: 12 }]),
    ).rejects.toMatchObject({ code: 'SALE_UNIT_NOT_FOUND' });
  });

  it('valida el envase: capacidad y nombre juntos y unidad válida; sin envase, producto normal', async () => {
    const tenant = await createTenant();
    await expect(
      products.create(tenant.businessId, { name: 'X', unit: 'litro', containerCapacity: 20 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      products.create(tenant.businessId, { name: 'X', unit: 'litro', containerLabel: 'Balde' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const legacy = await prisma.product.create({
      data: { businessId: tenant.businessId, name: 'Antiguo', unit: '0' },
    });
    await expect(
      products.update(tenant.businessId, legacy.id, {
        containerCapacity: 20,
        containerLabel: 'Balde',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const untouched = await prisma.product.findFirstOrThrow({ where: { id: legacy.id } });
    expect(untouched.containerCapacity).toBeNull();

    // Quitar el envase deja el producto normal.
    const { id } = await bucketProduct(tenant, 'Balde que se quita');
    const plain = await products.update(tenant.businessId, id, {
      containerCapacity: null,
      containerLabel: null,
    });
    expect(plain.containerCapacity).toBeNull();
    expect(plain.containerLabel).toBeNull();

    const normal = await products.create(tenant.businessId, { name: 'Filtro', unit: 'unidad' });
    expect(normal.containerCapacity).toBeNull();
    expect(normal.containerLabel).toBeNull();
  });
});

/**
 * Precio decidido en cada venta (2026-10-06): las formas 1/4 y 1/8 no tienen
 * precio fijo; cada venta guarda el suyo y el inventario no depende de él.
 */
describe('Precio del balde decidido en cada venta', () => {
  it('1/4 a S/ 10, 1/4 a S/ 11 y 1/8 a S/ 6: tres ventas válidas, cada una con su precio y sus litros', async () => {
    const tenant = await createTenant();
    const product = await products.create(tenant.businessId, {
      name: 'Aceite Balde granel',
      unit: 'litro',
      containerCapacity: 20,
      containerLabel: 'Balde',
    });
    const configured = await products.setSaleUnits(tenant.businessId, product.id, [
      { label: '1/4 de galón', factor: 1 },
      { label: '1/8 de galón', factor: 0.5 },
    ]);
    const [quarter, eighth] = configured.saleUnits;
    expect(quarter!.salePrice).toBeNull();
    expect(eighth!.salePrice).toBeNull();
    await inventory.count(tenant.businessId, tenant.userId, {
      productId: product.id,
      countedQuantity: 20,
    });

    const plan = [
      { unit: quarter!, price: 10, liters: 1, remaining: 19 },
      { unit: quarter!, price: 11, liters: 1, remaining: 18 },
      { unit: eighth!, price: 6, liters: 0.5, remaining: 17.5 },
    ];
    const saleIds: string[] = [];
    for (const step of plan) {
      const { sale } = await sell(tenant, [
        { productId: product.id, saleUnitId: step.unit.id, quantity: 1, unitPrice: step.price },
      ]);
      saleIds.push(sale.id);
      expect(Number(sale.total)).toBe(step.price);
      expect(Number(sale.lines[0]!.unitPrice)).toBe(step.price);
      expect(Number(sale.lines[0]!.saleUnitFactor)).toBe(step.liters);
      expect(await balanceOf(product.id)).toBe(step.remaining);
    }

    // Cada venta conserva su propio precio: la segunda no cambió la primera.
    const stored = await prisma.saleLine.findMany({
      where: { saleId: { in: saleIds } },
      include: { sale: true },
      orderBy: { sale: { createdAt: 'asc' } },
    });
    expect(stored.map((line) => Number(line.unitPrice))).toEqual([10, 11, 6]);
    // Y la forma sigue sin precio configurado.
    const units = await prisma.productSaleUnit.findMany({ where: { productId: product.id } });
    expect(units.every((unit) => unit.salePrice === null)).toBe(true);
  });
});
