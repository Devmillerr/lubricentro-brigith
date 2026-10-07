import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  MAX_MONEY,
  MAX_MONEY_MESSAGE,
  MAX_QUANTITY,
  MAX_QUANTITY_MESSAGE,
} from '../../common/decimal-limits';
import { UNIT_MESSAGE, UNIT_PATTERN } from '../catalog-suggestions';

/**
 * Cada producto es una unidad de stock (BR-P15). `unit` es texto libre a
 * propósito: el vocabulario queda pendiente de DEC-22/P-07, pero el campo en
 * sí ya es parte de la estructura estable (05-DATABASE.md §3).
 */
export class CreateProductDto {
  @ApiPropertyOptional({ description: 'UUID opcional; si no se envía, lo genera el servidor.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Texto libre (C-10).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: 'Único por negocio si se envía (C-05).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Opcional, p. ej. "10W40" (BR-P19b).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  viscosity?: string;

  @ApiPropertyOptional({ description: 'Opcional, p. ej. "1.5 L" o "Balde" (BR-P19b).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  presentation?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description:
      'Unidad en la que se cuenta y descuenta (BR-P15): un nombre como "unidad", "galón" o "litro". Un valor sin letras (p. ej. "0") se rechaza.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(UNIT_PATTERN, { message: UNIT_MESSAGE })
  unit!: string;

  @ApiPropertyOptional({
    description: 'Opcional; ningún precio se asume (BR-P17).',
    maximum: MAX_MONEY,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY, { message: MAX_MONEY_MESSAGE })
  salePrice?: number;

  @ApiPropertyOptional({ description: 'Por defecto true (BR-P16).', default: true })
  @IsOptional()
  @IsBoolean()
  tracksStock?: boolean;

  @ApiPropertyOptional({
    description:
      'Capacidad del envase abierto del que se vende, en la unidad del producto (p. ej. 20 litros por balde, DEC-93). Va junto con containerLabel.',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: MAX_QUANTITY,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La capacidad debe ser un número con hasta 3 decimales.' },
  )
  @IsPositive({ message: 'La capacidad debe ser mayor que 0.' })
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  containerCapacity?: number;

  @ApiPropertyOptional({
    description: 'Nombre del envase (p. ej. "Balde", DEC-93). Va junto con containerCapacity.',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Escribe el nombre del envase.' })
  @MaxLength(30, { message: 'El nombre del envase admite hasta 30 caracteres.' })
  containerLabel?: string;
}
