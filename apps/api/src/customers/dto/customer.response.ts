import { ApiProperty } from '@nestjs/swagger';
import type { Customer } from '@prisma/client';
import { PageOf } from '../../common/openapi/page.dto';
import { VehicleResponse } from '../../vehicles/dto/vehicle.response';

export class CustomerResponse implements Customer {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  createdById!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class CustomerWithVehiclesResponse extends CustomerResponse {
  @ApiProperty({ type: [VehicleResponse] })
  vehicles!: VehicleResponse[];
}

export class CustomerPageResponse extends PageOf(CustomerResponse) {}
