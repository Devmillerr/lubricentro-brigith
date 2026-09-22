import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../types/jwt-payload';

/**
 * Usuario y negocio del token de acceso, puestos por {@link JwtAuthGuard}.
 * Único punto donde un controlador lee el `businessId` (BR-G3).
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.authUser) {
      throw new UnauthorizedException();
    }
    return request.authUser;
  },
);
