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
 * Unidad de producto (DEC-92), formas de venta (DEC-91) y monto pagado en
 * recepciones (DEC-90) por HTTP, con la app montada como en main.ts. Prueba
 * lo que depende de la capa HTTP: validación de DTOs, rutas nuevas (incluido
 * que `receipts/summary` no choque con `receipts/:id`) y la forma de las
 * respuestas. Solo corre contra una base de prueba (nombre terminado en
 * "_test"). Menos de 30 escrituras: no llega al rate limit.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('Unidades, formas de venta y monto de recepciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

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
      data: { name: `E2E DEC-91 ${suffix}`, slug: `e2e-dec91-${suffix}` },
    });
    await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E DEC-91',
        username: `e2e-dec91-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-dec91-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /products rechaza una unidad sin letras ("0") y acepta "galón"', async () => {
    const bad = await auth(request(server()).post('/api/v1/products'))
      .send({ name: 'Aceite 15W40', unit: '0' })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    expect(bad.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'unit' })]),
    );

    const ok = await auth(request(server()).post('/api/v1/products'))
      .send({ name: 'Aceite 15W40', unit: 'galón' })
      .expect(201);
    expect(ok.body).toMatchObject({ unit: 'galón', saleUnits: [] });
  });

  it('PATCH /products/:id no exige corregir la unidad si no se envía', async () => {
    const legacy = await prisma.product.create({
      data: { businessId: (await businessOfToken()).id, name: 'Antiguo', unit: '0' },
    });
    const res = await auth(request(server()).patch(`/api/v1/products/${legacy.id}`))
      .send({ salePrice: 12 })
      .expect(200);
    expect(res.body).toMatchObject({ unit: '0', salePrice: '12' });

    await auth(request(server()).patch(`/api/v1/products/${legacy.id}`))
      .send({ unit: '5' })
      .expect(400);
  });

  it('PUT /products/:id/sale-units configura formas con precio y las devuelve en GET /products', async () => {
    const created = await auth(request(server()).post('/api/v1/products'))
      .send({ name: `Aceite a granel ${randomUUID()}`, unit: 'galón' })
      .expect(201);

    const invalid = await auth(
      request(server()).put(`/api/v1/products/${created.body.id}/sale-units`),
    )
      .send({ units: [{ label: 'Octavo', factor: 0 }] })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    const res = await auth(request(server()).put(`/api/v1/products/${created.body.id}/sale-units`))
      .send({
        units: [
          { label: 'Octavo', factor: 0.125, salePrice: 6 },
          { label: 'Balde', factor: 5, salePrice: 180 },
        ],
      })
      .expect(200);
    expect(res.body.saleUnits).toEqual([
      expect.objectContaining({ label: 'Octavo', factor: '0.125', salePrice: '6' }),
      expect.objectContaining({ label: 'Balde', factor: '5', salePrice: '180' }),
    ]);

    const list = await auth(request(server()).get('/api/v1/products'))
      .query({ search: 'Aceite a granel' })
      .expect(200);
    const listed = list.body.items.find((item: { id: string }) => item.id === created.body.id);
    expect(listed.saleUnits).toHaveLength(2);
  });

  it('POST /sales con saleUnitId descuenta cantidad × equivalencia y devuelve la forma', async () => {
    const created = await auth(request(server()).post('/api/v1/products'))
      .send({ name: `Aceite 25W60 ${randomUUID()}`, unit: 'galón' })
      .expect(201);
    const productId = created.body.id as string;
    await auth(request(server()).post('/api/v1/inventory/counts'))
      .set('Idempotency-Key', randomUUID())
      .send({ productId, countedQuantity: 5 })
      .expect(201);
    const units = await auth(request(server()).put(`/api/v1/products/${productId}/sale-units`))
      .send({ units: [{ label: 'Cuarto', factor: 0.25, salePrice: 11 }] })
      .expect(200);
    const cuarto = units.body.saleUnits[0].id as string;

    const sale = await auth(request(server()).post('/api/v1/sales'))
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethod: 'CASH',
        lines: [{ productId, saleUnitId: cuarto, quantity: 2, unitPrice: 11 }],
      })
      .expect(201);
    expect(sale.body.total).toBe('22');
    expect(sale.body.lines[0]).toMatchObject({
      saleUnitId: cuarto,
      saleUnitLabel: 'Cuarto',
      saleUnitFactor: '0.25',
      quantity: '2',
    });

    const stock = await auth(request(server()).get('/api/v1/inventory/stock'))
      .query({ productId })
      .expect(200);
    expect(stock.body.balance).toBe(4.5);
  });

  it('POST /inventory/receipts acepta purchaseCost por línea y GET receipts/summary suma el mes', async () => {
    const created = await auth(request(server()).post('/api/v1/products'))
      .send({ name: `Filtro ${randomUUID()}`, unit: 'unidad' })
      .expect(201);

    await auth(request(server()).post('/api/v1/inventory/receipts'))
      .set('Idempotency-Key', randomUUID())
      .send({ lines: [{ productId: created.body.id, quantity: 2, purchaseCost: -1 }] })
      .expect(400);

    const receipt = await auth(request(server()).post('/api/v1/inventory/receipts'))
      .set('Idempotency-Key', randomUUID())
      .send({
        occurredAt: '2026-08-10T15:00:00.000Z',
        lines: [{ productId: created.body.id, quantity: 2, purchaseCost: 45.5 }],
      })
      .expect(201);
    expect(receipt.body).toMatchObject({ totalCost: '45.5' });
    expect(receipt.body.lines[0]).toMatchObject({ purchaseCost: '45.5', quantityDelta: '2' });

    const summary = await auth(request(server()).get('/api/v1/inventory/receipts/summary'))
      .query({ month: '2026-08' })
      .expect(200);
    expect(summary.body).toMatchObject({
      month: '2026-08',
      receiptCount: 1,
      totalCost: '45.50',
      receiptsWithoutCost: 0,
      linesWithoutCost: 0,
    });

    await auth(request(server()).get('/api/v1/inventory/receipts/summary'))
      .query({ month: '2026-13' })
      .expect(400);
  });

  async function businessOfToken() {
    const me = await auth(request(server()).get('/api/v1/auth/me')).expect(200);
    return { id: (me.body.businessId ?? me.body.business?.id) as string };
  }
});
