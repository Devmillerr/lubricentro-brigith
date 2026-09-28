import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { applyGlobalPrefix } from '../src/common/openapi/openapi-document';
import { validationExceptionFactory } from '../src/common/validation-exception-factory';
import { MaintenancesService } from '../src/maintenances/maintenances.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Cobro de mantenimiento y anulación con motivo (R6, B-153/B-154) por HTTP,
 * con la app montada como en main.ts (prefijo, ValidationPipe y filtro de
 * errores). Crea un negocio desechable, así que solo corre contra una base de
 * prueba (nombre terminado en "_test"). Menos de 20 peticiones por ruta (rate
 * limit global); los mantenimientos de fixture se crean con el servicio.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('Mantenimientos: cobro y anulación /api/v1/maintenances (e2e, R6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let maintenances: MaintenancesService;
  let token: string;
  let businessId: string;
  let userId: string;
  let vehicleId: string;
  let maintenanceTypeId: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const post = (path: string, body: unknown, key: string | null = randomUUID()) => {
    const req = auth(request(server()).post(`/api/v1${path}`));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };

  async function fixtureMaintenance() {
    const { maintenance } = await maintenances.create(businessId, userId, {
      vehicleId,
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
    });
    return maintenance.id;
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
    maintenances = app.get(MaintenancesService);

    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E R6 ${suffix}`, slug: `e2e-r6-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R6',
        username: `e2e-r6-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        businessId: business.id,
        createdById: user.id,
        plate: 'E2E-R6',
        plateNormalized: 'E2ER6',
      },
    });
    const type = await prisma.maintenanceType.create({
      data: { businessId: business.id, name: 'Cambio de aceite' },
    });
    businessId = business.id;
    userId = user.id;
    vehicleId = vehicle.id;
    maintenanceTypeId = type.id;

    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r6-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /maintenances con charge: 201 con la venta MAINTENANCE en `sale`', async () => {
    const res = await post('/maintenances', {
      vehicleId,
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
      charge: { paymentMethod: 'YAPE', totalAmount: 70.25 },
    }).expect(201);

    expect(res.body.sale).toMatchObject({
      source: 'MAINTENANCE',
      status: 'ACTIVE',
      paymentMethod: 'YAPE',
      total: '70.25',
      maintenanceId: res.body.maintenance.id,
      vehicleId,
    });
    expect(res.body.sale.lines).toEqual([
      expect.objectContaining({ kind: 'SERVICE', movesStock: false, productId: null }),
    ]);
  });

  it('POST /maintenances sin charge: `sale` es null', async () => {
    const res = await post('/maintenances', {
      vehicleId,
      maintenanceTypeId,
      performedAt: new Date().toISOString(),
    }).expect(201);

    expect(res.body.sale).toBeNull();
  });

  it('POST /maintenances/:id/charge: 201 SaleResponse; la misma clave repite la venta', async () => {
    const id = await fixtureMaintenance();
    const key = randomUUID();
    const body = { paymentMethod: 'CASH', totalAmount: 50 };

    const first = await post(`/maintenances/${id}/charge`, body, key).expect(201);
    const replay = await post(`/maintenances/${id}/charge`, body, key).expect(201);

    expect(first.body).toMatchObject({ source: 'MAINTENANCE', maintenanceId: id, total: '50' });
    expect(replay.body.id).toBe(first.body.id);
  });

  it('POST /maintenances/:id/charge: 409 si ya está cobrado, 404 si no existe, 400 sin clave o con monto inválido', async () => {
    const id = await fixtureMaintenance();
    await post(`/maintenances/${id}/charge`, { paymentMethod: 'CASH', totalAmount: 10 }).expect(
      201,
    );

    const again = await post(`/maintenances/${id}/charge`, {
      paymentMethod: 'CASH',
      totalAmount: 10,
    }).expect(409);
    expect(again.body.code).toBe('MAINTENANCE_ALREADY_CHARGED');

    const missing = await post(`/maintenances/${randomUUID()}/charge`, {
      paymentMethod: 'CASH',
      totalAmount: 10,
    }).expect(404);
    expect(missing.body.code).toBe('MAINTENANCE_NOT_FOUND');

    const noKey = await post(
      `/maintenances/${id}/charge`,
      { paymentMethod: 'CASH', totalAmount: 10 },
      null,
    ).expect(400);
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const invalid = await post(`/maintenances/${id}/charge`, {
      paymentMethod: 'CASH',
      totalAmount: 0,
    }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /maintenances/:id/void sin motivo: 400 VALIDATION_ERROR; con motivo: 200 y anula la venta', async () => {
    const id = await fixtureMaintenance();
    await post(`/maintenances/${id}/charge`, { paymentMethod: 'CASH', totalAmount: 30 }).expect(
      201,
    );

    const noReason = await post(`/maintenances/${id}/void`, {}).expect(400);
    expect(noReason.body.code).toBe('VALIDATION_ERROR');
    const blank = await post(`/maintenances/${id}/void`, { reason: '   ' }).expect(400);
    expect(blank.body.code).toBe('VALIDATION_ERROR');

    const voided = await post(`/maintenances/${id}/void`, { reason: 'Registro duplicado' }).expect(
      200,
    );
    expect(voided.body.maintenance).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Registro duplicado',
    });
    expect(voided.body.sale).toMatchObject({ status: 'VOIDED', voidReason: 'Registro duplicado' });
    const sale = await prisma.sale.findFirstOrThrow({ where: { maintenanceId: id } });
    expect(sale).toMatchObject({ status: 'VOIDED', voidReason: 'Registro duplicado' });

    const recharge = await post(`/maintenances/${id}/charge`, {
      paymentMethod: 'CASH',
      totalAmount: 30,
    }).expect(409);
    expect(recharge.body.code).toBe('MAINTENANCE_VOIDED');
  });

  it('POST /sales/:id/void de una venta MAINTENANCE: 409 SALE_MANAGED_BY_MAINTENANCE (B-155)', async () => {
    const id = await fixtureMaintenance();
    const charged = await post(`/maintenances/${id}/charge`, {
      paymentMethod: 'YAPE',
      totalAmount: 40,
    }).expect(201);

    const res = await post(`/sales/${charged.body.id}/void`, { reason: 'desde ventas' }).expect(
      409,
    );
    expect(res.body.code).toBe('SALE_MANAGED_BY_MAINTENANCE');
    const sale = await prisma.sale.findFirstOrThrow({ where: { id: charged.body.id } });
    expect(sale.status).toBe('ACTIVE');
  });

  it('GET /maintenances/:id y GET /vehicles/:id/maintenances exponen `sale` o null (B-156)', async () => {
    const chargedId = await fixtureMaintenance();
    const unchargedId = await fixtureMaintenance();
    const charged = await post(`/maintenances/${chargedId}/charge`, {
      paymentMethod: 'CASH',
      totalAmount: 60,
    }).expect(201);

    const detail = await auth(request(server()).get(`/api/v1/maintenances/${chargedId}`)).expect(
      200,
    );
    expect(detail.body.sale).toMatchObject({ id: charged.body.id, total: '60' });
    const plain = await auth(request(server()).get(`/api/v1/maintenances/${unchargedId}`)).expect(
      200,
    );
    expect(plain.body.sale).toBeNull();

    const history = await auth(
      request(server()).get(`/api/v1/vehicles/${vehicleId}/maintenances`),
    ).expect(200);
    const byId = new Map(
      (history.body as { id: string; sale: { id: string } | null }[]).map((m) => [m.id, m]),
    );
    expect(byId.get(chargedId)!.sale?.id).toBe(charged.body.id);
    expect(byId.get(unchargedId)!.sale).toBeNull();
  });
});
