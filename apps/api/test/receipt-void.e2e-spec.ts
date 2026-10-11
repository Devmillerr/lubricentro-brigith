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
 * Contrato HTTP de la anulación de recepciones (R8, DEC-97): idempotencia,
 * 200 con los PURCHASE_VOID y la forma de los 409. Solo contra una base de
 * prueba (nombre terminado en "_test").
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('POST /api/v1/inventory/receipts/:id/void (R8, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let businessId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => `Bearer ${token}`;

  async function receiptWith(quantity: number) {
    const product = await prisma.product.create({
      data: { businessId, name: `E2E Void ${randomUUID()}`, unit: 'litro' },
    });
    const res = await http()
      .post('/api/v1/inventory/receipts')
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ lines: [{ productId: product.id, quantity }] })
      .expect(201);
    return { productId: product.id, receiptId: res.body.id as string };
  }

  const voidIt = (id: string, body: unknown, key: string | null = randomUUID()) => {
    const req = http().post(`/api/v1/inventory/receipts/${id}/void`).set('Authorization', auth());
    if (key) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };

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
      data: { name: `E2E Void ${suffix}`, slug: `e2e-void-${suffix}` },
    });
    await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E Void',
        username: `e2e-void-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ username: `e2e-void-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 con voids; la misma clave devuelve lo mismo; otra clave: 409 RECEIPT_ALREADY_VOIDED', async () => {
    const { receiptId } = await receiptWith(3);
    const key = randomUUID();
    const first = await voidIt(receiptId, { reason: 'Registrada por error' }, key).expect(200);
    expect(first.body).toMatchObject({ id: receiptId, voidReason: 'Registrada por error' });
    expect(first.body.voids).toHaveLength(1);
    expect(first.body.voids[0]).toMatchObject({ type: 'PURCHASE_VOID', quantityDelta: '-3' });

    const replay = await voidIt(receiptId, { reason: 'Registrada por error' }, key).expect(200);
    expect(replay.body.voidedAt).toBe(first.body.voidedAt);

    const reused = await voidIt(receiptId, { reason: 'Otro motivo' }, key).expect(409);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const again = await voidIt(receiptId, { reason: 'Registrada por error' }).expect(409);
    expect(again.body.code).toBe('RECEIPT_ALREADY_VOIDED');
  });

  it('400 sin clave o sin motivo; 409 con data.movements si hubo una venta después', async () => {
    const { receiptId, productId } = await receiptWith(5);
    await voidIt(receiptId, { reason: 'Motivo válido' }, null).expect(400);
    const noReason = await voidIt(receiptId, {}).expect(400);
    expect(noReason.body.code).toBe('VALIDATION_ERROR');

    await http()
      .post('/api/v1/inventory/counts')
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ productId, countedQuantity: 4 })
      .expect(201);
    const blocked = await voidIt(receiptId, { reason: 'Motivo válido' }).expect(409);
    expect(blocked.body).toMatchObject({
      code: 'RECEIPT_HAS_LATER_MOVEMENTS',
      data: { movements: [{ productId, type: 'COUNT' }] },
    });
  });
});
