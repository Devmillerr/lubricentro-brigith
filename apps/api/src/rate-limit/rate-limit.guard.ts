import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { ProblemException } from '../common/exceptions/problem.exception';
import type { Env } from '../config/env.validation';
import {
  RATE_LIMITS,
  RATE_LIMIT_POLICY_KEY,
  RATE_LIMIT_WINDOW_MS,
  type RateLimitPolicy,
} from './rate-limit.constants';
import { RateLimitStore } from './rate-limit.store';

const READ_METHODS = new Set(['GET', 'HEAD']);
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

interface Bucket {
  key: string;
  limit: number;
}

/**
 * Rate limit de DEC-86 (06-API.md §4), global. Corre antes que `JwtAuthGuard`,
 * así que verifica el token por su cuenta para contar por `userId`: un token
 * inválido o ausente cuenta por IP con los mismos límites (y la ruta
 * protegida luego responde 401). Los límites por IP usan `req.ip`, que
 * detrás de un proxy depende de `TRUST_PROXY` (ver `main.ts`).
 *
 * Al exceder: 429 con `Retry-After` (segundos) y `code: "RATE_LIMITED"` en el
 * formato de error de la API.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const policy =
      this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_POLICY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'default';

    for (const bucket of await this.bucketsFor(policy, request)) {
      const result = await this.store.hit(bucket.key, bucket.limit, RATE_LIMIT_WINDOW_MS);
      if (!result.allowed) {
        response.setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new ProblemException({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMITED',
          title: 'Demasiadas solicitudes',
          detail: `Espera ${result.retryAfterSeconds} segundos y vuelve a intentar.`,
        });
      }
    }
    return true;
  }

  private async bucketsFor(policy: RateLimitPolicy, request: Request): Promise<Bucket[]> {
    const ip = clientIp(request);

    if (policy === 'login') {
      const buckets: Bucket[] = [{ key: `login-ip:${ip}`, limit: RATE_LIMITS.loginIp }];
      const username = (request.body as { username?: unknown } | undefined)?.username;
      if (typeof username === 'string' && username.length > 0) {
        buckets.push({ key: `login-username:${username}`, limit: RATE_LIMITS.loginUsername });
      }
      return buckets;
    }

    if (policy === 'refresh') {
      return [{ key: `refresh-ip:${ip}`, limit: RATE_LIMITS.refreshIp }];
    }

    const method = request.method.toUpperCase();
    const kind = READ_METHODS.has(method) ? 'read' : WRITE_METHODS.has(method) ? 'write' : null;
    if (!kind) return [];

    const userId = await this.userIdFrom(request);
    const tracker = userId ? `user:${userId}` : `ip:${ip}`;
    return [{ key: `${kind}:${tracker}`, limit: RATE_LIMITS[kind] }];
  }

  /** `sub` de un token de acceso válido; `undefined` si falta o no verifica. */
  private async userIdFrom(request: Request): Promise<string | undefined> {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) return undefined;
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      return typeof payload.sub === 'string' && payload.sub ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }
}

function clientIp(request: Request): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
