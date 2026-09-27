import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { WashTypesController } from './wash-types.controller';
import { WashTypesService } from './wash-types.service';
import { WashesController } from './washes.controller';
import { WashesService } from './washes.service';

/**
 * Lavados (R5): configuración de tipos y precios (B-141) y registro con
 * `POST /washes` (B-143). Historial, detalle y anulación van por `/sales`.
 */
@Module({
  imports: [AuthModule, IdempotencyModule],
  controllers: [WashTypesController, WashesController],
  providers: [WashTypesService, WashesService],
})
export class WashesModule {}
