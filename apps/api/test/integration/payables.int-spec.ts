import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { ProblemException } from '../../src/common/exceptions/problem.exception';
import { InventoryService, type ReceiptBatchInput } from '../../src/inventory/inventory.service';
import { PayablesService } from '../../src/payables/payables.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SuppliersService } from '../../src/suppliers/suppliers.service';

/**
 * Cuentas por pagar (R8, DEC-98 a DEC-100, BR-K7 a BR-K16) contra Postgres real:
 * compra al crédito con su deuda en la misma transacción, vencimiento por
 * plazo o pactado con historial, deudas de recepciones existentes, anulaciones,
 * resumen por moneda, restricciones SQL y aislamiento entre negocios.
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

/** 10/10/2026 a mediodía en Lima. */
const NOW = new Date('2026-10-10T17:00:00.000Z');

interface Tenant {
  businessId: string;
  userId: string;
  supplierId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R8D ${suffix}`, slug: `r8d-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'R8D', username: `r8d-${suffix}`, passwordHash: 'x' },
  });
  const supplier = await suppliers.create(business.id, user.id, { name: 'Distribuidora' });
  return { businessId: business.id, userId: user.id, supplierId: supplier.id };
}

async function createProduct(tenant: Tenant): Promise<string> {
  const product = await prisma.product.create({
    data: { businessId: tenant.businessId, name: `Aceite ${randomUUID()}`, unit: 'litro' },
  });
  return product.id;
}

function receive(
  tenant: Tenant,
  input: Omit<ReceiptBatchInput, 'lines'> & Partial<ReceiptBatchInput>,
  productId: string,
) {
  return inventory.createReceiptBatch(
    tenant.businessId,
    tenant.userId,
    {
      acknowledgePossibleDuplicate: true,
      lines: [{ productId, quantity: 10, purchaseCost: 500 }],
      ...input,
    },
    NOW,
  );
}

