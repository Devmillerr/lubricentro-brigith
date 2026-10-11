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
 * Contrato HTTP de la recepción atrasada y del posible duplicado (R8, DEC-96):
 * 400 por fecha futura, 409 con `data` y el segundo envío con la resolución.
 * Solo contra una base de prueba (nombre terminado en "_test").
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('POST /api/v1/inventory/receipts: compras atrasadas (R8, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let businessId: string;
  let userId: string;

  const post = (body: unknown, key: string = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1/inventory/receipts')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body as object);

  async function createProduct() {
    const product = await prisma.product.create({
      data: { businessId, name: `E2E R8 ${randomUUID()}`, unit: 'litro' },
    });
    return product.id;
  }

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
      data: { name: `E2E R8 ${suffix}`, slug: `e2e-r8-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R8',
        username: `e2e-r8-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    userId = user.id;
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r8-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('400 VALIDATION_ERROR: fecha de recepción futura', async () => {
    const productId = await createProduct();
    const res = await post({
      occurredAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      lines: [{ productId, quantity: 1 }],
    }).expect(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'occurredAt', message: 'La fecha de recepción no puede ser futura.' }],
    });
  });

  it('409 LATER_STOCK_CHECKS_FOUND con data.products; luego 201 con la resolución', async () => {
    const productId = await createProduct();
    const countRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/counts')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ productId, countedQuantity: 10, occurredAt: '2026-09-20T15:00:00.000Z' })
      .expect(201);

    const body = { occurredAt: '2026-09-15T15:00:00.000Z', lines: [{ productId, quantity: 5 }] };
    const key = randomUUID();
    const conflict = await post(body, key).expect(409);
    expect(conflict.body).toMatchObject({
      status: 409,
      code: 'LATER_STOCK_CHECKS_FOUND',
      data: {
        products: [
          {
            productId,
            balance: '10',
            checks: [{ movementId: countRes.body.id, type: 'COUNT', countedQuantity: '10' }],
          },
        ],
      },
    });

    // La misma clave quedó libre (el 409 no se guarda): un reintento idéntico vuelve a dar 409.
    await post(body, key).expect(409);

    const created = await post({
      ...body,
      laterStockChecks: [{ productId, resolution: 'SET_PHYSICAL', physicalQuantity: 12 }],
    }).expect(201);
    expect(created.body.lines).toHaveLength(1);
    expect(created.body.adjustments).toHaveLength(1);
    expect(created.body.adjustments[0]).toMatchObject({
      type: 'ADJUSTMENT',
      quantityDelta: '-3',
      createdById: userId,
    });
    expect(created.body.lines[0].ledgerSeq).toEqual(expect.any(Number));

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/inventory/receipts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.adjustments).toHaveLength(1);
    expect(detail.body.laterStockResolution).toEqual([
      expect.objectContaining({ productId, resolution: 'SET_PHYSICAL', physicalQuantity: '12' }),
    ]);
  });

  it('400: SET_PHYSICAL sin cantidad o con una resolución inválida', async () => {
    const productId = await createProduct();
    const res = await post({
      lines: [{ productId, quantity: 1 }],
      laterStockChecks: [{ productId, resolution: 'OTRA' }],
    }).expect(400);
    expect(res.body.errors).toEqual([
      expect.objectContaining({ field: 'laterStockChecks.0.resolution' }),
    ]);
  });

  it('409 POSSIBLE_DUPLICATE_RECEIPT con data.receiptId; 201 al confirmar', async () => {
    const productId = await createProduct();
    const body = { occurredAt: '2026-09-15T15:00:00.000Z', lines: [{ productId, quantity: 3 }] };
    const first = await post(body).expect(201);
    const conflict = await post(body).expect(409);
    expect(conflict.body).toMatchObject({
      code: 'POSSIBLE_DUPLICATE_RECEIPT',
      data: { receiptId: first.body.id, occurredAt: '2026-09-15T15:00:00.000Z' },
    });
    const second = await post({ ...body, acknowledgePossibleDuplicate: true }).expect(201);
    expect(second.body.possibleDuplicateAcknowledged).toBe(true);
  });
});
