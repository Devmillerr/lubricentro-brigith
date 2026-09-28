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
 * `GET /dashboard` (R7, B-160) por HTTP, con la app montada como en main.ts:
 * forma de la respuesta, validación de `period`/`date` y autenticación. Las
 * cifras se prueban contra Postgres en `test/integration/dashboard.int-spec.ts`.
 * Crea un negocio y un usuario desechables: solo corre contra una base de
 * prueba (nombre terminado en "_test").
 *
 * El rate limit global actual es de 20 peticiones por minuto por endpoint:
 * este archivo hace menos de 20 a `/dashboard`.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('Dashboard /api/v1/dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const get = (query = '') =>
    request(server()).get(`/api/v1/dashboard${query}`).set('Authorization', `Bearer ${token}`);

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
      data: { name: `E2E R7 dashboard ${suffix}`, slug: `e2e-r7-dashboard-${suffix}` },
    });
    await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R7 dashboard',
        username: `e2e-r7-dashboard-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r7-dashboard-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 sin token', async () => {
    const res = await request(server()).get('/api/v1/dashboard').expect(401);
    expect(res.body.status).toBe(401);
  });

  it('200 sin parámetros: hoy en la zona del negocio, con la forma del contrato', async () => {
    const res = await get().expect(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'maintenances',
      'period',
      'series',
      'totals',
      'washes',
    ]);
    expect(res.body.period.kind).toBe('today');
    expect(res.body.period.timezone).toBe('America/Lima');
    expect(res.body.period.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.series).toHaveLength(24);
  });

  it('200 week con date: rango de lunes a lunes y montos como string', async () => {
    const res = await get('?period=week&date=2026-10-01').expect(200);
    expect(res.body.period).toEqual({
      kind: 'week',
      date: '2026-10-01',
      from: '2026-09-28T05:00:00.000Z',
      to: '2026-10-05T05:00:00.000Z',
      timezone: 'America/Lima',
    });
    expect(res.body.totals).toEqual({
      total: '0',
      cash: '0',
      yape: '0',
      salesCount: 0,
      bySource: { counter: '0', wash: '0', maintenance: '0' },
    });
    expect(res.body.washes).toEqual({ count: 0, amount: '0', byType: [] });
    expect(res.body.maintenances).toEqual({ count: 0, charged: 0, uncharged: 0 });
    expect(res.body.series).toHaveLength(7);
    expect(Object.keys(res.body.series[0]).sort()).toEqual([
      'bucket',
      'counter',
      'maintenance',
      'wash',
    ]);
  });

  it('200 month', async () => {
    const res = await get('?period=month&date=2026-02-10').expect(200);
    expect(res.body.period.from).toBe('2026-02-01T05:00:00.000Z');
    expect(res.body.series).toHaveLength(28);
  });

  it.each([
    ['?period=year', 'period'],
    ['?period=', 'period'],
    ['?date=2026-9-1', 'date'],
    ['?date=28-09-2026', 'date'],
    ['?date=2026-02-30', 'date'],
    ['?period=today&date=2026-13-01', 'date'],
  ])('400 VALIDATION_ERROR con %s', async (query, field) => {
    const res = await get(query).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it('400 con un parámetro desconocido (whitelist estricta)', async () => {
    const res = await get('?period=today&from=2026-01-01').expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
