import { ApiPropertyOptional } from '@nestjs/swagger';
import { DueRule } from '@prisma/client';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

/**
 * Corrige solo campos que no afectan el stock (BR-M11). Cambiar productos o
 * cantidades se hace anulando y registrando uno nuevo, no con este endpoint.
 */
export class UpdateMaintenanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

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
}
