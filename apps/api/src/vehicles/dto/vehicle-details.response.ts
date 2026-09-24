import { ApiProperty } from '@nestjs/swagger';
import { ReminderStatus } from '@prisma/client';
import { CustomerResponse } from '../../customers/dto/customer.response';
import { MaintenanceResponse } from '../../maintenances/dto/maintenance.response';
import type { LookupReminder, VehicleLookupResult } from '../vehicles.service';
import { VehicleModelResponse } from './vehicle-model.response';
import { VehicleResponse } from './vehicle.response';

/** `GET /vehicles/:id`: vehículo con su cliente y su modelo. */
export class VehicleWithRelationsResponse extends VehicleResponse {
  @ApiProperty({ type: CustomerResponse, nullable: true })
  customer!: CustomerResponse | null;

  @ApiProperty({ type: VehicleModelResponse, nullable: true })
  vehicleModel!: VehicleModelResponse | null;
}

/** Estado del recordatorio que generó el último mantenimiento (BR-R7). */
export class LookupReminderResponse implements LookupReminder {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ReminderStatus, enumName: 'ReminderStatus' })
  status!: ReminderStatus;
}

/** `GET /vehicles/lookup`: además, último mantenimiento y último km conocido. */
export class VehicleLookupResponse
  extends VehicleWithRelationsResponse
  implements VehicleLookupResult
{
  @ApiProperty({ type: MaintenanceResponse, nullable: true })
  lastMaintenance!: MaintenanceResponse | null;

  @ApiProperty({
    type: LookupReminderResponse,
    nullable: true,
    description: 'Recordatorio que generó el último mantenimiento (su próximo km/fecha), si hubo.',
  })
  lastMaintenanceReminder!: LookupReminderResponse | null;

  @ApiProperty({ type: Number, nullable: true })
  lastKnownKm!: number | null;
}
