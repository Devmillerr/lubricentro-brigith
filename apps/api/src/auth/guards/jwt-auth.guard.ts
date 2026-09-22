import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Env } from '../../config/env.validation';
import { ProblemException } from '../../common/exceptions/problem.exception';
import type { AccessTokenPayload } from '../types/jwt-payload';

/**
 * Exige `Authorization: Bearer <JWT de acceso>` y adjunta el payload en
 * `request.authUser`. Es la única vía por la que un controlador conoce el
 * `businessId`: nunca sale de una ruta ni de un cuerpo (BR-G3).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new ProblemException({
        status: HttpStatus.UNAUTHORIZED,
        code: 'UNAUTHENTICATED',
        title: 'Falta el token de acceso',
      });
    }

    try {
      request.authUser = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      return true;
    } catch {
      throw new ProblemException({
        status: HttpStatus.UNAUTHORIZED,
        code: 'INVALID_TOKEN',
        title: 'El token de acceso no es válido o expiró',
      });
    }
  }
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice('Bearer '.length).trim() || undefined;
}
