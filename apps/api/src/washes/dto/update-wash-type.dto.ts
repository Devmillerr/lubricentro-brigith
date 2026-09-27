import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
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
 * Editar, desactivar (`isActive: false`) o reactivar un tipo de lavado
 * (DEC-56, DEC-66). Campo ausente = no se toca. `null` solo vale para
 * `imageKey` (quita la imagen); en los demás campos es un 400.
 */
export class UpdateWashTypeDto {
  @ApiPropertyOptional({ maxLength: MAX_WASH_TEXT })
  @Trim()
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'Escribe el nombre del tipo de lavado.' })
  @MaxLength(MAX_WASH_TEXT, { message: `El nombre admite hasta ${MAX_WASH_TEXT} caracteres.` })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_WASH_IMAGE_KEY,
    description: 'null o vacío quita la imagen.',
  })
  @TrimToNull()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString({ message: 'La imagen debe ser texto.' })
  @MaxLength(MAX_WASH_IMAGE_KEY, {
    message: `La imagen admite hasta ${MAX_WASH_IMAGE_KEY} caracteres.`,
  })
  imageKey?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: 'El orden debe ser un número entero.' })
  @Min(0, { message: 'El orden no puede ser negativo.' })
  @Max(MAX_WASH_SORT_ORDER, { message: 'El orden es demasiado grande.' })
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'false desactiva; true reactiva. Nunca se borra.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean({ message: 'isActive debe ser true o false.' })
  isActive?: boolean;
}
