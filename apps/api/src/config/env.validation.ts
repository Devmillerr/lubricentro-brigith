import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN es obligatoria'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET debe tener al menos 16 caracteres'),
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+[smhdw]$/, 'JWT_ACCESS_TTL debe tener el formato "15m", "1h", etc.')
    .default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET debe tener al menos 16 caracteres'),
  JWT_REFRESH_TTL: z
    .string()
    .regex(/^\d+[smhdw]$/, 'JWT_REFRESH_TTL debe tener el formato "30d", "1w", etc.')
    .default('30d'),
  /**
   * Dónde viven los contadores del rate limit (DEC-86): `memory` sirve con una
   * sola instancia; `database` los comparte entre instancias (serverless).
   * Por defecto, `database` en producción y `memory` en el resto.
   */
  RATE_LIMIT_STORE: z.enum(['memory', 'database']).optional(),
  /**
   * Saltos de proxy de confianza para `req.ip` (Express `trust proxy`). 0 =
   * desactivado (conexión directa). Detrás del proxy de Vercel: 1.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida las variables de entorno al arrancar. Falla rápido y con un mensaje
 * claro en vez de dejar que un valor faltante rompa algo más adelante.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return {
    ...result.data,
    RATE_LIMIT_STORE:
      result.data.RATE_LIMIT_STORE ??
      (result.data.NODE_ENV === 'production' ? 'database' : 'memory'),
  };
}
