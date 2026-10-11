import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import {
  PayablePaymentsController,
  PayablesController,
  ReceiptPayableController,
} from './payables.controller';
import { PayablesService } from './payables.service';

@Module({
  imports: [AuthModule, IdempotencyModule],
  controllers: [PayablesController, PayablePaymentsController, ReceiptPayableController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}
