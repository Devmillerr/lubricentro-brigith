import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_WASH_AMOUNT, MAX_WASH_SORT_ORDER, MAX_WASH_TEXT, TrimToNull } from './wash-fields';

/**
 * Editar, desactivar o reactivar una opción de precio (DEC-63, DEC-66).
 * Campo ausente = no se toca. `label: null` (o vacío) quita la etiqueta; en
 * los demás campos `null` es un 400.
 */
export class UpdateWashPriceOptionDto {
  @ApiPropertyOptional({ minimum: 0, exclusiveMinimum: true, maximum: MAX_WASH_AMOUNT })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe ser un número con hasta 2 decimales.' },
  )
  @IsPositive({ message: 'El monto debe ser mayor que 0.' })
  @Max(MAX_WASH_AMOUNT, { message: 'El monto es demasiado grande.' })
  amount?: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_WASH_TEXT,
    description: 'null o vacío quita la etiqueta.',
  })
  @TrimToNull()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString({ message: 'La etiqueta debe ser texto.' })
  @MaxLength(MAX_WASH_TEXT, { message: `La etiqueta admite hasta ${MAX_WASH_TEXT} caracteres.` })
  label?: string | null;

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