function creditUsd(tenant: Tenant, productId: string, extra: Partial<ReceiptBatchInput> = {}) {
  return receive(
    tenant,
    {
      supplierId: tenant.supplierId,
      currency: 'USD',
      paymentTerms: 'CREDIT',
      occurredAt: '2026-09-15T15:00:00.000Z',
      purchaseDate: '2026-09-15',
      ...extra,
    },
    productId,
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

async function snapshot(tenant: Tenant) {
  const [movements, receipts, payablesRows, changes, products] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.inventoryReceipt.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.supplierPayable.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.supplierPayableDueDateChange.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.product.findMany({
      where: { businessId: tenant.businessId },
      select: { id: true, stockQuantity: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return JSON.stringify({ movements, receipts, payablesRows, changes, products });
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

describe('Compra al crédito (R8, DEC-98)', () => {
  it('nace la deuda con la compra: fecha base = compra, vence a 30 días y deja el historial INITIAL', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const result = await creditUsd(tenant, productId, { purchaseExchangeRate: 3.7 });

    expect(result.receipt).toMatchObject({
      currency: 'USD',
      paymentTerms: 'CREDIT',
      purchaseExchangeRate: '3.7000',
      purchaseDate: '2026-09-15',
      purchaseDateSource: 'DOCUMENT',
    });
    expect(result.payable).toMatchObject({
      supplierId: tenant.supplierId,
      receiptId: result.receipt.id,
      currency: 'USD',
      originalAmount: '500.00',
      paidAmount: '0.00',
      balance: '500.00',
      amountSource: 'RECEIPT_LINES',
      issueDate: '2026-09-15',
      termDays: 30,
      dueDate: '2026-10-15',
      dueDateSource: 'DEFAULT_TERM',
      referenceExchangeRate: '3.7000',
      status: 'PENDING',
    });
    expect(result.warnings).toEqual([]);
    const detail = await payables.findOne(tenant.businessId, result.payable!.id, NOW);
    expect(detail.dueDateChanges).toEqual([
      expect.objectContaining({
        kind: 'INITIAL',
        previousDueDate: null,
        newDueDate: '2026-10-15',
        reason: 'Plazo predeterminado de 30 días',
      }),
    ]);
  });

  it('compra registrada tarde y ya vencida: se guarda, queda OVERDUE y avisa', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const result = await creditUsd(tenant, productId, {
      occurredAt: '2026-08-01T15:00:00.000Z',
      purchaseDate: '2026-08-01',
    });
    expect(result.payable).toMatchObject({ dueDate: '2026-08-31', status: 'OVERDUE' });
    expect(result.warnings).toEqual(['PAYABLE_ALREADY_OVERDUE']);
  });

  it('sin fecha de compra escrita: fija la de recepción en hora de Lima (23:30 del 15/09)', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const result = await creditUsd(tenant, productId, {
      occurredAt: '2026-09-16T04:30:00.000Z',
      purchaseDate: undefined,
    });
    expect(result.receipt).toMatchObject({
      purchaseDate: '2026-09-15',
      purchaseDateSource: 'RECEIPT_DATE',
    });
    expect(result.payable).toMatchObject({ issueDate: '2026-09-15', dueDate: '2026-10-15' });
  });

  it('vencimiento pactado: con motivo AGREED; sin motivo o antes de la base, 400 sin escribir', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const before = await snapshot(tenant);
    expect(
      (await rejection(creditUsd(tenant, productId, { dueDate: '2026-10-30' }))).errors,
    ).toEqual([expect.objectContaining({ field: 'dueDateReason' })]);
    expect(
      (
        await rejection(
          creditUsd(tenant, productId, { dueDate: '2026-09-01', dueDateReason: 'x y z' }),
        )
      ).errors,
    ).toEqual([expect.objectContaining({ field: 'dueDate' })]);
    expect(await snapshot(tenant)).toBe(before);

    const ok = await creditUsd(tenant, productId, {
      dueDate: '2026-10-30',
      dueDateReason: 'El proveedor dio 45 días',
    });
    expect(ok.payable).toMatchObject({ dueDate: '2026-10-30', dueDateSource: 'AGREED' });
    const detail = await payables.findOne(tenant.businessId, ok.payable!.id, NOW);
    expect(detail.dueDateChanges[0]).toMatchObject({
      kind: 'INITIAL',
      reason: 'El proveedor dio 45 días',
    });
  });

  it('importes inválidos: sin proveedor o moneda, línea sin monto o total 0 → 400 y nada se escribe', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const other = await createProduct(tenant);
    const before = await snapshot(tenant);

    expect(
      (await rejection(receive(tenant, { paymentTerms: 'CREDIT' }, productId))).errors!.map(
        (e) => e.field,
      ),
    ).toEqual(['supplierId', 'currency']);

    const missing = await rejection(
      creditUsd(tenant, productId, {
        lines: [
          { productId, quantity: 1, purchaseCost: 10 },
          { productId: other, quantity: 1 },
        ],
      }),
    );
    expect(missing.code).toBe('CREDIT_LINE_COST_REQUIRED');
    expect(missing.errors).toEqual([expect.objectContaining({ field: 'lines.1.purchaseCost' })]);

    const zero = await rejection(
      creditUsd(tenant, productId, { lines: [{ productId, quantity: 1, purchaseCost: 0 }] }),
    );
    expect(zero.code).toBe('CREDIT_TOTAL_MUST_BE_POSITIVE');

    expect(
      (await rejection(receive(tenant, { dueDate: '2026-10-30', dueDateReason: 'abc' }, productId)))
        .errors,
    ).toEqual([expect.objectContaining({ field: 'dueDate' })]);
    expect(
      (await rejection(receive(tenant, { currency: 'PEN', purchaseExchangeRate: 3.7 }, productId)))
        .errors,
    ).toEqual([expect.objectContaining({ field: 'purchaseExchangeRate' })]);
    expect(await snapshot(tenant)).toBe(before);

    // Una línea en 0 dentro de un total > 0 (producto bonificado) sí se acepta.
    const gift = await creditUsd(tenant, productId, {
      lines: [
        { productId, quantity: 1, purchaseCost: 10 },
        { productId: other, quantity: 1, purchaseCost: 0 },
      ],
    });
    expect(gift.payable!.originalAmount).toBe('10.00');
  });
});

describe('Vencimientos y estados (R8, BR-K8, BR-K16)', () => {
  it('el día del vencimiento no está vencida; al día siguiente sí', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const { payable } = await creditUsd(tenant, productId);
    const onDue = await payables.list(tenant.businessId, {}, new Date('2026-10-16T04:59:00.000Z'));
    expect(onDue.find((p) => p.id === payable!.id)!.status).toBe('PENDING');
    const after = await payables.list(tenant.businessId, {}, new Date('2026-10-16T05:00:00.000Z'));
    expect(after.find((p) => p.id === payable!.id)!.status).toBe('OVERDUE');
    expect(
      (
        await payables.list(
          tenant.businessId,
          { status: 'OVERDUE' },
          new Date('2026-10-16T05:00:00.000Z'),
        )
      ).map((p) => p.id),
    ).toEqual([payable!.id]);
  });

  it('cambio de vencimiento: historial CHANGE con motivo; la misma fecha no duplica; antes de la base 400', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const { payable } = await creditUsd(tenant, productId);
    const id = payable!.id;

    const changed = await payables.changeDueDate(
      tenant.businessId,
      tenant.userId,
      id,
      {
        dueDate: '2026-10-25',
        reason: 'Acordamos 10 días más',
      },
      NOW,
    );
    expect(changed).toMatchObject({ dueDate: '2026-10-25', dueDateSource: 'AGREED' });
    await payables.changeDueDate(
      tenant.businessId,
      tenant.userId,
      id,
      {
        dueDate: '2026-10-25',
        reason: 'Reintento',
      },
      NOW,
    );
    const detail = await payables.findOne(tenant.businessId, id, NOW);
    expect(
      detail.dueDateChanges.map((c) => [c.kind, c.previousDueDate, c.newDueDate, c.reason]),
    ).toEqual([
      ['INITIAL', null, '2026-10-15', 'Plazo predeterminado de 30 días'],
      ['CHANGE', '2026-10-15', '2026-10-25', 'Acordamos 10 días más'],
    ]);
    expect(
      (
        await rejection(
          payables.changeDueDate(tenant.businessId, tenant.userId, id, {
            dueDate: '2026-09-01',
            reason: 'abc',
          }),
        )
      ).code,
    ).toBe('VALIDATION_ERROR');
  });

  it('no cambia el vencimiento de una deuda pagada o anulada (409 PAYABLE_NOT_OPEN)', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const paid = (await creditUsd(tenant, productId)).payable!;
    await prisma.supplierPayable.update({ where: { id: paid.id }, data: { paidAmount: 500 } });
    expect(
      (
        await rejection(
          payables.changeDueDate(tenant.businessId, tenant.userId, paid.id, {
            dueDate: '2026-11-01',
            reason: 'abc',
          }),
        )
      ).code,
    ).toBe('PAYABLE_NOT_OPEN');

    const voided = (await creditUsd(tenant, productId, { documentRef: 'X2' })).payable!;
    await payables.voidPayable(tenant.businessId, tenant.userId, voided.id, 'Monto mal escrito');
    expect(
      (
        await rejection(
          payables.changeDueDate(tenant.businessId, tenant.userId, voided.id, {
            dueDate: '2026-11-01',
            reason: 'abc',
          }),
        )
      ).code,
    ).toBe('PAYABLE_NOT_OPEN');
  });
});

