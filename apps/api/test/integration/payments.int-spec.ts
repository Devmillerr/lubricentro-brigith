import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { ProblemException } from '../../src/common/exceptions/problem.exception';
import { InventoryService, type ReceiptBatchInput } from '../../src/inventory/inventory.service';
import type { RegisterPaymentDto } from '../../src/payables/dto/payable.dto';
import { PayablesService } from '../../src/payables/payables.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SuppliersService } from '../../src/suppliers/suppliers.service';

/**
 * Pagos a proveedores (R8, DEC-99, DEC-100, BR-K11 a BR-K14) contra Postgres
 * real: deuda en USD pagada en PEN con tipo de cambio, pagos parciales,
 * liquidación de un céntimo, sobrepago sin escrituras, anulación de pagos,
 * diferencia cambiaria, concurrencia, restricciones SQL y aislamiento.
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
/** 12/10/2026 en Lima: antes del vencimiento (15/10) de las compras del 15/09. */
const NOW = new Date('2026-10-12T17:00:00.000Z');

interface Tenant {
  businessId: string;
  userId: string;
  supplierId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R8P ${suffix}`, slug: `r8pay-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'R8P', username: `r8pay-${suffix}`, passwordHash: 'x' },
  });
  const supplier = await suppliers.create(business.id, user.id, { name: 'Distribuidora' });
  return { businessId: business.id, userId: user.id, supplierId: supplier.id };
}

/** Compra al crédito del 15/09 por `amount` en `currency`. */
async function debt(
  tenant: Tenant,
  currency: 'PEN' | 'USD',
  amount: number,
  extra: Partial<ReceiptBatchInput> = {},
) {
  const product = await prisma.product.create({
    data: { businessId: tenant.businessId, name: `Aceite ${randomUUID()}`, unit: 'litro' },
  });
  const result = await inventory.createReceiptBatch(
    tenant.businessId,
    tenant.userId,
    {
      supplierId: tenant.supplierId,
      currency,
      paymentTerms: 'CREDIT',
      occurredAt: '2026-09-15T15:00:00.000Z',
      purchaseDate: '2026-09-15',
      lines: [{ productId: product.id, quantity: 10, purchaseCost: amount }],
      ...extra,
    },
    NOW,
  );
  return { payableId: result.payable!.id, receiptId: result.receipt.id };
}

function pay(tenant: Tenant, payableId: string, dto: Partial<RegisterPaymentDto>) {
  return payables.addPayment(
    tenant.businessId,
    tenant.userId,
    payableId,
    {
      paidOn: '2026-10-12',
      paymentCurrency: 'PEN',
      amountPaid: 1,
      method: 'TRANSFER',
      ...dto,
    },
    NOW,
  );
}

async function rejection(promise: Promise<unknown>): Promise<ProblemException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('Se esperaba un rechazo');
}

async function state(tenant: Tenant) {
  const [payablesRows, payments] = await Promise.all([
    prisma.supplierPayable.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.supplierPayment.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
  ]);
  return JSON.stringify({ payablesRows, payments });
}

async function sqlError(sql: string): Promise<string> {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    const text = String((error as Error).message);
    return /\b(23503|23514|23505)\b/.exec(text)?.[1] ?? text;
  }
  return 'ok';
}

