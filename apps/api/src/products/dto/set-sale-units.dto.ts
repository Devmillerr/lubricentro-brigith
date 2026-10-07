import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MONEY,
  MAX_MONEY_MESSAGE,
  MAX_QUANTITY,
  MAX_QUANTITY_MESSAGE,
} from '../../common/decimal-limits';
import { MAX_SALE_UNITS, type SaleUnitInput } from '../products.service';

/** Una forma de venta (DEC-91): nombre, equivalencia en stock y precio. */
export class SaleUnitDto implements SaleUnitInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Forma existente a modificar. Sin id, se busca por nombre o se crea.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'La forma de venta no es válida.' })
  id?: string;

  @ApiProperty({ maxLength: 50, example: 'Octavo' })
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'Escribe el nombre de la forma de venta.' })
  @MaxLength(50, { message: 'El nombre admite hasta 50 caracteres.' })
  label!: string;

  @ApiProperty({
    description:
      'Unidades de stock del producto que descuenta una unidad vendida (p. ej. 0.125 galón para un octavo; la capacidad, para el balde). Mayor que 0, hasta 3 decimales.',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: MAX_QUANTITY,
    example: 0.125,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La equivalencia debe ser un número con hasta 3 decimales.' },
  )
  @IsPositive({ message: 'La equivalencia debe ser mayor que 0.' })
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  factor!: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Precio de esta forma. null o ausente = se escribe al vender (BR-P17).',
    minimum: 0,
    maximum: MAX_MONEY,
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con hasta 2 decimales.' },
  )
  @Min(0, { message: 'El precio no puede ser negativo.' })
  @Max(MAX_MONEY, { message: MAX_MONEY_MESSAGE })
  salePrice?: number | null;
}

/**
 * Reemplaza las formas de venta activas del producto (DEC-91). El orden de la
 * lista es el orden en que se muestran. Las que no vienen se desactivan (no se
 * borran: las ventas pasadas las referencian). Lista vacía = el producto se
 * vende solo en su propia unidad, como antes.
 */
export class SetSaleUnitsDto {
  @ApiProperty({ type: [SaleUnitDto], maxItems: MAX_SALE_UNITS })
  @IsArray({ message: 'Las formas de venta deben ser una lista.' })
  @ArrayMaxSize(MAX_SALE_UNITS, {
    message: `Un producto admite hasta ${MAX_SALE_UNITS} formas de venta.`,
  })
  @ValidateNested({ each: true })
  @Type(() => SaleUnitDto)
  units!: SaleUnitDto[];
}
