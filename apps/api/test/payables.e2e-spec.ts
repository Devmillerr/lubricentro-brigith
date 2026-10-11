import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { applyGlobalPrefix } from '../src/common/openapi/openapi-document';
import { validationExceptionFactory } from '../src/common/validation-exception-factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Contrato HTTP de cuentas por pagar (R8, DEC-98): compra al crédito, lista,
 * resumen, detalle, cambio de vencimiento, anulación y deuda de una recepción
 * existente. Solo contra una base de prueba (nombre terminado en "_test").
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('Cuentas por pagar (R8, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let businessId: string;
  let supplierId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => `Bearer ${token}`;

  async function product() {
    return (
      await prisma.product.create({
        data: { businessId, name: `E2E CxP ${randomUUID()}`, unit: 'litro' },
      })
    ).id;
  }

  const postReceipt = (body: object) =>
    http()
      .post('/api/v1/inventory/receipts')
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send(body);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E CxP ${suffix}`, slug: `e2e-cxp-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E CxP',
        username: `e2e-cxp-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    supplierId = (
      await prisma.supplier.create({
        data: { businessId, name: 'Proveedor E2E', createdById: user.id },
      })
    ).id;
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ username: `e2e-cxp-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('compra al crédito → deuda en la respuesta; lista, resumen, detalle, vencimiento y anulación', async () => {
    const productId = await product();
    const created = await postReceipt({
      supplierId,
      currency: 'USD',
      paymentTerms: 'CREDIT',
      purchaseDate: '2026-09-15',
      occurredAt: '2026-09-15T15:00:00.000Z',
      lines: [{ productId, quantity: 10, purchaseCost: 500 }],
    }).expect(201);
    expect(created.body.payable).toMatchObject({
      currency: 'USD',
      originalAmount: '500.00',
      issueDate: '2026-09-15',
      dueDate: '2026-10-15',
      dueDateSource: 'DEFAULT_TERM',
    });
    const payableId = created.body.payable.id as string;

    const list = await http()
      .get('/api/v1/payables?status=OPEN')
      .set('Authorization', auth())
      .expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).toContain(payableId);
    const summary = await http()
      .get('/api/v1/payables/summary')
      .set('Authorization', auth())
      .expect(200);
    expect(summary.body.currencies).toEqual([
      expect.objectContaining({ currency: 'USD', openBalance: '500.00' }),
    ]);

    const changed = await http()
      .patch(`/api/v1/payables/${payableId}/due-date`)
      .set('Authorization', auth())
      .send({ dueDate: '2026-10-30', reason: 'Acordado por teléfono' })
      .expect(200);
    expect(changed.body.dueDateChanges).toHaveLength(2);
    await http()
      .patch(`/api/v1/payables/${payableId}/due-date`)
      .set('Authorization', auth())
      .send({ dueDate: '2026-10-30', reason: 'ab' })
      .expect(400);

    await http()
      .post(`/api/v1/payables/${payableId}/void`)
      .set('Authorization', auth())
      .send({ reason: 'Moneda equivocada' })
      .expect(400);
    const key = randomUUID();
    const voided = await http()
      .post(`/api/v1/payables/${payableId}/void`)
      .set('Authorization', auth())
      .set('Idempotency-Key', key)
      .send({ reason: 'Moneda equivocada' })
      .expect(200);
    expect(voided.body.status).toBe('VOIDED');
    await http()
      .post(`/api/v1/payables/${payableId}/void`)
      .set('Authorization', auth())
      .set('Idempotency-Key', key)
      .send({ reason: 'Moneda equivocada' })
      .expect(200);

    // Se registra de nuevo sobre la misma recepción (D22).
    const again = await http()
      .post(`/api/v1/inventory/receipts/${created.body.id}/payable`)
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ currency: 'PEN', amount: 1850 })
      .expect(201);
    expect(again.body).toMatchObject({
      currency: 'PEN',
      amountSource: 'MANUAL',
      issueDate: '2026-09-15',
      dueDate: '2026-10-15',
    });
    const dup = await http()
      .post(`/api/v1/inventory/receipts/${created.body.id}/payable`)
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ currency: 'PEN', amount: 1850 })
      .expect(409);
    expect(dup.body.code).toBe('PAYABLE_ALREADY_EXISTS');
  });

  it('400 en la compra al crédito: línea sin monto y total 0, con su code', async () => {
    const productId = await product();
    const noCost = await postReceipt({
      supplierId,
      currency: 'PEN',
      paymentTerms: 'CREDIT',
      lines: [{ productId, quantity: 1 }],
    }).expect(400);
    expect(noCost.body).toMatchObject({
      code: 'CREDIT_LINE_COST_REQUIRED',
      errors: [{ field: 'lines.0.purchaseCost' }],
    });
    const zero = await postReceipt({
      supplierId,
      currency: 'PEN',
      paymentTerms: 'CREDIT',
      lines: [{ productId, quantity: 1, purchaseCost: 0 }],
    }).expect(400);
    expect(zero.body.code).toBe('CREDIT_TOTAL_MUST_BE_POSITIVE');
  });

  it('pagos: 201 con el saldo; misma clave no duplica; 422 sobrepago con data; anular restituye', async () => {
    const productId = await product();
    const created = await postReceipt({
      supplierId,
      currency: 'USD',
      paymentTerms: 'CREDIT',
      purchaseExchangeRate: 3.7,
      documentRef: 'PAY-' + randomUUID().slice(0, 8),
      lines: [{ productId, quantity: 1, purchaseCost: 100 }],
    }).expect(201);
    const id = created.body.payable.id as string;
    const path = `/api/v1/payables/${id}/payments`;
    const body = {
      paidOn: created.body.purchaseDate,
      paymentCurrency: 'PEN',
      amountPaid: 375,
      exchangeRate: 3.75,
      method: 'YAPE',
    };
    await http().post(path).set('Authorization', auth()).send(body).expect(400);
    const key = randomUUID();
    const paid = await http()
      .post(path)
      .set('Authorization', auth())
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(paid.body).toMatchObject({ status: 'PAID', balance: '0.00', paidAmount: '100.00' });
    await http()
      .post(path)
      .set('Authorization', auth())
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const detail = await http()
      .get(`/api/v1/payables/${id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.payments).toHaveLength(1);
    expect(detail.body.payments[0]).toMatchObject({
      amountPaid: '375.00',
      exchangeRate: '3.7500',
      appliedAmount: '100.00',
      fxDifference: { status: 'CALCULATED', amountPen: '5.00' },
    });
    const over = await http()
      .post(path)
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, amountPaid: 1 })
      .expect(409);
    expect(over.body.code).toBe('PAYABLE_NOT_OPEN');
    const voided = await http()
      .post(`${path}/${detail.body.payments[0].id}/void`)
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'Pago duplicado' })
      .expect(200);
    expect(voided.body).toMatchObject({ balance: '100.00', paidAmount: '0.00' });
    const tooMuch = await http()
      .post(path)
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, amountPaid: 400 })
      .expect(422);
    expect(tooMuch.body).toMatchObject({
      code: 'OVERPAYMENT',
      data: { balance: '100.00', maxAmountPaid: '375.01' },
    });
  });

  it('404 de otro negocio y 401 sin sesión', async () => {
    await http().get(`/api/v1/payables/${randomUUID()}`).set('Authorization', auth()).expect(404);
    await http().get('/api/v1/payables').expect(401);
  });
});
