import { randomUUID } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { ProblemException } from '../../src/common/exceptions/problem.exception';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PayablesService } from '../../src/payables/payables.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';
import { SuppliersService } from '../../src/suppliers/suppliers.service';

/**
 * Escenario D de la auditoría (R8), de punta a punta con los servicios reales:
 * el proveedor entrega el 15/09 al crédito por 30 días en dólares; parte de la
 * mercadería ya se vendió y el stock se contó; la compra se registra el 10/10;
 * se paga después en soles con dos tipos de cambio. Comprueba fechas, stock,
 * historial, deuda, pagos, diferencia cambiaria y resúmenes.
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
const payables = new PayablesService(prisma);
const suppliers = new SuppliersService(prisma);
const sales = new SalesService(prisma);

it('escenario D: compra atrasada al crédito en USD, ya vendida y contada, pagada en soles', async () => {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `Escenario D ${suffix}`, slug: `esc-d-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'Saúl', username: `esc-d-${suffix}`, passwordHash: 'x' },
  });
  const b = business.id;
  const u = user.id;
  const supplier = await suppliers.create(b, u, {
    name: 'Lubricantes del Norte',
    taxId: '20111222333',
  });
  const product = await prisma.product.create({
    data: { businessId: b, name: 'Aceite 20W50 galón', unit: 'galón', salePrice: 120 },
  });

  // 01/09: había 5 galones (conteo inicial).
  await inventory.count(b, u, {
    productId: product.id,
    countedQuantity: 5,
    occurredAt: '2026-09-01T15:00:00.000Z',
  });
  // 15/09 llegan 10 galones, pero no se registran. 20/09 se venden 3.
  await sales.create(b, u, {
    paymentMethod: PaymentMethod.CASH,
    occurredAt: '2026-09-20T16:00:00.000Z',
    lines: [{ productId: product.id, quantity: 3, unitPrice: 120 }],
  });
  // 01/10 se cuenta el estante: 5 + 10 − 3 = 12 (incluye lo recibido).
  await inventory.count(b, u, {
    productId: product.id,
    countedQuantity: 12,
    occurredAt: '2026-10-01T15:00:00.000Z',
  });

  // 10/10 se registra la compra del 15/09, al crédito, en dólares.
  const registeredAt = new Date('2026-10-10T17:00:00.000Z');
  const input = {
    occurredAt: '2026-09-15T15:00:00.000Z',
    supplierId: supplier.id,
    documentRef: 'F001-4567',
    purchaseDate: '2026-09-15',
    currency: 'USD' as const,
    purchaseExchangeRate: 3.7,
    paymentTerms: 'CREDIT' as const,
    lines: [{ productId: product.id, quantity: 10, purchaseCost: 500 }],
  };
  const first = await inventory
    .createReceiptBatch(b, u, input, registeredAt)
    .catch((e: unknown) => e);
  expect((first as ProblemException).code).toBe('LATER_STOCK_CHECKS_FOUND');
  expect(await prisma.supplierPayable.count({ where: { businessId: b } })).toBe(0);

  // La mercadería ya estaba en el conteo del 01/10: el estante tiene 12.
  const created = await inventory.createReceiptBatch(
    b,
    u,
    {
      ...input,
      laterStockChecks: [
        { productId: product.id, resolution: 'SET_PHYSICAL', physicalQuantity: 12 },
      ],
    },
    registeredAt,
  );

  // Fechas separadas: recepción, compra, registro y vencimiento contractual.
  expect(created.receipt.occurredAt.toISOString()).toBe('2026-09-15T15:00:00.000Z');
  expect(created.receipt.purchaseDate).toBe('2026-09-15');
  expect(created.receipt.createdAt.getTime()).toBeGreaterThan(registeredAt.getTime() - 60 * 60_000);
  expect(created.payable).toMatchObject({
    currency: 'USD',
    originalAmount: '500.00',
    issueDate: '2026-09-15',
    dueDate: '2026-10-15',
    referenceExchangeRate: '3.7000',
    status: 'PENDING',
  });

  // Stock: no se duplicó; el saldo es la suma de movimientos y coincide con el estante.
  const stock = await prisma.product.findFirstOrThrow({ where: { id: product.id } });
  const sum = await prisma.inventoryMovement.aggregate({
    where: { productId: product.id },
    _sum: { quantityDelta: true },
  });
  expect(Number(stock.stockQuantity)).toBe(12);
  expect(Number(sum._sum.quantityDelta)).toBe(12);
  const history = await prisma.inventoryMovement.findMany({
    where: { productId: product.id },
    orderBy: { ledgerSeq: 'asc' },
  });
  expect(history.map((m) => [m.type, Number(m.quantityDelta)])).toEqual([
    ['COUNT', 5],
    ['SALE', -3],
    ['COUNT', 10],
    ['PURCHASE_IN', 10],
    ['ADJUSTMENT', -10],
  ]);

  // Pagos en soles: 12/10 S/ 750 a 3.75; 15/10 S/ 1 140 a 3.80.
  const id = created.payable!.id;
  const p1 = await payables.addPayment(
    b,
    u,
    id,
    {
      paidOn: '2026-10-12',
      paymentCurrency: 'PEN',
      amountPaid: 750,
      exchangeRate: 3.75,
      method: 'TRANSFER',
      reference: 'OP-111',
    },
    new Date('2026-10-12T17:00:00.000Z'),
  );
  expect(p1).toMatchObject({ status: 'PARTIAL', balance: '300.00' });
  const p2 = await payables.addPayment(
    b,
    u,
    id,
    {
      paidOn: '2026-10-15',
      paymentCurrency: 'PEN',
      amountPaid: 1140,
      exchangeRate: 3.8,
      method: 'YAPE',
    },
    new Date('2026-10-15T17:00:00.000Z'),
  );
  expect(p2).toMatchObject({ status: 'PAID', balance: '0.00', originalAmount: '500.00' });
  expect(p2.fxDifferenceTotal).toEqual({
    calculatedCount: 2,
    applicableCount: 2,
    amountPen: '40.00',
  });

  // Resúmenes: setiembre trae la compra en dólares aparte; no hay deudas abiertas.
  const month = await inventory.receiptsMonthSummary(
    b,
    '2026-09',
    new Date('2026-10-15T17:00:00.000Z'),
  );
  expect(month).toMatchObject({ receiptCount: 1, totalCost: '0.00' });
  expect(month.usd).toMatchObject({ totalCost: '500.00', penEquivalent: '1850.00' });
  expect((await payables.summary(b, new Date('2026-10-16T17:00:00.000Z'))).currencies).toEqual([]);

  // La recepción con ventas y conteos posteriores no se puede anular.
  const voidAttempt = await inventory
    .voidReceipt(b, u, created.receipt.id, 'Prueba')
    .catch((e: unknown) => e);
  expect((voidAttempt as ProblemException).code).toBe('PAYABLE_HAS_PAYMENTS');
});

afterAll(async () => {
  await prisma.$disconnect();
});
