import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_SALE_TEXT } from '../../sales/sales.service';
import type { CreateWashInput } from '../washes.service';

/**
 * Lavado (R5, 06-API.md §2 "Lavados"): tipo, opción de precio y pago. Sin
 * monto (sale de la opción, DEC-55), sin cliente ni placa: `amount`,
 * `unitPrice`, `total`, `customerId`, `vehicleId`, `plate` o cualquier otro
 * campo desconocido se rechaza con 400.
 */
export class CreateWashDto implements CreateWashInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'UUID opcional de la venta; si no se envía, lo genera el servidor.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El identificador no es válido.' })
  id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'El tipo de lavado no es válido.' })
  washTypeId!: string;

  @ApiProperty({ format: 'uuid', description: 'Opción de precio activa del tipo (DEC-55).' })
  @IsUUID('all', { message: 'El precio no es válido.' })
  priceOptionId!: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod, { message: 'El método de pago debe ser CASH o YAPE.' })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    description: 'ISO 8601: momento real del cobro. Por defecto, ahora (DEC-58).',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'La fecha no es válida.' })
  occurredAt?: string;

  @ApiPropertyOptional({ maxLength: MAX_SALE_TEXT })
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto.' })
  @MaxLength(MAX_SALE_TEXT, { message: `La nota admite hasta ${MAX_SALE_TEXT} caracteres.` })
  note?: string;
}
