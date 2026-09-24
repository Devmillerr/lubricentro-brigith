import { ApiProperty } from '@nestjs/swagger';
import type { VehicleModel } from '@prisma/client';

export class VehicleModelResponse implements VehicleModel {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  createdById!: string;

  @ApiProperty({ type: String, nullable: true })
  make!: string | null;

  @ApiProperty()
  model!: string;

  @ApiProperty({ type: Number, nullable: true })
  yearFrom!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  yearTo!: number | null;

  @ApiProperty({ type: String, nullable: true })
  engineNote!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
