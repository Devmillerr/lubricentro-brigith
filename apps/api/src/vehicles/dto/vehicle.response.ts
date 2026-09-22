import { ApiProperty } from '@nestjs/swagger';
import type { Vehicle } from '@prisma/client';

export class VehicleResponse implements Vehicle {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  createdById!: string;

  @ApiProperty({ description: 'Tal como se ingresó.' })
  plate!: string;

  @ApiProperty({ description: 'Mayúsculas, sin espacios ni guiones (BR-C6).' })
  plateNormalized!: string;

  @ApiProperty({ type: String, nullable: true })
  customerId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  vehicleModelId!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  year!: number | null;

  @ApiProperty({ type: String, nullable: true })
  color!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
