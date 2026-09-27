import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_WASH_AMOUNT, MAX_WASH_SORT_ORDER, MAX_WASH_TEXT, TrimToNull } from './wash-fields';

/**
 * Agregar una opción de precio a un tipo de lavado (DEC-56, DEC-66). El tipo
 * sale de la URL (`/wash-types/:id/prices`): `washTypeId` en el body es un
 * campo desconocido (400). Nace activa.
 */
export class CreateWashPriceOptionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'UUID opcional; si no se envía, lo genera el servidor.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El identificador no es válido.' })
  id?: string;

  @ApiProperty({
    description: 'Monto del lavado. Mayor que 0, hasta 2 decimales.',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: MAX_WASH_AMOUNT,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe ser un número con hasta 2 decimales.' },
  )
  @IsPositive({ message: 'El monto debe ser mayor que 0.' })
  @Max(MAX_WASH_AMOUNT, { message: 'El monto es demasiado grande.' })
  amount!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_WASH_TEXT,
    description: 'Etiqueta opcional (por ejemplo "Grande"). Vacío = sin etiqueta.',
  })
  @TrimToNull()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString({ message: 'La etiqueta debe ser texto.' })
  @MaxLength(MAX_WASH_TEXT, { message: `La etiqueta admite hasta ${MAX_WASH_TEXT} caracteres.` })
  label?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Orden dentro del tipo; menor primero. Por defecto 0.',
  })
  @IsOptional()
  @IsInt({ message: 'El orden debe ser un número entero.' })
  @Min(0, { message: 'El orden no puede ser negativo.' })
  @Max(MAX_WASH_SORT_ORDER, { message: 'El orden es demasiado grande.' })
  sortOrder?: number;
}
