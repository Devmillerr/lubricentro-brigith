import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MaintenanceTypesController } from './maintenance-types.controller';
import { MaintenanceTypesService } from './maintenance-types.service';
import { MaintenancesController } from './maintenances.controller';
import { MaintenancesService } from './maintenances.service';

@Module({
  imports: [AuthModule, IdempotencyModule],
  controllers: [MaintenanceTypesController, MaintenancesController],
  providers: [MaintenanceTypesService, MaintenancesService],
  exports: [MaintenanceTypesService, MaintenancesService],
})
export class MaintenancesModule {}
