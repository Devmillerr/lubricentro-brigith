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
 * GET /inventory/alerts (R3, BR-P19, DEC-50) por HTTP, con la app montada
 * como en main.ts. Crea negocios, usuarios y productos desechables, así que
 * solo corre contra una base de prueba (nombre terminado en "_test"). Los
 * productos se crean con la caché ya puesta: el cálculo de la caché con
 * movimientos reales se prueba en test/integration/inventory-alerts.int-spec.ts.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('GET /api/v1/inventory/alerts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let businessId: string;
  let otherBusinessId: string;

  const getAlerts = () =>
    request(app.getHttpServer())
      .get('/api/v1/inventory/alerts')
      .set('Authorization', `Bearer ${token}`);

  async function createProduct(
    owner: string,
    name: string,
    stockQuantity: number,
    isCounted: boolean,
    isActive = true,
    tracksStock = true,
  ) {
    const product = await prisma.product.create({
      data: {
        businessId: owner,
        name,
        unit: 'unidad',
        stockQuantity,
        isCounted,
        isActive,
        tracksStock,
      },
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
      data: { name: `E2E R3 alertas ${suffix}`, slug: `e2e-r3-alertas-${suffix}` },
    });
    await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R3 alertas',
        username: `e2e-r3-alertas-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;

    const other = await prisma.business.create({
      data: { name: `E2E R3 alertas otro ${suffix}`, slug: `e2e-r3-alertas-otro-${suffix}` },
    });
    otherBusinessId = other.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r3-alertas-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 sin productos: listas vacías y notCountedCount 0', async () => {
    const res = await getAlerts().expect(200);

    expect(res.body).toEqual({ outOfStock: [], negative: [], notCountedCount: 0 });
  });

  it('200: agotados y negativos con conteo, por nombre; el resto no aparece', async () => {
    const zeta = await createProduct(businessId, 'Zeta agotado', 0, true);
    const alfa = await createProduct(businessId, 'Alfa agotado', 0, true);
    const negative = await createProduct(businessId, 'Negativo', -1.5, true);
    await createProduct(businessId, 'Con saldo', 3, true);
    await createProduct(businessId, 'Sin conteo en cero', 0, false);
    await createProduct(businessId, 'Sin conteo negativo', -2, false);
    await createProduct(businessId, 'Inactivo agotado', 0, true, false);
    await createProduct(businessId, 'Inactivo sin conteo', 0, false, false);
    await createProduct(businessId, 'No controla stock', 0, false, true, false);
    await createProduct(otherBusinessId, 'Ajeno agotado', 0, true);
    await createProduct(otherBusinessId, 'Ajeno sin conteo', 0, false);

    const res = await getAlerts().expect(200);

    expect(Object.keys(res.body).sort()).toEqual(['negative', 'notCountedCount', 'outOfStock']);
    expect(res.body.outOfStock).toEqual([
      { productId: alfa, name: 'Alfa agotado', unit: 'unidad', balance: 0 },
      { productId: zeta, name: 'Zeta agotado', unit: 'unidad', balance: 0 },
    ]);
    expect(res.body.negative).toEqual([
      { productId: negative, name: 'Negativo', unit: 'unidad', balance: -1.5 },
    ]);
    expect(res.body.notCountedCount).toBe(2);
  });

  it('sin sesión: 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/inventory/alerts').expect(401);
  });
});
