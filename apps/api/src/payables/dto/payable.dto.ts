import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Currency,
  DueDateChangeKind,
  DueDateSource,
  PayableAmountSource,
  SupplierPaymentMethod,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../common/date-only';

const DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD.';

export const PAYABLE_STATUSES = [
  'OPEN',
  'PENDING',
  'PARTIAL',
  'OVERDUE',
  'PAID',
  'VOIDED',
] as const;
export type PayableStatusFilter = (typeof PAYABLE_STATUSES)[number];

export class ListPayablesQueryDto {
  @ApiPropertyOptional({
    enum: PAYABLE_STATUSES,
    description: 'OPEN = pendientes, parciales y vencidas (por pagar). Sin filtro: todas.',
  })
  @IsOptional()
  @IsIn(PAYABLE_STATUSES, { message: 'El estado no es válido.' })
  status?: PayableStatusFilter;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'El proveedor no es válido.' })
  supplierId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'La recepción no es válida.' })
  receiptId?: string;
}

/** Deuda de una recepción ya registrada (R8, DEC-98, D22/D30): monto y moneda escritos. */
export class CreateReceiptPayableDto {
  @ApiProperty({ enum: Currency, enumName: 'Currency' })
  @IsIn(Object.values(Currency), { message: 'Elige la moneda de la deuda.' })
  currency!: Currency;

  @ApiProperty({ description: 'Monto total de la deuda (> 0, hasta 2 decimales).' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe ser un número con hasta 2 decimales.' },
  )
  amount!: number;

  @ApiPropertyOptional({ example: '2026-09-15', description: 'Otra fecha base (con motivo).' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_MESSAGE })
  issueDate?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  issueDateReason?: string;

  @ApiPropertyOptional({ example: '2026-10-15', description: 'Vencimiento pactado (con motivo).' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_MESSAGE })
  dueDate?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dueDateReason?: string;

  @ApiPropertyOptional({ description: 'Solo en USD: soles por 1 USD, hasta 4 decimales.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'El tipo de cambio admite hasta 4 decimales.' })
  referenceExchangeRate?: number;
}

export class ChangeDueDateDto {
  @ApiProperty({ example: '2026-10-30' })
  @Matches(DATE_ONLY_PATTERN, { message: DATE_MESSAGE })
  dueDate!: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString({ message: 'El motivo debe ser texto.' })
  @MinLength(3, { message: 'Escribe el motivo del cambio (al menos 3 caracteres).' })
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres.' })
  reason!: string;
}

export class VoidPayableDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString({ message: 'El motivo debe ser texto.' })
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres.' })
  reason!: string;
}

export class PayableSupplierResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class PayableReceiptResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, format: 'date-time' }) occurredAt!: Date;
  @ApiProperty({ type: String, nullable: true }) documentRef!: string | null;
}

export class PayableResponse {
  @ApiProperty() id!: string;
  @ApiProperty() businessId!: string;
  @ApiProperty() supplierId!: string;
  @ApiProperty({ type: PayableSupplierResponse, nullable: true })
  supplier!: PayableSupplierResponse | null;
  @ApiProperty() receiptId!: string;
  @ApiProperty({ type: PayableReceiptResponse, nullable: true })
  receipt!: PayableReceiptResponse | null;
  @ApiProperty({ enum: Currency, enumName: 'Currency' }) currency!: Currency;
  @ApiProperty({ description: 'Monto original (no cambia nunca), 2 decimales.' })
  originalAmount!: string;
  @ApiProperty({ description: 'Σ de lo aplicado por los pagos activos.' }) paidAmount!: string;
  @ApiProperty({ description: 'Saldo en la moneda de la deuda.' }) balance!: string;
  @ApiProperty({ enum: PayableAmountSource, enumName: 'PayableAmountSource' })
  amountSource!: PayableAmountSource;
  @ApiProperty({ example: '2026-09-15' }) issueDate!: string;
  @ApiProperty({ type: String, nullable: true }) issueDateReason!: string | null;
  @ApiProperty() termDays!: number;
  @ApiProperty({ example: '2026-10-15' }) dueDate!: string;
  @ApiProperty({ enum: DueDateSource, enumName: 'DueDateSource' }) dueDateSource!: DueDateSource;
  @ApiProperty({ type: String, nullable: true }) referenceExchangeRate!: string | null;
  @ApiProperty({ enum: ['VOIDED', 'PAID', 'OVERDUE', 'PARTIAL', 'PENDING'] })
  status!: 'VOIDED' | 'PAID' | 'OVERDUE' | 'PARTIAL' | 'PENDING';
  @ApiProperty() createdById!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) voidedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) voidedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) voidReason!: string | null;
}

export class DueDateChangeResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DueDateChangeKind, enumName: 'DueDateChangeKind' })
  kind!: DueDateChangeKind;
  @ApiProperty({ type: String, nullable: true }) previousDueDate!: string | null;
  @ApiProperty() newDueDate!: string;
  @ApiProperty() reason!: string;
  @ApiProperty() createdById!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