describe('Deuda de una recepción ya registrada (R8, D22/D30/D34)', () => {
  it('exige proveedor; luego crea la deuda manual sin tocar el stock, una sola vez', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const { receipt } = await receive(
      tenant,
      {
        occurredAt: '2026-09-15T15:00:00.000Z',
        lines: [{ productId, quantity: 4, purchaseCost: 1850 }],
      },
      productId,
    );
    const create = () =>
      payables.createForReceipt(
        tenant.businessId,
        tenant.userId,
        receipt.id,
        { currency: 'USD', amount: 500 },
        NOW,
      );

    expect((await rejection(create())).code).toBe('PURCHASE_INFO_REQUIRED');
    await inventory.setPurchaseInfo(
      tenant.businessId,
      tenant.userId,
      receipt.id,
      { supplierId: tenant.supplierId },
      NOW,
    );
    const stockBefore = await prisma.inventoryMovement.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    });

    const created = await create();
    expect(created).toMatchObject({
      currency: 'USD',
      originalAmount: '500.00',
      amountSource: 'MANUAL',
      issueDate: '2026-09-15',
      dueDate: '2026-10-15',
      status: 'PENDING',
    });
    expect(
      await prisma.inventoryMovement.findMany({
        where: { businessId: tenant.businessId },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(stockBefore);
    const updated = await inventory.getReceipt(tenant.businessId, receipt.id);
    expect(updated.receipt).toMatchObject({
      purchaseDate: '2026-09-15',
      purchaseDateSource: 'RECEIPT_DATE',
      paymentTerms: 'CREDIT',
      totalCost: receipt.totalCost,
    });
    expect(updated.payable!.id).toBe(created.id);

    expect((await rejection(create())).code).toBe('PAYABLE_ALREADY_EXISTS');
  });

  it('otra fecha base exige motivo; monto 0 o con 3 decimales: 400; recepción anulada: 409', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const { receipt } = await receive(tenant, { supplierId: tenant.supplierId }, productId);
    const create = (dto: Record<string, unknown>) =>
      payables.createForReceipt(
        tenant.businessId,
        tenant.userId,
        receipt.id,
        { currency: 'PEN', amount: 100, ...dto } as never,
        NOW,
      );
    expect((await rejection(create({ amount: 0 }))).code).toBe('VALIDATION_ERROR');
    expect((await rejection(create({ amount: 10.123 }))).code).toBe('VALIDATION_ERROR');
    expect((await rejection(create({ issueDate: '2026-09-01' }))).errors).toEqual([
      expect.objectContaining({ field: 'issueDateReason' }),
    ]);
    expect((await rejection(create({ referenceExchangeRate: 3.7 }))).errors).toEqual([
      expect.objectContaining({ field: 'referenceExchangeRate' }),
    ]);
    const withBase = await create({
      issueDate: '2026-09-01',
      issueDateReason: 'Fecha de la factura',
    });
    expect(withBase).toMatchObject({
      issueDate: '2026-09-01',
      dueDate: '2026-10-01',
      status: 'OVERDUE',
    });
    expect(withBase.warnings).toEqual(['PAYABLE_ALREADY_OVERDUE']);
  });

  it('dos registros simultáneos de la deuda: uno gana y el otro recibe 409', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const { receipt } = await receive(tenant, { supplierId: tenant.supplierId }, productId);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        payables.createForReceipt(
          tenant.businessId,
          tenant.userId,
          receipt.id,
          { currency: 'PEN', amount: 80 },
          NOW,
        ),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((failed[0]!.reason as ProblemException).code).toBe('PAYABLE_ALREADY_EXISTS');
    expect(await prisma.supplierPayable.count({ where: { receiptId: receipt.id } })).toBe(1);
  });
});

