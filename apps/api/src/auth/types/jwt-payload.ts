import type { UserRole } from '@prisma/client';

/** Contenido del JWT de acceso. El negocio sale de aquí, nunca del cliente (BR-G3). */
export interface AccessTokenPayload {
  sub: string;
  businessId: string;
  role: UserRole;
}