/** Pago a un proveedor (R8, DEC-99). */
export class RegisterPaymentDto {
  @ApiProperty({
    example: '2026-10-12',
    description: 'Fecha real del pago, entre la fecha base y hoy.',
  })
  @Matches(DATE_ONLY_PATTERN, { message: DATE_MESSAGE })
  paidOn!: string;

  @ApiProperty({ enum: Currency, enumName: 'Currency', description: 'Moneda de lo entregado.' })
  @IsIn(Object.values(Currency), { message: 'Elige la moneda del pago.' })
  paymentCurrency!: Currency;

  @ApiProperty({ description: 'Lo realmente entregado (> 0, hasta 2 decimales).' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe ser un número con hasta 2 decimales.' },
  )
  amountPaid!: number;

  @ApiPropertyOptional({
    description: 'Soles por 1 USD; obligatorio solo si la moneda del pago difiere de la deuda.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'El tipo de cambio admite hasta 4 decimales.' })
  exchangeRate?: number;

  @ApiProperty({ enum: SupplierPaymentMethod, enumName: 'SupplierPaymentMethod' })
  @IsIn(Object.values(SupplierPaymentMethod), { message: 'Elige el medio de pago.' })
  method!: SupplierPaymentMethod;

  @ApiPropertyOptional({ maxLength: 100, description: 'Número de operación u otra referencia.' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La referencia admite hasta 100 caracteres.' })
  reference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La nota admite hasta 500 caracteres.' })
  note?: string;

  @ApiPropertyOptional({
    description:
      'Cancela el saldo con una diferencia de redondeo de hasta un céntimo (solo con monedas distintas).',
  })
  @IsOptional()
  @IsBoolean()
  settlesBalance?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  settlementReason?: string;
}

export class VoidPaymentDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString({ message: 'El motivo debe ser texto.' })
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres.' })
  reason!: string;
}

export class FxDifferenceResponse {
  @ApiProperty({ enum: ['CALCULATED', 'NOT_CALCULABLE', 'NOT_APPLICABLE'] })
  status!: 'CALCULATED' | 'NOT_CALCULABLE' | 'NOT_APPLICABLE';
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Soles: pagado − aplicado × tipo de cambio de referencia. Informativo.',
  })
  amountPen!: string | null;
}

export class SupplierPaymentResponse {
  @ApiProperty() id!: string;
  @ApiProperty() payableId!: string;
  @ApiProperty({ example: '2026-10-12' }) paidOn!: string;
  @ApiProperty({ enum: Currency, enumName: 'Currency' }) paymentCurrency!: Currency;
  @ApiProperty() amountPaid!: string;
  @ApiProperty({ enum: Currency, enumName: 'Currency' }) debtCurrency!: Currency;
  @ApiProperty({ type: String, nullable: true }) exchangeRate!: string | null;
  @ApiProperty() computedAppliedAmount!: string;
  @ApiProperty() appliedAmount!: string;
  @ApiProperty() settlesBalance!: boolean;
  @ApiProperty({ type: String, nullable: true }) settlementReason!: string | null;
  @ApiProperty({ enum: SupplierPaymentMethod, enumName: 'SupplierPaymentMethod' })
  method!: SupplierPaymentMethod;
  @ApiProperty({ type: String, nullable: true }) reference!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdById!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) voidedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) voidedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) voidReason!: string | null;
  @ApiProperty({ type: FxDifferenceResponse }) fxDifference!: FxDifferenceResponse;
}

export class FxDifferenceTotalResponse {
  @ApiProperty({ description: 'Pagos activos en los que se pudo calcular.' })
  calculatedCount!: number;
  @ApiProperty({ description: 'Pagos activos en soles de una deuda en dólares.' })
  applicableCount!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Suma en soles de las calculadas.' })
  amountPen!: string | null;
}

export class PayableDetailResponse extends PayableResponse {
  @ApiProperty({ type: [DueDateChangeResponse] }) dueDateChanges!: DueDateChangeResponse[];
  @ApiProperty({ type: [SupplierPaymentResponse] }) payments!: SupplierPaymentResponse[];
  @ApiProperty({ type: FxDifferenceTotalResponse }) fxDifferenceTotal!: FxDifferenceTotalResponse;
  @ApiProperty({
    type: [String],
    description: 'Avisos sin bloqueo, p. ej. PAYABLE_ALREADY_OVERDUE.',
  })
  warnings!: string[];
}

export class PayablesCurrencySummaryResponse {
  @ApiProperty({ enum: Currency, enumName: 'Currency' }) currency!: Currency;
  @ApiProperty() openCount!: number;
  @ApiProperty() openBalance!: string;
  @ApiProperty() overdueCount!: number;
  @ApiProperty() overdueBalance!: string;
  @ApiProperty({ description: 'Vencen hoy o en los próximos 7 días.' }) dueSoonCount!: number;
  @ApiProperty() dueSoonBalance!: string;
}

export class PayablesSummaryResponse {
  @ApiProperty({ example: '2026-10-10' }) today!: string;
  @ApiProperty({ type: [PayablesCurrencySummaryResponse] })
  currencies!: PayablesCurrencySummaryResponse[];
}