describe('Deuda en USD pagada en PEN (R8, DEC-99)', () => {
  it('USD 500: S/ 750 a 3.75 y S/ 1 140 a 3.80 → pagada; original intacto; diferencia +10 y +30', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'USD', 500, { purchaseExchangeRate: 3.7 });

    const first = await pay(tenant, payableId, {
      amountPaid: 750,
      exchangeRate: 3.75,
      paidOn: '2026-10-01',
      reference: 'OP-1',
    });
    expect(first).toMatchObject({
      status: 'PARTIAL',
      paidAmount: '200.00',
      balance: '300.00',
      originalAmount: '500.00',
    });

    const second = await pay(tenant, payableId, {
      amountPaid: 1140,
      exchangeRate: 3.8,
      paidOn: '2026-10-12',
    });
    expect(second).toMatchObject({
      status: 'PAID',
      paidAmount: '500.00',
      balance: '0.00',
      originalAmount: '500.00',
    });
    expect(
      second.payments.map((p) => [
        p.paymentCurrency,
        p.amountPaid,
        p.exchangeRate,
        p.appliedAmount,
        p.paidOn,
      ]),
    ).toEqual([
      ['PEN', '750.00', '3.7500', '200.00', '2026-10-01'],
      ['PEN', '1140.00', '3.8000', '300.00', '2026-10-12'],
    ]);
    expect(second.payments.map((p) => p.fxDifference)).toEqual([
      { status: 'CALCULATED', amountPen: '10.00' },
      { status: 'CALCULATED', amountPen: '30.00' },
    ]);
    expect(second.fxDifferenceTotal).toEqual({
      calculatedCount: 2,
      applicableCount: 2,
      amountPen: '40.00',
    });
    expect(second.payments[0]!.reference).toBe('OP-1');

    expect(
      (await rejection(pay(tenant, payableId, { amountPaid: 1, exchangeRate: 3.8 }))).code,
    ).toBe('PAYABLE_NOT_OPEN');
  });

  it('sin tipo de cambio de referencia: la diferencia "no se puede calcular"', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'USD', 100);
    const result = await pay(tenant, payableId, { amountPaid: 375, exchangeRate: 3.75 });
    expect(result.payments[0]!.fxDifference).toEqual({ status: 'NOT_CALCULABLE', amountPen: null });
    expect(result.fxDifferenceTotal).toEqual({
      calculatedCount: 0,
      applicableCount: 1,
      amountPen: null,
    });
  });

  it('otras combinaciones: deuda PEN pagada en USD (× tipo de cambio) y USD en USD: "no aplica"', async () => {
    const tenant = await createTenant();
    const pen = await debt(tenant, 'PEN', 100);
    const a = await pay(tenant, pen.payableId, {
      paymentCurrency: 'USD',
      amountPaid: 10,
      exchangeRate: 3.7525,
    });
    expect(a.payments[0]).toMatchObject({
      appliedAmount: '37.53',
      fxDifference: { status: 'NOT_APPLICABLE' },
    });
    expect(a.balance).toBe('62.47');
    const usd = await debt(tenant, 'USD', 50, { documentRef: 'U' });
    const b = await pay(tenant, usd.payableId, { paymentCurrency: 'USD', amountPaid: 20 });
    expect(b.payments[0]).toMatchObject({
      exchangeRate: null,
      appliedAmount: '20.00',
      fxDifference: { status: 'NOT_APPLICABLE' },
    });
  });
});

describe('Validaciones y liquidación (R8, DEC-99, D12, D27)', () => {
  it('tipo de cambio: obligatorio solo con monedas distintas; fuera de rango solo avisa', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'USD', 100);
    expect((await rejection(pay(tenant, payableId, { amountPaid: 10 }))).errors).toEqual([
      expect.objectContaining({ field: 'exchangeRate' }),
    ]);
    expect(
      (
        await rejection(
          pay(tenant, payableId, { paymentCurrency: 'USD', amountPaid: 10, exchangeRate: 3.7 }),
        )
      ).errors,
    ).toEqual([expect.objectContaining({ field: 'exchangeRate' })]);
    const warned = await pay(tenant, payableId, { amountPaid: 10, exchangeRate: 6 });
    expect(warned.warnings).toEqual(['EXCHANGE_RATE_OUT_OF_RANGE']);
  });

  it('sobrepago: 422 con el máximo admisible y sin escribir nada', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'USD', 300);
    const before = await state(tenant);
    const error = await rejection(pay(tenant, payableId, { amountPaid: 1200, exchangeRate: 3.8 }));
    expect(error.code).toBe('OVERPAYMENT');
    expect(error.data).toMatchObject({ balance: '300.00', maxAmountPaid: '1140.01' });
    expect(await state(tenant)).toBe(before);
  });

  it('liquidación de un céntimo con motivo cierra la deuda; sin motivo 400; con más diferencia 422', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'USD', 300);
    expect(
      (
        await rejection(
          pay(tenant, payableId, { amountPaid: 1139.97, exchangeRate: 3.8, settlesBalance: true }),
        )
      ).code,
    ).toBe('VALIDATION_ERROR');
    expect(
      (
        await rejection(
          pay(tenant, payableId, {
            amountPaid: 1139.9,
            exchangeRate: 3.8,
            settlesBalance: true,
            settlementReason: 'abc',
          }),
        )
      ).code,
    ).toBe('SETTLEMENT_MISMATCH');
    const done = await pay(tenant, payableId, {
      amountPaid: 1139.97,
      exchangeRate: 3.8,
      settlesBalance: true,
      settlementReason: 'Diferencia de redondeo del banco',
    });
    expect(done).toMatchObject({ status: 'PAID', balance: '0.00' });
    expect(done.payments[0]).toMatchObject({
      amountPaid: '1139.97',
      computedAppliedAmount: '299.99',
      appliedAmount: '300.00',
      settlesBalance: true,
      settlementReason: 'Diferencia de redondeo del banco',
    });
  });

  it('sin la marca, un céntimo de menos deja la deuda parcial (no se cierra sola)', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'USD', 300);
    const result = await pay(tenant, payableId, { amountPaid: 1139.97, exchangeRate: 3.8 });
    expect(result).toMatchObject({ status: 'PARTIAL', balance: '0.01' });
  });

  it('fecha del pago: no antes de la compra (sin anticipos) ni futura; monto 0: 400', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'PEN', 100);
    expect(
      (await rejection(pay(tenant, payableId, { paidOn: '2026-09-14', amountPaid: 10 }))).errors,
    ).toEqual([expect.objectContaining({ field: 'paidOn' })]);
    expect(
      (await rejection(pay(tenant, payableId, { paidOn: '2026-10-13', amountPaid: 10 }))).errors,
    ).toEqual([expect.objectContaining({ field: 'paidOn' })]);
    expect((await rejection(pay(tenant, payableId, { amountPaid: 0 }))).code).toBe(
      'VALIDATION_ERROR',
    );
    await pay(tenant, payableId, { paidOn: '2026-09-15', amountPaid: 10 });
  });
});

