import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_WASH_IMAGE_KEY,
  MAX_WASH_SORT_ORDER,
  MAX_WASH_TEXT,
  Trim,
  TrimToNull,
} from './wash-fields';

/**
 * Crear un tipo de lavado (DEC-56, DEC-66). Nace activo: `isActive` no se
 * acepta aquí (campo desconocido → 400); se cambia con `PATCH`.
 */
export class CreateWashTypeDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'UUID opcional; si no se envía, lo genera el servidor.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El identificador no es válido.' })
  id?: string;

  @ApiProperty({
    maxLength: MAX_WASH_TEXT,
    description: 'Único por negocio. Se guarda sin espacios en los extremos.',
  })
  @Trim()
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'Escribe el nombre del tipo de lavado.' })
  @MaxLength(MAX_WASH_TEXT, { message: `El nombre admite hasta ${MAX_WASH_TEXT} caracteres.` })
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_WASH_IMAGE_KEY,
    description: 'Clave de imagen, sin subida (DEC-34). Vacío = sin imagen.',
  })
  @TrimToNull()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString({ message: 'La imagen debe ser texto.' })
  @MaxLength(MAX_WASH_IMAGE_KEY, {
    message: `La imagen admite hasta ${MAX_WASH_IMAGE_KEY} caracteres.`,
  })
  imageKey?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Orden en la lista; menor primero. Por defecto 0.',
  })
  @IsOptional()
  @IsInt({ message: 'El orden debe ser un número entero.' })
  @Min(0, { message: 'El orden no puede ser negativo.' })
  @Max(MAX_WASH_SORT_ORDER, { message: 'El orden es demasiado grande.' })
  sortOrder?: number;
}
