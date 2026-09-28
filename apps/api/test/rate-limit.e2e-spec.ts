import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { applyGlobalPrefix } from '../src/common/openapi/openapi-document';
import { validationExceptionFactory } from '../src/common/validation-exception-factory';
import type { Env } from '../src/config/env.validation';
import { RATE_LIMITS } from '../src/rate-limit/rate-limit.constants';

/**
 * 429 del rate limit (DEC-86, R7, B-166) con la app completa montada como en
 * main.ts: `Retry-After` en segundos y cuerpo en el formato de error de la
 * API con `code: "RATE_LIMITED"`. App nueva por prueba: el contador vive en
 * memoria. No escribe datos, pero `/health` y el login consultan la base, así
 * que solo corre contra una base de prueba (nombre terminado en "_test").
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('Rate limit 429 (e2e)', () => {
  let app: INestApplication;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    await app.close();
  });

  function expectRateLimited(res: request.Response, instance: string): void {
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Demasiadas solicitudes',
      status: 429,
      code: 'RATE_LIMITED',
      instance,
    });
    expect(typeof res.body.detail).toBe('string');
  }

  it(`GET autenticado: ${RATE_LIMITS.read} por usuario; el siguiente es 429 con Retry-After`, async () => {
    const config = app.get(ConfigService<Env, true>);
    const token = await app
      .get(JwtService)
      .signAsync(
        { sub: randomUUID(), businessId: randomUUID(), role: 'OWNER' },
        { secret: config.get('JWT_ACCESS_SECRET', { infer: true }), expiresIn: '5m' },
      );
    const health = () => request(server()).get('/health').set('Authorization', `Bearer ${token}`);

    for (let i = 0; i < RATE_LIMITS.read; i += 1) await health().expect(200);

    expectRateLimited(await health(), '/health');
    // Sin token cuenta por IP, con su propia cuota.
    await request(server()).get('/health').expect(200);
  });

  it(`login: el intento ${RATE_LIMITS.loginIp + 1} desde la misma IP es 429 con Retry-After`, async () => {
    const login = () =>
      request(server())
        .post('/api/v1/auth/login')
        .send({ username: `no-existe-${randomUUID()}`, password: 'incorrecta' });

    for (let i = 0; i < RATE_LIMITS.loginIp; i += 1) await login().expect(401);

    expectRateLimited(await login(), '/api/v1/auth/login');
  });
});
