import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_MONEY,
  MAX_MONEY_MESSAGE,
  MAX_QUANTITY,
  MAX_QUANTITY_MESSAGE,
} from '../../common/decimal-limits';
import { UNIT_MESSAGE, UNIT_PATTERN } from '../catalog-suggestions';

/** No enviado = no se toca. */
const sent = (_: object, value: unknown) => value !== undefined;
/** No enviado o `null` = no se valida (`null` borra el valor). */
const sentNotNull = (_: object, value: unknown) => value !== undefined && value !== null;

/**
 * Mismos campos que el alta. Los opcionales aceptan `null` para quitar el
 * valor (precio, marca, código, etc. pueden volver a quedar pendientes,
 * BR-P19b). Nombre, unidad y `tracksStock` no aceptan `null`.
 */
export class UpdateProductDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf(sentNotNull)
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Texto libre (C-10).' })
  @ValidateIf(sentNotNull)
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Único por negocio si se envía (C-05).',
  })
  @ValidateIf(sentNotNull)
  @IsString()
  @MaxLength(50)
  code?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf(sentNotNull)
  @IsString()
  @MaxLength(50)
  viscosity?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf(sentNotNull)
  @IsString()
  @MaxLength(50)
  presentation?: string | null;

  @ApiPropertyOptional()
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(UNIT_PATTERN, { message: UNIT_MESSAGE })
  unit?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'null deja el precio pendiente (BR-P17).',
    maximum: MAX_MONEY,
  })
  @ValidateIf(sentNotNull)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY, { message: MAX_MONEY_MESSAGE })
  salePrice?: number | null;

  @ApiPropertyOptional()
  @ValidateIf(sent)
  @IsBoolean()
  tracksStock?: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Capacidad del envase (DEC-93). null lo quita junto con containerLabel.',
    maximum: MAX_QUANTITY,
  })
  @ValidateIf(sentNotNull)
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La capacidad debe ser un número con hasta 3 decimales.' },
  )
  @IsPositive({ message: 'La capacidad debe ser mayor que 0.' })
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  containerCapacity?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30 })
  @ValidateIf(sentNotNull)
  @IsString()
  @IsNotEmpty({ message: 'Escribe el nombre del envase.' })
  @MaxLength(30, { message: 'El nombre del envase admite hasta 30 caracteres.' })
  containerLabel?: string | null;

  @ApiPropertyOptional({ description: 'false desactiva y true reactiva (BR-G5).' })
  @ValidateIf(sent)
  @IsBoolean()
  isActive?: boolean;
}
