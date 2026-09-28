import { Module, type Type } from '@nestjs/common';
import { IdempotencyTestController } from './idempotency-test.controller';
import { IdempotencyService } from './idempotency.service';

/**
 * `internal/idempotency-test` se monta **solo** con `NODE_ENV === 'test'`.
 * Falla cerrado: sin `NODE_ENV`, con otro valor o mal escrito, no se monta,
 * así que producción no depende de tener `NODE_ENV` bien configurado.
 */
export function idempotencyControllers(nodeEnv: string | undefined): Type[] {
  return nodeEnv === 'test' ? [IdempotencyTestController] : [];
}

@Module({
  controllers: idempotencyControllers(process.env.NODE_ENV),
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
