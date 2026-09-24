import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Año y motor opcionales: el nivel de detalle de compatibilidad se define con datos (BR-F6). */
export class CreateVehicleModelDto {
  @ApiPropertyOptional({ description: 'UUID opcional; si no se envía, lo genera el servidor.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description:
      'Opcional (R2): si el dueño dio un solo texto ("Kia 2016"), va completo en model (BR-F6).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  make?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  model!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  engineNote?: string;
}
