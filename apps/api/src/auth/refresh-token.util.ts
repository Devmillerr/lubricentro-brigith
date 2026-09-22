import { createHash } from 'node:crypto';

/** El refresco es un JWT; nunca se guarda en texto plano (04-ARCHITECTURE.md §6). */
export function hashRefreshTokenValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
