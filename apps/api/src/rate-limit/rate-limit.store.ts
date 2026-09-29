import type { HitResult } from './fixed-window.store';

/**
 * Almacenamiento de las ventanas del rate limit (DEC-86). En memoria
 * (`FixedWindowStore`) basta con una sola instancia de la API; con varias
 * (p. ej. funciones serverless) se usa `PostgresFixedWindowStore`, que
 * comparte el contador en la base. Ver `RATE_LIMIT_STORE` en `.env.example`.
 */
export abstract class RateLimitStore {
  abstract hit(key: string, limit: number, windowMs: number): HitResult | Promise<HitResult>;
}
