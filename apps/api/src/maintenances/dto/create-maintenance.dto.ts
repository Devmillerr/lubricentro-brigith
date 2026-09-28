import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DueRule } from '@prisma/client';
import { MaintenanceChargeDto } from './maintenance-charge.dto';
import { MaintenanceItemDto } from './maintenance-item.dto';

/**
 * Crea un mantenimiento completo en una sola petición (06-API.md): es una
 * transacción indivisible (BR-M10). `dueRule` es obligatorio solo cuando se
 * envían `nextDueKm` y `nextDueDate` juntos y el negocio no configuró un
 * default (BR-M5, due-rules.ts).
 */
export class CreateMaintenanceDto {
  @ApiPropertyOptional({ description: 'UUID opcional; si no se envía, lo genera el servidor.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description:
      'Opcional desde R6 (DEC-31, DEC-73). Sin vehículo se rechazan odometerKm, nextDueKm, nextDueDate y dueRule, y no se crea recordatorio.',
  })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiProperty()
  @IsUUID()
  maintenanceTypeId!: string;

  @ApiProperty({ description: 'ISO 8601. Puede ser anterior al registro (BR-M9).' })
  @IsISO8601()
  performedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @ApiPropertyOptional({ type: [MaintenanceItemDto], description: '0 a n productos (BR-M8).' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaintenanceItemDto)
  items?: MaintenanceItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  nextDueKm?: number;

  @ApiPropertyOptional({ description: 'ISO 8601.' })
  @IsOptional()
  @IsISO8601()
  nextDueDate?: string;

  @ApiPropertyOptional({ enum: DueRule })
  @IsOptional()
  @IsEnum(DueRule)
  dueRule?: DueRule;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    type: MaintenanceChargeDto,
    description:
      'Cobro opcional en la misma transacción (R6, DEC-72): una venta MAINTENANCE con una línea SERVICE por el total.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MaintenanceChargeDto)
  charge?: MaintenanceChargeDto;
}