describe('Anulaciones con deuda (R8, D16/D31)', () => {
  it('anular solo la deuda la libera para registrarla de nuevo; con pagos: 409', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const { receipt, payable } = await creditUsd(tenant, productId);
    const voided = await payables.voidPayable(
      tenant.businessId,
      tenant.userId,
      payable!.id,
      'Moneda equivocada',
    );
    expect(voided).toMatchObject({ status: 'VOIDED', voidReason: 'Moneda equivocada' });
    expect(
      (
        await rejection(
          payables.voidPayable(tenant.businessId, tenant.userId, payable!.id, 'otra vez'),
        )
      ).code,
    ).toBe('PAYABLE_ALREADY_VOIDED');
    const again = await payables.createForReceipt(
      tenant.businessId,
      tenant.userId,
      receipt.id,
      { currency: 'PEN', amount: 1850 },
      NOW,
    );
    await prisma.supplierPayable.update({ where: { id: again.id }, data: { paidAmount: 10 } });
    expect(
      (await rejection(payables.voidPayable(tenant.businessId, tenant.userId, again.id, 'abc')))
        .code,
    ).toBe('PAYABLE_HAS_PAYMENTS');
  });

  it('anular la recepción anula su deuda sin pagos; con pagos se rechaza sin escribir', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const first = await creditUsd(tenant, productId);
    await inventory.voidReceipt(
      tenant.businessId,
      tenant.userId,
      first.receipt.id,
      'Registrada dos veces',
    );
    const after = await prisma.supplierPayable.findFirstOrThrow({
      where: { id: first.payable!.id },
    });
    expect(after.voidReason).toBe('Registrada dos veces');

    const second = await creditUsd(tenant, productId, { documentRef: 'B2' });
    await prisma.supplierPayable.update({
      where: { id: second.payable!.id },
      data: { paidAmount: 1 },
    });
    const before = await snapshot(tenant);
    expect(
      (
        await rejection(
          inventory.voidReceipt(tenant.businessId, tenant.userId, second.receipt.id, 'abc'),
        )
      ).code,
    ).toBe('PAYABLE_HAS_PAYMENTS');
    expect(await snapshot(tenant)).toBe(before);
  });
});

