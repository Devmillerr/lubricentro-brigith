import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { FixedWindowStore } from './fixed-window.store';
import { RateLimitGuard } from './rate-limit.guard';

/** Registra el rate limit de DEC-86 como guard global. */
@Module({
  imports: [AuthModule],
  providers: [FixedWindowStore, { provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitModule {}
