import {
  Controller,
  Get,
  HttpStatus,
  type INestApplication,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../../src/auth/auth.module';
import { AuthService } from '../../src/auth/auth.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { ProblemException } from '../../src/common/exceptions/problem.exception';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter';
import { RATE_LIMITS } from '../../src/rate-limit/rate-limit.constants';
import { RateLimitModule } from '../../src/rate-limit/rate-limit.module';

/**
 * Rate limit de DEC-86 (R7, B-166) por HTTP: el módulo real (guard global,
 * almacenamiento en memoria, JWT real), el `AuthController` real con sus
 * límites propios y el filtro de errores de la API. `AuthService` es falso
 * (todo login da 401), así que no necesita Postgres. App nueva por prueba:
 * el contador vive en memoria.
 */
const SECRET = 'secreto-de-prueba-de-integracion';

@Controller('probe')
@UseGuards(JwtAuthGuard)
class ProbeController {
  @Get('a')
  a() {
    return { ok: true };
  }

  @Get('b')
  b() {
    return { ok: true };
  }

  @Post('a')
  createA() {
    return { ok: true };
  }

  @Patch('b')
  updateB() {
    return { ok: true };
  }
}

const invalidCredentials = () => {
  throw new ProblemException({
    status: HttpStatus.UNAUTHORIZED,
    code: 'INVALID_CREDENTIALS',
    title: 'Usuario o contraseña incorrectos',
  });
};

describe('Rate limit DEC-86 (integración HTTP)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const get = (path: string, token: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${token}`);
  const post = (path: string, token: string) =>
    request(server()).post(path).set('Authorization', `Bearer ${token}`).send({});
  const patch = (path: string, token: string) =>
    request(server()).patch(path).set('Authorization', `Bearer ${token}`).send({});
  const login = (username: string) =>
    request(server()).post('/auth/login').send({ username, password: 'incorrecta' });

  function expectRateLimited(res: request.Response, instance: string): void {
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Demasiadas solicitudes',
      status: 429,
      detail: expect.any(String),
      code: 'RATE_LIMITED',
      instance,
    });
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: SECRET })],
        }),
        AuthModule,
        RateLimitModule,
      ],
      controllers: [ProbeController],
    })
      .overrideProvider(AuthService)
      .useValue({ login: invalidCredentials, refresh: invalidCredentials })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    const jwt = app.get(JwtService);
    const sign = (sub: string) =>
      jwt.signAsync(
        { sub, businessId: 'negocio', role: 'OWNER' },
        { secret: SECRET, expiresIn: '5m' },
      );
    tokenA = await sign('usuario-a');
    tokenB = await sign('usuario-b');
  });

  afterEach(async () => {
    await app.close();
  });

  it(`GET llega a ${RATE_LIMITS.read} por usuario, sumando endpoints, y el siguiente es 429`, async () => {
    for (let i = 0; i < RATE_LIMITS.read; i += 1) {
      await get(i % 2 ? '/probe/a' : '/probe/b', tokenA).expect(200);
    }

    expectRateLimited(await get('/probe/a', tokenA), '/probe/a');
    expectRateLimited(await get('/probe/b', tokenA), '/probe/b');
    // Las escrituras tienen su propia cuota.
    await post('/probe/a', tokenA).expect(201);
  });

  it(`POST/PATCH llegan a ${RATE_LIMITS.write} por usuario, sumando endpoints, y el siguiente es 429`, async () => {
    for (let i = 0; i < RATE_LIMITS.write; i += 1) {
      if (i % 2) await patch('/probe/b', tokenA).expect(200);
      else await post('/probe/a', tokenA).expect(201);
    }

    expectRateLimited(await post('/probe/a', tokenA), '/probe/a');
    expectRateLimited(await patch('/probe/b', tokenA), '/probe/b');
    // Las lecturas tienen su propia cuota.
    await get('/probe/a', tokenA).expect(200);
  });

  it('dos usuarios distintos (misma IP) no comparten cuota', async () => {
    for (let i = 0; i < RATE_LIMITS.read; i += 1) await get('/probe/a', tokenA).expect(200);
    for (let i = 0; i < RATE_LIMITS.write; i += 1) await post('/probe/a', tokenA).expect(201);
    expectRateLimited(await get('/probe/a', tokenA), '/probe/a');
    expectRateLimited(await post('/probe/a', tokenA), '/probe/a');

    await get('/probe/a', tokenB).expect(200);
    await post('/probe/a', tokenB).expect(201);
  });

  it(`login mantiene ${RATE_LIMITS.loginIp}/min por IP: el siguiente es 429 aunque cambie el username`, async () => {
    for (let i = 0; i < RATE_LIMITS.loginIp; i += 1) {
      await login(`usuario-${i}`).expect(401);
    }

    expectRateLimited(await login('otro-usuario'), '/auth/login');
    // Refresh y las rutas autenticadas no comparten esa cuota.
    await request(server()).post('/auth/refresh').send({ refreshToken: 'x' }).expect(401);
    await get('/probe/a', tokenA).expect(200);
  });

  it(`refresh: ${RATE_LIMITS.refreshIp}/min por IP`, async () => {
    const refresh = () => request(server()).post('/auth/refresh').send({ refreshToken: 'x' });
    for (let i = 0; i < RATE_LIMITS.refreshIp; i += 1) await refresh().expect(401);
    expectRateLimited(await refresh(), '/auth/refresh');
  });
});
