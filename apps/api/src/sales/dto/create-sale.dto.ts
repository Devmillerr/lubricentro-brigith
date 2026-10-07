import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MONEY,
  MAX_MONEY_MESSAGE,
  MAX_QUANTITY,
  MAX_QUANTITY_MESSAGE,
} from '../../common/decimal-limits';
import { MAX_SALE_LINES, MAX_SALE_TEXT, type CreateSaleInput } from '../sales.service';

/**
 * Una línea de la venta: producto, forma de venta opcional (DEC-91), cantidad
 * y precio aplicado (06-API.md §2, "Ventas").
 */
export class CreateSaleLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'El producto no es válido.' })
  productId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Forma de venta activa del producto (octavo, galón, balde…). Sin ella, la cantidad va en la unidad del producto, como siempre.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'La forma de venta no es válida.' })
  saleUnitId?: string;

  @ApiProperty({
    description:
      'Mayor que 0, hasta 3 decimales. En la forma de venta si se envía saleUnitId (el stock descontado es cantidad × equivalencia); si no, en la unidad del producto.',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: MAX_QUANTITY,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La cantidad debe ser un número con hasta 3 decimales.' },
  )
  @IsPositive({ message: 'La cantidad debe ser mayor que 0.' })
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  quantity!: number;

  @ApiProperty({
    description: 'Precio aplicado en esta venta (DEC-29). Mayor o igual que 0, hasta 2 decimales.',
    minimum: 0,
    maximum: MAX_MONEY,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con hasta 2 decimales.' },
  )
  @Min(0, { message: 'El precio no puede ser negativo.' })
  @Max(MAX_MONEY, { message: MAX_MONEY_MESSAGE })
  unitPrice!: number;
}

/**
 * Venta de mostrador (R4, 06-API.md §2 "Ventas"): de 1 a 50 líneas, sin
 * repetir producto y forma de venta (el servicio responde
 * `DUPLICATE_PRODUCT_LINE`), un solo método de pago (DEC-30). Sin total (lo
 * calcula el servidor): cualquier campo desconocido se rechaza con 400.
 */
export class CreateSaleDto implements CreateSaleInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'UUID opcional; si no se envía, lo genera el servidor.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El identificador no es válido.' })
  id?: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser CASH o YAPE.' })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'ISO 8601. Por defecto, ahora.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha no es válida.' })
  occurredAt?: string;

  @ApiPropertyOptional({ maxLength: MAX_SALE_TEXT })
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto.' })
  @MaxLength(MAX_SALE_TEXT, { message: `La nota admite hasta ${MAX_SALE_TEXT} caracteres.` })
  note?: string;

  @ApiProperty({ type: [CreateSaleLineDto], minItems: 1, maxItems: MAX_SALE_LINES })
  @IsArray({ message: 'Las líneas deben ser una lista.' })
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un producto.' })
  @ArrayMaxSize(MAX_SALE_LINES, { message: `La venta admite hasta ${MAX_SALE_LINES} productos.` })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleLineDto)
  lines!: CreateSaleLineDto[];
}
