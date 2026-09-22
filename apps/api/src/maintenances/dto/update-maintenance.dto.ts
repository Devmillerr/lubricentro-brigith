import { ApiPropertyOptional } from '@nestjs/swagger';
import { DueRule } from '@prisma/client';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

/**
 * Corrige solo campos que no afectan el stock (BR-M11). Cambiar productos o
 * cantidades se hace anulando y registrando uno nuevo, no con este endpoint.
 * Un campo omitido no se toca; `nextDueKm`/`nextDueDate`/`dueRule` en `null`
 * lo quitan (sin próximo km ni fecha no corresponde recordatorio, BR-M6).
 */
export class UpdateMaintenanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  nextDueKm?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601.' })
  @IsOptional()
  @IsISO8601()
  nextDueDate?: string | null;

  @ApiPropertyOptional({ enum: DueRule, nullable: true })
  @IsOptional()
  @IsEnum(DueRule)
  dueRule?: DueRule | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