describe('Resúmenes por moneda (R8, DEC-100)', () => {
  it('cuentas por pagar: por moneda, con vencidas y por vencer, sin sumar soles y dólares', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await creditUsd(tenant, productId); // vence 15/10: por vencer
    await creditUsd(tenant, productId, {
      occurredAt: '2026-08-01T15:00:00.000Z',
      purchaseDate: '2026-08-01',
      documentRef: 'O1',
    }); // vencida
    await receive(
      tenant,
      {
        supplierId: tenant.supplierId,
        currency: 'PEN',
        paymentTerms: 'CREDIT',
        lines: [{ productId, quantity: 1, purchaseCost: 99.9 }],
      },
      productId,
    );
    const summary = await payables.summary(tenant.businessId, NOW);
    expect(summary).toEqual({
      today: '2026-10-10',
      currencies: [
        {
          currency: 'PEN',
          openCount: 1,
          openBalance: '99.90',
          overdueCount: 0,
          overdueBalance: '0.00',
          dueSoonCount: 0,
          dueSoonBalance: '0.00',
        },
        {
          currency: 'USD',
          openCount: 2,
          openBalance: '1000.00',
          overdueCount: 1,
          overdueBalance: '500.00',
          dueSoonCount: 1,
          dueSoonBalance: '500.00',
        },
      ],
    });
  });

  it('compras del mes: dólares aparte con su equivalente informativo; los soles no cambian', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    await receive(
      tenant,
      {
        occurredAt: '2026-09-10T15:00:00.000Z',
        lines: [{ productId, quantity: 1, purchaseCost: 40 }],
      },
      productId,
    );
    await creditUsd(tenant, productId, { purchaseExchangeRate: 3.75 });
    await creditUsd(tenant, productId, {
      documentRef: 'U2',
      lines: [{ productId, quantity: 2, purchaseCost: 100 }],
    });
    const summary = await inventory.receiptsMonthSummary(tenant.businessId, '2026-09', NOW);
    expect(summary).toMatchObject({ receiptCount: 3, totalCost: '40.00' });
    expect(summary.products).toEqual([expect.objectContaining({ totalCost: '40.00' })]);
    expect(summary.usd).toMatchObject({
      receiptCount: 2,
      totalCost: '600.00',
      penEquivalent: '1875.00',
      withoutRateCount: 1,
    });
  });
});

