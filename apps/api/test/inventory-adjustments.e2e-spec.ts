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
 * POST /inventory/adjustments con cantidad física (R3, BR-P7b, 06-API.md §2
 * "Cambios de R3") por HTTP, con la app montada como en main.ts. Crea
 * negocios, usuarios y productos desechables, así que solo corre contra una
 * base de prueba (nombre terminado en "_test").
 *
 * El rate limit global es de 20 peticiones por minuto por endpoint y la app
 * se monta una sola vez: este archivo hace menos de 20 POST a adjustments y
 * menos de 20 a counts.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('POST /api/v1/inventory/adjustments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let businessId: string;
  let userId: string;
  let otherBusinessProductId: string;

  const post = (path: string, body: unknown, key: string | null = randomUUID()) => {
    const req = request(app.getHttpServer())
      .post(`/api/v1/inventory/${path}`)
      .set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };
  const adjust = (body: unknown, key?: string | null) => post('adjustments', body, key);

  async function createProduct(counted?: number, extra: { isActive?: boolean } = {}) {
    const product = await prisma.product.create({
      data: { businessId, name: `E2E ${randomUUID()}`, unit: 'unidad', ...extra },
    });
    if (counted !== undefined) {
      await post('counts', { productId: product.id, countedQuantity: counted }).expect(201);
    }
    return product.id;
  }

  async function stockOf(productId: string) {
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
    const movements = await prisma.inventoryMovement.count({ where: { productId } });
    return { balance: Number(product.stockQuantity), isCounted: product.isCounted, movements };
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
      data: { name: `E2E R3 ajuste ${suffix}`, slug: `e2e-r3-ajuste-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R3 ajuste',
        username: `e2e-r3-ajuste-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    userId = user.id;

    const other = await prisma.business.create({
      data: { name: `E2E R3 ajuste otro ${suffix}`, slug: `e2e-r3-ajuste-otro-${suffix}` },
    });
    const otherProduct = await prisma.product.create({
      data: { businessId: other.id, name: `E2E ${randomUUID()}`, unit: 'unidad' },
    });
    otherBusinessProductId = otherProduct.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r3-ajuste-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('201: calcula la diferencia contra el saldo y devuelve el movimiento ADJUSTMENT', async () => {
    const productId = await createProduct(10);

    const res = await adjust({
      productId,
      physicalQuantity: 7.5,
      reason: 'Producto dañado',
    }).expect(201);

    expect(res.body).toMatchObject({
      businessId,
      productId,
      type: 'ADJUSTMENT',
      previousBalance: '10',
      quantityDelta: '-2.5',
      resultingBalance: '7.5',
      countedQuantity: '7.5',
      reason: 'Producto dañado',
      createdById: userId,
    });
    expect(typeof res.body.occurredAt).toBe('string');
    expect(await stockOf(productId)).toEqual({ balance: 7.5, isCounted: true, movements: 2 });
  });

  it('puede llevar el saldo a 0 y subirlo', async () => {
    const productId = await createProduct(3);

    await adjust({ productId, physicalQuantity: 0, reason: 'Consumo interno' }).expect(201);
    const up = await adjust({ productId, physicalQuantity: 4, reason: 'Otro' }).expect(201);

    expect(up.body.quantityDelta).toBe('4');
    expect((await stockOf(productId)).balance).toBe(4);
  });

  it('sin conteo inicial: 409 ADJUSTMENT_REQUIRES_COUNT y no marca isCounted', async () => {
    const productId = await createProduct();

    const res = await adjust({ productId, physicalQuantity: 5, reason: 'Otro' }).expect(409);

    expect(res.body.code).toBe('ADJUSTMENT_REQUIRES_COUNT');
    expect(await stockOf(productId)).toEqual({ balance: 0, isCounted: false, movements: 0 });
  });

  it('igual al saldo: 400 NO_DIFFERENCE y no escribe', async () => {
    const productId = await createProduct(6);

    const res = await adjust({ productId, physicalQuantity: 6, reason: 'Otro' }).expect(400);

    expect(res.body.code).toBe('NO_DIFFERENCE');
    expect(await stockOf(productId)).toEqual({ balance: 6, isCounted: true, movements: 1 });
  });

  it('producto inactivo: 409 PRODUCT_INACTIVE y no escribe', async () => {
    const productId = await createProduct(6);
    await prisma.product.update({ where: { id: productId }, data: { isActive: false } });

    const res = await adjust({ productId, physicalQuantity: 2, reason: 'Otro' }).expect(409);

    expect(res.body.code).toBe('PRODUCT_INACTIVE');
    expect(await stockOf(productId)).toEqual({ balance: 6, isCounted: true, movements: 1 });
  });

  it('producto inexistente o de otro negocio: 404 PRODUCT_NOT_FOUND', async () => {
    const missing = await adjust({
      productId: randomUUID(),
      physicalQuantity: 1,
      reason: 'Otro',
    }).expect(404);
    const foreign = await adjust({
      productId: otherBusinessProductId,
      physicalQuantity: 1,
      reason: 'Otro',
    }).expect(404);

    expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');
    expect(foreign.body.code).toBe('PRODUCT_NOT_FOUND');
    expect(await stockOf(otherBusinessProductId)).toEqual({
      balance: 0,
      isCounted: false,
      movements: 0,
    });
  });

  it('validación: cantidad negativa y motivo vacío dan 400 con el mensaje en español', async () => {
    const productId = await createProduct(5);

    const res = await adjust({ productId, physicalQuantity: -1, reason: '   ' }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toContainEqual({
      field: 'physicalQuantity',
      message: 'La cantidad física no puede ser negativa.',
    });
    expect(res.body.errors).toContainEqual({
      field: 'reason',
      message: 'El motivo del ajuste es obligatorio.',
    });
    expect((await stockOf(productId)).movements).toBe(1);
  });

  it('el contrato anterior ({ quantityDelta }) ya no se acepta: 400', async () => {
    const productId = await createProduct(5);

    const res = await adjust({ productId, quantityDelta: -1, reason: 'Merma' }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect((await stockOf(productId)).balance).toBe(5);
  });

  it('idempotencia: la misma clave devuelve el mismo movimiento sin repetir el ajuste', async () => {
    const productId = await createProduct(10);
    const key = randomUUID();
    const body = { productId, physicalQuantity: 8, reason: 'Conteo físico distinto' };

    const first = await adjust(body, key).expect(201);
    const replay = await adjust(body, key).expect(201);

    expect(replay.body.id).toBe(first.body.id);
    expect(await stockOf(productId)).toEqual({ balance: 8, isCounted: true, movements: 2 });
  });

  it('sin Idempotency-Key: 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const res = await adjust(
      { productId: randomUUID(), physicalQuantity: 1, reason: 'Otro' },
      null,
    ).expect(400);

    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('sin sesión: 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Idempotency-Key', randomUUID())
      .send({ productId: randomUUID(), physicalQuantity: 1, reason: 'Otro' })
      .expect(401);
  });
});
