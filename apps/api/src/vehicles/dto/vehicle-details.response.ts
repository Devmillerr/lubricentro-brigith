import { ApiProperty } from '@nestjs/swagger';
import { CustomerResponse } from '../../customers/dto/customer.response';
import { MaintenanceResponse } from '../../maintenances/dto/maintenance.response';
import type { VehicleLookupResult } from '../vehicles.service';
import { VehicleModelResponse } from './vehicle-model.response';
import { VehicleResponse } from './vehicle.response';

/** `GET /vehicles/:id`: vehículo con su cliente y su modelo. */
export class VehicleWithRelationsResponse extends VehicleResponse {
  @ApiProperty({ type: CustomerResponse, nullable: true })
  customer!: CustomerResponse | null;

  @ApiProperty({ type: VehicleModelResponse, nullable: true })
  vehicleModel!: VehicleModelResponse | null;
}

/** `GET /vehicles/lookup`: además, último mantenimiento y último km conocido. */
export class VehicleLookupResponse
  extends VehicleWithRelationsResponse
  implements VehicleLookupResult
{
  @ApiProperty({ type: MaintenanceResponse, nullable: true })
  lastMaintenance!: MaintenanceResponse | null;

  @ApiProperty({ type: Number, nullable: true })
  lastKnownKm!: number | null;
}
