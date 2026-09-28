import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_MONEY, MAX_MONEY_MESSAGE } from '../../common/decimal-limits';

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

  @ApiPropertyOptional({ description: 'false desactiva y true reactiva (BR-G5).' })
  @ValidateIf(sent)
  @IsBoolean()
  isActive?: boolean;
}
