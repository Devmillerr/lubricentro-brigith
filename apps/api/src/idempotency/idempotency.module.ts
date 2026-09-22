import { Module } from '@nestjs/common';
import { IdempotencyTestController } from './idempotency-test.controller';
import { IdempotencyService } from './idempotency.service';

@Module({
  controllers: process.env.NODE_ENV === 'production' ? [] : [IdempotencyTestController],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
