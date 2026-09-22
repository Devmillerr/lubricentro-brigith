import { ApiProperty } from '@nestjs/swagger';
import { DueRule, InsufficientStockPolicy, type Business } from '@prisma/client';

/** `Business` tal como lo devuelve la API (`implements` evita que diverja del modelo). */
export class BusinessResponse implements Business {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ type: String, nullable: true })
  currency!: string | null;

  @ApiProperty({ type: String, nullable: true })
  defaultCountryCode!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  reminderLeadDays!: number | null;

  @ApiProperty({ enum: DueRule, enumName: 'DueRule', nullable: true })
  defaultDueRuleWhenBoth!: DueRule | null;

  @ApiProperty({ enum: InsufficientStockPolicy, enumName: 'InsufficientStockPolicy' })
  insufficientStockPolicy!: InsufficientStockPolicy;

  @ApiProperty({ type: String, nullable: true })
  whatsappTemplate!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