describe('Anulación de pagos (R8, D18)', () => {
  it('restituye el saldo; doble anulación 409; pago de otra deuda 404', async () => {
    const tenant = await createTenant();
    const a = await debt(tenant, 'PEN', 100);
    const b = await debt(tenant, 'PEN', 100, { documentRef: 'B' });
    const paid = await pay(tenant, a.payableId, { amountPaid: 100 });
    expect(paid.status).toBe('PAID');
    const paymentId = paid.payments[0]!.id;

    const voided = await payables.cancelPayment(
      tenant.businessId,
      tenant.userId,
      a.payableId,
      paymentId,
      'Transferencia rechazada',
      NOW,
    );
    expect(voided).toMatchObject({ status: 'PENDING', paidAmount: '0.00', balance: '100.00' });
    expect(voided.payments[0]).toMatchObject({
      voidReason: 'Transferencia rechazada',
      amountPaid: '100.00',
    });
    expect(
      (
        await rejection(
          payables.cancelPayment(
            tenant.businessId,
            tenant.userId,
            a.payableId,
            paymentId,
            'otra vez',
            NOW,
          ),
        )
      ).code,
    ).toBe('PAYMENT_ALREADY_VOIDED');
    expect(
      (
        await rejection(
          payables.cancelPayment(
            tenant.businessId,
            tenant.userId,
            b.payableId,
            paymentId,
            'abc',
            NOW,
          ),
        )
      ).code,
    ).toBe('PAYMENT_NOT_FOUND');
  });

  it('recepción con pagos activos no se anula; tras anular el pago, sí (y su deuda también)', async () => {
    const tenant = await createTenant();
    const { payableId, receiptId } = await debt(tenant, 'PEN', 100);
    const paid = await pay(tenant, payableId, { amountPaid: 30 });
    expect(
      (await rejection(inventory.voidReceipt(tenant.businessId, tenant.userId, receiptId, 'abc')))
        .code,
    ).toBe('PAYABLE_HAS_PAYMENTS');
    expect(
      (await rejection(payables.voidPayable(tenant.businessId, tenant.userId, payableId, 'abc')))
        .code,
    ).toBe('PAYABLE_HAS_PAYMENTS');
    await payables.cancelPayment(
      tenant.businessId,
      tenant.userId,
      payableId,
      paid.payments[0]!.id,
      'Error',
      NOW,
    );
    await inventory.voidReceipt(tenant.businessId, tenant.userId, receiptId, 'Compra duplicada');
    const after = await payables.findOne(tenant.businessId, payableId, NOW);
    expect(after.status).toBe('VOIDED');
    expect((await rejection(pay(tenant, payableId, { amountPaid: 1 }))).code).toBe(
      'PAYABLE_VOIDED',
    );
  });
});

