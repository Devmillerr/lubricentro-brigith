import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { FixedWindowStore, HitResult } from './fixed-window.store';
import type { RateLimitStore } from './rate-limit.store';

/** Proporción de peticiones que además borran ventanas vencidas. */
const SWEEP_PROBABILITY = 0.01;

/**
 * Ventana fija de DEC-86 guardada en Postgres (`rate_limit_windows`), con la
 * misma semántica que `FixedWindowStore` pero compartida entre instancias de
 * la API: un único `INSERT … ON CONFLICT` atómico por petición, con la hora
 * de la base para que todas las instancias usen el mismo reloj. El contador
 * se detiene en `limit + 1`, así que una petición rechazada no suma.
 *
 * Si la base falla (o la tabla aún no existe), cuenta en memoria con
 * `fallback` y lo registra: el rate limit no debe tumbar la API, pero
 * tampoco desaparecer.
 */
export class PostgresFixedWindowStore implements RateLimitStore {
  private readonly logger = new Logger(PostgresFixedWindowStore.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fallback: FixedWindowStore,
  ) {}

  async hit(key: string, limit: number, windowMs: number): Promise<HitResult> {
    try {
      const [row] = await this.prisma.$queryRaw<{ count: number; retryAfterSeconds: number }[]>`
        INSERT INTO "rate_limit_windows" ("key", "count", "resetAt")
        VALUES (${key}, 1, now() + make_interval(secs => ${windowMs / 1000}::double precision))
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "rate_limit_windows"."resetAt" <= now() THEN 1
            ELSE LEAST("rate_limit_windows"."count" + 1, ${limit + 1}::int)
          END,
          "resetAt" = CASE
            WHEN "rate_limit_windows"."resetAt" <= now() THEN EXCLUDED."resetAt"
            ELSE "rate_limit_windows"."resetAt"
          END
        RETURNING
          "count",
          GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))))::int AS "retryAfterSeconds"`;

      if (!row) throw new Error('el upsert no devolvió la ventana');
      if (Math.random() < SWEEP_PROBABILITY) await this.sweep();

      const allowed = row.count <= limit;
      return {
        allowed,
        count: Math.min(row.count, limit),
        retryAfterSeconds: row.retryAfterSeconds,
      };
    } catch (error) {
      this.logger.warn(
        `Rate limit en memoria por un error de la base: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.fallback.hit(key, limit, windowMs);
    }
  }

  /** Borra las ventanas vencidas (limpieza perezosa, sin temporizadores). */
  async sweep(): Promise<void> {
    await this.prisma.$executeRaw`DELETE FROM "rate_limit_windows" WHERE "resetAt" <= now()`;
  }
}
