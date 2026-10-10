import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, PaymentTerms } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  Matches,
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
import { DATE_ONLY_PATTERN } from '../../common/date-only';
import { MAX_RECEIPT_LINES, type ReceiptBatchInput } from '../inventory.service';

export { DATE_ONLY_PATTERN };

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
 * Qué hacer con un producto que tiene conteos o ajustes posteriores a la fecha
 * de la recepción (R8, DEC-96). `SET_PHYSICAL` exige la cantidad que hay hoy
 * en el estante; `ADD_TO_STOCK` no la admite.
 */
export class LaterStockChoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'El producto no es válido.' })
  productId!: string;

  @ApiProperty({ enum: ['ADD_TO_STOCK', 'SET_PHYSICAL'] })
  @IsIn(['ADD_TO_STOCK', 'SET_PHYSICAL'], { message: 'La opción no es válida.' })
  resolution!: 'ADD_TO_STOCK' | 'SET_PHYSICAL';

  @ApiPropertyOptional({
    description: 'Solo con SET_PHYSICAL: cantidad en el estante (0 o más, hasta 3 decimales).',
    minimum: 0,
    maximum: MAX_QUANTITY,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La cantidad debe ser un número con hasta 3 decimales.' },
  )
  @Min(0, { message: 'La cantidad no puede ser negativa.' })
  @Max(MAX_QUANTITY, { message: MAX_QUANTITY_MESSAGE })
  physicalQuantity?: number;
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Proveedor activo del negocio (R8).' })
  @IsOptional()
  @IsUUID('all', { message: 'El proveedor no es válido.' })
  supplierId?: string;

  @ApiPropertyOptional({
    maxLength: 40,
    description:
      'Número de comprobante (R8). Exige proveedor. Se guarda en mayúsculas y sin espacios; único por proveedor entre recepciones no anuladas.',
  })
  @IsOptional()
  @IsString({ message: 'El comprobante debe ser texto.' })
  @MaxLength(40, { message: 'El comprobante admite hasta 40 caracteres.' })
  documentRef?: string;

  @ApiPropertyOptional({
    example: '2026-09-15',
    description:
      'Fecha de compra del comprobante, YYYY-MM-DD (R8). No posterior a hoy en la zona del negocio. Sin ella vale la fecha de recepción.',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'La fecha de compra debe tener el formato AAAA-MM-DD.' })
  purchaseDate?: string;

  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    description:
      'Moneda de los montos (R8). Sin ella, soles. Obligatoria en una compra al crédito.',
  })
  @IsOptional()
  @IsIn(Object.values(Currency), { message: 'La moneda no es válida.' })
  currency?: Currency;

  @ApiPropertyOptional({
    description: 'Solo en USD: tipo de cambio del día de la compra (soles por 1 USD), opcional.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'El tipo de cambio admite hasta 4 decimales.' })
  purchaseExchangeRate?: number;

  @ApiPropertyOptional({
    enum: PaymentTerms,
    enumName: 'PaymentTerms',
    description: 'CREDIT crea la deuda con el proveedor en la misma operación (R8, DEC-98).',
  })
  @IsOptional()
  @IsIn(Object.values(PaymentTerms), { message: 'La condición de pago no es válida.' })
  paymentTerms?: PaymentTerms;

  @ApiPropertyOptional({
    example: '2026-10-30',
    description:
      'Solo al crédito: vencimiento pactado distinto de fecha base + 30 días (con motivo).',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'La fecha de vencimiento debe tener el formato AAAA-MM-DD.',
  })
  dueDate?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto.' })
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres.' })
  dueDateReason?: string;

  @ApiProperty({ type: [ReceiptLineDto], minItems: 1, maxItems: MAX_RECEIPT_LINES })
  @IsArray({ message: 'Las líneas deben ser una lista.' })
  @ArrayMinSize(1, { message: 'La recepción debe tener al menos un producto.' })
  @ArrayMaxSize(MAX_RECEIPT_LINES, {
    message: `La recepción admite hasta ${MAX_RECEIPT_LINES} productos.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];

  @ApiPropertyOptional({
    type: [LaterStockChoiceDto],
    description:
      'Solo tras un 409 LATER_STOCK_CHECKS_FOUND: una opción por cada producto listado (R8, DEC-96).',
  })
  @IsOptional()
  @IsArray({ message: 'Las opciones deben ser una lista.' })
  @ArrayMaxSize(MAX_RECEIPT_LINES)
  @ValidateNested({ each: true })
  @Type(() => LaterStockChoiceDto)
  laterStockChecks?: LaterStockChoiceDto[];

  @ApiPropertyOptional({
    description:
      'Solo tras un 409 POSSIBLE_DUPLICATE_RECEIPT: registrar igual, sabiendo que se parece a otra recepción (R8).',
  })
  @IsOptional()
  @IsBoolean({ message: 'La confirmación debe ser verdadero o falso.' })
  acknowledgePossibleDuplicate?: boolean;
}

/** Anulación de una recepción (R8, DEC-97): el motivo es obligatorio. */
export class VoidReceiptDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString({ message: 'El motivo debe ser texto.' })
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres.' })
  reason!: string;
}

/**
 * Datos de compra de una recepción ya registrada (R8, DEC-95, BR-K5): cada
 * campo solo pasa de vacío a valor y nunca cambia el stock.
 */
export class ReceiptPurchaseInfoDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'El proveedor no es válido.' })
  supplierId?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString({ message: 'El comprobante debe ser texto.' })
  @MaxLength(40, { message: 'El comprobante admite hasta 40 caracteres.' })
  documentRef?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'La fecha de compra debe tener el formato AAAA-MM-DD.' })
  purchaseDate?: string;
}