describe('Concurrencia de pagos (R8)', () => {
  it('dos pagos simultáneos que juntos superan el saldo: uno pasa y el otro es sobrepago', async () => {
    const tenant = await createTenant();
    const { payableId } = await debt(tenant, 'PEN', 500);
    const results = await Promise.allSettled([
      pay(tenant, payableId, { amountPaid: 300 }),
      pay(tenant, payableId, { amountPaid: 300 }),
    ]);
    const failed = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((failed[0]!.reason as ProblemException).code).toBe('OVERPAYMENT');
    const payable = await prisma.supplierPayable.findFirstOrThrow({ where: { id: payableId } });
    expect(Number(payable.paidAmount)).toBe(300);
    const sum = await prisma.supplierPayment.aggregate({
      where: { payableId, voidedAt: null },
      _sum: { appliedAmount: true },
    });
    expect(Number(sum._sum.appliedAmount)).toBe(300);
  });

  it('pago y anulación de la deuda a la vez: nunca un pago activo sobre una deuda anulada', async () => {
    for (let round = 0; round < 4; round++) {
      const tenant = await createTenant();
      const { payableId } = await debt(tenant, 'PEN', 100);
      const [paid, voided] = await Promise.allSettled([
        pay(tenant, payableId, { amountPaid: 40 }),
        payables.voidPayable(tenant.businessId, tenant.userId, payableId, 'Anulación'),
      ]);
      const payable = await prisma.supplierPayable.findFirstOrThrow({ where: { id: payableId } });
      const active = await prisma.supplierPayment.count({ where: { payableId, voidedAt: null } });
      if (paid.status === 'fulfilled') {
        expect(voided.status).toBe('rejected');
        expect((voided as PromiseRejectedResult).reason.code).toBe('PAYABLE_HAS_PAYMENTS');
        expect(payable.voidedAt).toBeNull();
        expect(active).toBe(1);
      } else {
        expect((paid.reason as ProblemException).code).toBe('PAYABLE_VOIDED');
        expect(payable.voidedAt).not.toBeNull();
        expect(active).toBe(0);
      }
    }
  });
});

describe('Restricciones SQL y aislamiento de pagos (R8, DEC-101)', () => {
  it('CHECK (23514) y FK compuesta entre negocios (23503)', async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const { payableId } = await debt(tenant, 'USD', 100);
    const base = (overrides: Record<string, string>) => {
      const v = {
        id: `'${randomUUID()}'`,
        businessId: `'${tenant.businessId}'`,
        payableId: `'${payableId}'`,
        paidOn: `'2026-10-01'`,
        paymentCurrency: `'PEN'`,
        amountPaid: '37.5',
        debtCurrency: `'USD'`,
        exchangeRate: '3.75',
        computedAppliedAmount: '10',
        appliedAmount: '10',
        settlesBalance: 'false',
        settlementReason: 'NULL',
        method: `'CASH'`,
        createdById: `'${tenant.userId}'`,
        ...overrides,
      };
      return `INSERT INTO "supplier_payments" (${Object.keys(v)
        .map((k) => `"${k}"`)
        .join(',')}) VALUES (${Object.values(v).join(',')})`;
    };
    expect(await sqlError(base({ exchangeRate: 'NULL' }))).toBe('23514');
    expect(await sqlError(base({ paymentCurrency: `'USD'` }))).toBe('23514');
    expect(await sqlError(base({ appliedAmount: '10.01' }))).toBe('23514');
    expect(await sqlError(base({ settlesBalance: 'true', appliedAmount: '10.01' }))).toBe('23514');
    expect(await sqlError(base({ amountPaid: '0' }))).toBe('23514');
    expect(
      await sqlError(
        base({ businessId: `'${other.businessId}'`, createdById: `'${other.userId}'` }),
      ),
    ).toBe('23503');
  });

  it('otro negocio no paga ni anula pagos de la deuda ajena', async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const { payableId } = await debt(tenant, 'PEN', 100);
    const paid = await pay(tenant, payableId, { amountPaid: 10 });
    expect((await rejection(pay(other, payableId, { amountPaid: 10 }))).code).toBe(
      'PAYABLE_NOT_FOUND',
    );
    expect(
      (
        await rejection(
          payables.cancelPayment(
            other.businessId,
            other.userId,
            payableId,
            paid.payments[0]!.id,
            'abc',
            NOW,
          ),
        )
      ).code,
    ).toBe('PAYABLE_NOT_FOUND');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
