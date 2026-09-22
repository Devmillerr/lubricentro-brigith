import { Module } from '@nestjs/common';
import { VehicleModelsController } from './vehicle-models.controller';
import { VehicleModelsService } from './vehicle-models.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [VehiclesController, VehicleModelsController],
  providers: [VehiclesService, VehicleModelsService],
  exports: [VehiclesService, VehicleModelsService],
})
export class VehiclesModule {}
