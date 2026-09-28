/**
 * Límites de DEC-86 (R7, [TÉCNICO]; 06-API.md §4). Protección inicial,
 * revisable con datos del piloto.
 */

/** Ventana fija de 60 segundos para todos los límites. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMITS = {
  /** `GET` autenticado: por usuario, sumando todos los endpoints. */
  read: 120,
  /** `POST`/`PATCH` autenticado: por usuario, sumando todos los endpoints. */
  write: 30,
  /** `POST /auth/login`: por IP. */
  loginIp: 5,
  /** `POST /auth/login`: por `username` del cuerpo. */
  loginUsername: 5,
  /** `POST /auth/refresh`: por IP. */
  refreshIp: 20,
} as const;

/**
 * Política de una ruta. `default` aplica `read` o `write` según el método;
 * `login` y `refresh` tienen su propio límite y no suman a los generales.
 */
export type RateLimitPolicy = 'default' | 'login' | 'refresh';

export const RATE_LIMIT_POLICY_KEY = 'brigith:rate-limit-policy';