describe('Restricciones SQL y aislamiento (R8, DEC-101)', () => {
  it('CHECK de la deuda e historial (23514) y FK compuesta entre negocios (23503)', async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const productId = await createProduct(tenant);
    const { payable } = await creditUsd(tenant, productId);
    const cash = await receive(tenant, { documentRef: undefined }, productId);
    const id = payable!.id;
    expect(
      await sqlError(`UPDATE "supplier_payables" SET "originalAmount" = 0 WHERE "id" = '${id}'`),
    ).toBe('23514');
    expect(
      await sqlError(`UPDATE "supplier_payables" SET "paidAmount" = 600 WHERE "id" = '${id}'`),
    ).toBe('23514');
    expect(
      await sqlError(
        `UPDATE "supplier_payables" SET "dueDate" = '2026-09-01' WHERE "id" = '${id}'`,
      ),
    ).toBe('23514');
    expect(
      await sqlError(
        `UPDATE "supplier_payables" SET "currency" = 'PEN' WHERE "id" = '${id}' AND "referenceExchangeRate" IS NULL`,
      ),
    ).toBe('ok');
    expect(
      await sqlError(
        `UPDATE "supplier_payables" SET "referenceExchangeRate" = 3.7 WHERE "id" = '${id}'`,
      ),
    ).toBe('23514');
    expect(
      await sqlError(
        `INSERT INTO "supplier_payables" ("id","businessId","supplierId","receiptId","currency","originalAmount","amountSource","issueDate","dueDate","dueDateSource","createdById","updatedAt")
         VALUES ('${randomUUID()}','${other.businessId}','${other.supplierId}','${cash.receipt.id}','PEN',10,'MANUAL','2026-09-01','2026-10-01','DEFAULT_TERM','${other.userId}',now())`,
      ),
    ).toBe('23503');
    expect(
      await sqlError(
        `INSERT INTO "supplier_payable_due_date_changes" ("id","businessId","payableId","kind","newDueDate","reason","createdById")
         VALUES ('${randomUUID()}','${other.businessId}','${id}','INITIAL','2026-10-01','x','${other.userId}')`,
      ),
    ).toBe('23503');
    expect(
      await sqlError(
        `INSERT INTO "supplier_payable_due_date_changes" ("id","businessId","payableId","kind","newDueDate","reason","createdById")
         VALUES ('${randomUUID()}','${tenant.businessId}','${id}','CHANGE','2026-10-01','x','${tenant.userId}')`,
      ),
    ).toBe('23514');
  });

  it('otro negocio no ve, no cambia ni anula la deuda, ni registra deuda sobre la recepción ajena', async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const productId = await createProduct(tenant);
    const { payable, receipt } = await creditUsd(tenant, productId);
    expect(await payables.list(other.businessId, {}, NOW)).toEqual([]);
    expect((await payables.summary(other.businessId, NOW)).currencies).toEqual([]);
    expect((await rejection(payables.findOne(other.businessId, payable!.id, NOW))).code).toBe(
      'PAYABLE_NOT_FOUND',
    );
    expect(
      (
        await rejection(
          payables.changeDueDate(other.businessId, other.userId, payable!.id, {
            dueDate: '2026-11-01',
            reason: 'abc',
          }),
        )
      ).code,
    ).toBe('PAYABLE_NOT_FOUND');
    expect(
      (await rejection(payables.voidPayable(other.businessId, other.userId, payable!.id, 'abc')))
        .code,
    ).toBe('PAYABLE_NOT_FOUND');
    expect(
      (
        await rejection(
          payables.createForReceipt(
            other.businessId,
            other.userId,
            receipt.id,
            { currency: 'PEN', amount: 1 },
            NOW,
          ),
        )
      ).code,
    ).toBe('RECEIPT_NOT_FOUND');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
