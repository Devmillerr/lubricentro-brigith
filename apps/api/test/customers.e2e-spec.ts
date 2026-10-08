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
 * Reintento de `POST /api/v1/customers` con el mismo id (doble toque, red que
 * se cortó) por HTTP y contra Postgres real: el P2002 de la clave primaria no
 * debe terminar en 500. Crea negocios y usuarios desechables, así que solo
 * corre contra una base de prueba (nombre terminado en "_test").
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('Clientes /api/v1/customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const post = (bearer: string, body: unknown) =>
    request(server())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${bearer}`)
      .send(body as object);

  async function createOwner(label: string): Promise<string> {
    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E clientes ${label} ${suffix}`, slug: `e2e-clientes-${label}-${suffix}` },
    });
    const username = `e2e-clientes-${label}-${suffix}`;
    await prisma.user.create({
      data: {
        businessId: business.id,
        name: `E2E clientes ${label}`,
        username,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username, password })
      .expect(200);
    return login.body.accessToken as string;
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

    token = await createOwner('a');
    otherToken = await createOwner('b');
  });

  afterAll(async () => {
    await app.close();
  });

  it('reintento con el mismo id y los mismos datos: 201 con el mismo cliente, sin duplicar', async () => {
    const id = randomUUID();
    const body = { id, name: 'Ana Reintento' };

    const first = await post(token, body).expect(201);
    const retry = await post(token, body).expect(201);

    expect(retry.body).toEqual(first.body);
    expect(await prisma.customer.count({ where: { id } })).toBe(1);
  });

  it('mismo id con otros datos: 409 CUSTOMER_ID_CONFLICT y no cambia el guardado', async () => {
    const id = randomUUID();
    await post(token, { id, name: 'Ana', phone: '987654321' }).expect(201);

    const res = await post(token, { id, name: 'Ana', phone: '111222333' }).expect(409);

    expect(res.body).toMatchObject({ status: 409, code: 'CUSTOMER_ID_CONFLICT' });
    const stored = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(stored.phone).toBe('987654321');
  });

  it('id de un cliente de otro negocio: 409 sin revelar sus datos', async () => {
    const id = randomUUID();
    await post(token, { id, name: 'Cliente ajeno' }).expect(201);

    const res = await post(otherToken, { id, name: 'Cliente ajeno' }).expect(409);

    expect(res.body).toMatchObject({ code: 'CUSTOMER_ID_CONFLICT' });
    expect(JSON.stringify(res.body)).not.toContain('Cliente ajeno');
  });

  it('sin id, dos envíos iguales crean dos clientes (comportamiento normal intacto)', async () => {
    const name = `Sin id ${randomUUID().slice(0, 8)}`;

    const a = await post(token, { name }).expect(201);
    const b = await post(token, { name }).expect(201);

    expect(a.body.id).not.toBe(b.body.id);
  });

  it('las validaciones siguen igual: sin nombre ni teléfono, 400 VALIDATION_ERROR', async () => {
    const res = await post(token, { id: randomUUID(), notes: 'solo nota' }).expect(400);

    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
