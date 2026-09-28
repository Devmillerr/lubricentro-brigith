import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../src/config/env.validation';
import { ProblemException } from '../src/common/exceptions/problem.exception';
import { FixedWindowStore } from '../src/rate-limit/fixed-window.store';
import { RATE_LIMITS } from '../src/rate-limit/rate-limit.constants';
import { RateLimit } from '../src/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../src/rate-limit/rate-limit.guard';

const SECRET = 'secreto-de-prueba-unitaria';
const jwt = new JwtService();
const config = { get: () => SECRET } as unknown as ConfigService<Env, true>;

class Routes {
  plain(): void {}
  @RateLimit('login')
  login(): void {}
  @RateLimit('refresh')
  refresh(): void {}
}

type Route = keyof Routes;

interface FakeRequest {
  method: string;
  ip?: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Petición falsa; `token` se manda como `Authorization: Bearer`. */
function req(method: string, ip: string, token?: string, body?: unknown): FakeRequest {
  return { method, ip, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
}

function tokenFor(sub: string, secret = SECRET): Promise<string> {
  return jwt.signAsync({ sub, businessId: 'b', role: 'OWNER' }, { secret, expiresIn: '5m' });
}

interface Outcome {
  allowed: boolean;
  error?: ProblemException;
  headers: Record<string, string>;
}

describe('RateLimitGuard (DEC-86)', () => {
  let guard: RateLimitGuard;

  beforeEach(() => {
    guard = new RateLimitGuard(new Reflector(), jwt, config, new FixedWindowStore());
  });

  async function outcome(request: FakeRequest, route: Route = 'plain'): Promise<Outcome> {
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => (headers[name] = value) };
    const context = {
      getType: () => 'http',
      getHandler: () => Routes.prototype[route],
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => res }),
    } as unknown as ExecutionContext;
    try {
      await guard.canActivate(context);
      return { allowed: true, headers };
    } catch (error) {
      return { allowed: false, error: error as ProblemException, headers };
    }
  }

  async function allowed(request: FakeRequest, route?: Route): Promise<boolean> {
    return (await outcome(request, route)).allowed;
  }

  /** Hace `times` peticiones y falla si alguna se rechaza. */
  async function exhaust(times: number, next: (i: number) => FakeRequest, route?: Route) {
    for (let i = 0; i < times; i += 1) {
      if (!(await allowed(next(i), route))) {
        throw new Error(`Rechazada antes de tiempo en la petición ${i + 1}`);
      }
    }
  }

  it(`GET autenticado: ${RATE_LIMITS.read} por usuario; el siguiente es 429 RATE_LIMITED con Retry-After`, async () => {
    const token = await tokenFor('user-a');
    await exhaust(RATE_LIMITS.read, () => req('GET', '1.1.1.1', token));

    const blocked = await outcome(req('GET', '1.1.1.1', token));
    expect(blocked.allowed).toBe(false);
    expect(blocked.error).toBeInstanceOf(ProblemException);
    expect(blocked.error?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(blocked.error?.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(Number(blocked.headers['Retry-After'])).toBeLessThanOrEqual(60);
  });

  it(`POST y PATCH autenticados comparten ${RATE_LIMITS.write} por usuario, aparte de los GET`, async () => {
    const token = await tokenFor('user-a');
    await exhaust(RATE_LIMITS.write, (i) => req(i % 2 ? 'POST' : 'PATCH', '1.1.1.1', token));

    expect(await allowed(req('POST', '1.1.1.1', token))).toBe(false);
    expect(await allowed(req('PATCH', '1.1.1.1', token))).toBe(false);
    expect(await allowed(req('GET', '1.1.1.1', token))).toBe(true);
  });

  it('cuenta por userId del token, no por IP: dos usuarios en la misma IP no comparten cuota', async () => {
    const a = await tokenFor('user-a');
    const b = await tokenFor('user-b');
    await exhaust(RATE_LIMITS.write, () => req('POST', '1.1.1.1', a));

    expect(await allowed(req('POST', '1.1.1.1', b))).toBe(true);
    expect(await allowed(req('POST', '2.2.2.2', a))).toBe(false);
  });

  it('un token inválido o ausente cuenta por IP, sin tomar la cuota del usuario del token', async () => {
    const forged = await tokenFor('user-a', 'otro-secreto');
    await exhaust(RATE_LIMITS.write, () => req('POST', '3.3.3.3', forged));
    expect(await allowed(req('POST', '3.3.3.3'))).toBe(false);

    const real = await tokenFor('user-a');
    expect(await allowed(req('POST', '3.3.3.3', real))).toBe(true);
  });

  it(`login: ${RATE_LIMITS.loginIp} por IP aunque cambie el username`, async () => {
    await exhaust(
      RATE_LIMITS.loginIp,
      (i) => req('POST', '4.4.4.4', undefined, { username: `u${i}` }),
      'login',
    );

    const blocked = await outcome(req('POST', '4.4.4.4', undefined, { username: 'otro' }), 'login');
    expect(blocked.error?.code).toBe('RATE_LIMITED');
    expect(blocked.headers['Retry-After']).toBeDefined();
  });

  it(`login: ${RATE_LIMITS.loginUsername} por username aunque cambie la IP`, async () => {
    await exhaust(
      RATE_LIMITS.loginUsername,
      (i) => req('POST', `5.5.5.${i}`, undefined, { username: 'dueño' }),
      'login',
    );

    const blocked = await outcome(
      req('POST', '6.6.6.6', undefined, { username: 'dueño' }),
      'login',
    );
    expect(blocked.error?.code).toBe('RATE_LIMITED');
    expect(await allowed(req('POST', '6.6.6.6', undefined, { username: 'otro' }), 'login')).toBe(
      true,
    );
  });

  it('login no suma a la cuota general de escrituras por IP', async () => {
    await exhaust(
      RATE_LIMITS.loginIp,
      () => req('POST', '7.7.7.7', undefined, { username: 'x' }),
      'login',
    );
    await exhaust(RATE_LIMITS.write, () => req('POST', '7.7.7.7'));
  });

  it(`refresh: ${RATE_LIMITS.refreshIp} por IP, aparte de la cuota general`, async () => {
    await exhaust(RATE_LIMITS.refreshIp, () => req('POST', '8.8.8.8'), 'refresh');

    expect((await outcome(req('POST', '8.8.8.8'), 'refresh')).error?.code).toBe('RATE_LIMITED');
    expect(await allowed(req('POST', '9.9.9.9'), 'refresh')).toBe(true);
    expect(await allowed(req('POST', '8.8.8.8'))).toBe(true);
  });

  it(`POST, PATCH, PUT y DELETE comparten los ${RATE_LIMITS.write} de escritura`, async () => {
    const token = await tokenFor('user-d');
    const methods = ['POST', 'PATCH', 'PUT', 'DELETE'];
    await exhaust(RATE_LIMITS.write, (i) =>
      req(methods[i % methods.length] ?? 'POST', '1.1.1.1', token),
    );
    for (const method of methods) {
      expect(await allowed(req(method, '1.1.1.1', token))).toBe(false);
    }
  });

  it('OPTIONS no cuenta', async () => {
    await exhaust(RATE_LIMITS.read + 5, () => req('OPTIONS', '1.1.1.1'));
  });
});
