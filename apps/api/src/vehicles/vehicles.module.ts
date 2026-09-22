import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaintenancesModule } from '../maintenances/maintenances.module';
import { VehicleModelsController } from './vehicle-models.controller';
import { VehicleModelsService } from './vehicle-models.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [AuthModule, MaintenancesModule],
  controllers: [VehiclesController, VehicleModelsController],
  providers: [VehiclesService, VehicleModelsService],
  exports: [VehiclesService, VehicleModelsService],
})
export class VehiclesModule {}
