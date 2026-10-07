import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MONEY,
  MAX_MONEY_MESSAGE,
  MAX_QUANTITY,
  MAX_QUANTITY_MESSAGE,
} from '../../common/decimal-limits';
import { MAX_RECEIPT_LINES, type ReceiptBatchInput } from '../inventory.service';

/**
 * Una línea de la recepción: producto, cantidad recibida (BR-P6) y, si se
 * conoce, cuánto se pagó en total por esa línea (DEC-90).
 */
export class ReceiptLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'El producto no es válido.' })
  productId!: string;

  @ApiProperty({
    description: 'Mayor que 0. Admite decimales (litros).',
    minimum: 0,
    exclusiveMinimum: true,
    maximum: MAX_QUANTITY,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un número.' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0.' })
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  quantity!: number;

  @ApiPropertyOptional({
    description:
      'Total pagado por la línea (no por unidad), en soles. Opcional: sin monto, la línea se registra igual (DEC-90).',
    minimum: 0,
    maximum: MAX_MONEY,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe ser un número con hasta 2 decimales.' },
  )
  @Min(0, { message: 'El monto no puede ser negativo.' })
  @Max(MAX_MONEY, { message: MAX_MONEY_MESSAGE })
  purchaseCost?: number;
}

/**
 * Recepción en lote (R3, 06-API.md §2 "Cambios de R3"): de 1 a 100 líneas,
 * sin productos repetidos (el servicio responde `DUPLICATE_PRODUCT_LINE`).
 * Sin proveedor; el monto pagado es opcional por línea (DEC-90, reabre
 * DEC-36). Los mensajes van en español porque la web los muestra junto al
 * campo.
 */
export class CreateReceiptDto implements ReceiptBatchInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'UUID opcional; si no se envía, lo genera el servidor.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El identificador no es válido.' })
  id?: string;

  @ApiPropertyOptional({ description: 'ISO 8601. Por defecto, ahora.' })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha no es válida.' })
  occurredAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto.' })
  @MaxLength(500, { message: 'La nota admite hasta 500 caracteres.' })
  note?: string;

  @ApiProperty({ type: [ReceiptLineDto], minItems: 1, maxItems: MAX_RECEIPT_LINES })
  @IsArray({ message: 'Las líneas deben ser una lista.' })
  @ArrayMinSize(1, { message: 'La recepción debe tener al menos un producto.' })
  @ArrayMaxSize(MAX_RECEIPT_LINES, {
    message: `La recepción admite hasta ${MAX_RECEIPT_LINES} productos.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}
