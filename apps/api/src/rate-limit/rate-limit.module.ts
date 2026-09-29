import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, ModuleRef } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { FixedWindowStore } from './fixed-window.store';
import { PostgresFixedWindowStore } from './postgres-fixed-window.store';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';

/**
 * Registra el rate limit de DEC-86 como guard global. `RATE_LIMIT_STORE`
 * elige dónde viven los contadores: `memory` (una instancia) o `database`
 * (varias instancias; producción en Vercel). `PrismaService` se resuelve solo
 * en modo `database`, así el módulo sigue funcionando sin base en pruebas.
 */
@Module({
  imports: [AuthModule],
  providers: [
    FixedWindowStore,
    {
      provide: RateLimitStore,
      inject: [ConfigService, FixedWindowStore, ModuleRef],
      useFactory: (
        config: ConfigService<Env, true>,
        memory: FixedWindowStore,
        moduleRef: ModuleRef,
      ): RateLimitStore =>
        config.get('RATE_LIMIT_STORE', { infer: true }) === 'database'
          ? new PostgresFixedWindowStore(moduleRef.get(PrismaService, { strict: false }), memory)
          : memory,
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class RateLimitModule {}
