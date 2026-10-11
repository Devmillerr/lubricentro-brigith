import { HttpStatus } from '@nestjs/common';
import {
  Prisma,
  type Currency,
  type PayableAmountSource,
  type SupplierPayable,
} from '@prisma/client';
import { addDays, fromDbDate, isDateOnly, toDbDate } from '../common/date-only';
import { MAX_MONEY } from '../common/decimal-limits';
import {
  ProblemException,
  ValidationProblemException,
  type FieldError,
} from '../common/exceptions/problem.exception';
import type { ScopedTransaction } from '../prisma/business-scope';

/** Plazo predeterminado confirmado por el usuario (C-A, DEC-98): 30 días calendario. */
export const DEFAULT_TERM_DAYS = 30;

/** Aviso sin bloqueo para un tipo de cambio fuera de este rango (DEC-99, D28). */
export const EXCHANGE_RATE_WARNING_RANGE = { min: 2.5, max: 5 } as const;

export type PayableStatus = 'VOIDED' | 'PAID' | 'OVERDUE' | 'PARTIAL' | 'PENDING';

/** Días hasta el vencimiento en que una deuda abierta cuenta como "por vencer". */
export const DUE_SOON_DAYS = 7;

/**
 * Estado calculado al leer (BR-K16): anulada → pagada (saldo 0) → vencida (hoy
 * posterior al vencimiento) → parcial (con pagos) → pendiente. El mismo día del
 * vencimiento todavía no está vencida.
 */
export function payableStatus(
  payable: Pick<SupplierPayable, 'voidedAt' | 'originalAmount' | 'paidAmount' | 'dueDate'>,
  today: string,
): PayableStatus {
  if (payable.voidedAt) return 'VOIDED';
  const original = new Prisma.Decimal(payable.originalAmount);
  const paid = new Prisma.Decimal(payable.paidAmount);
  if (paid.greaterThanOrEqualTo(original)) return 'PAID';
  if (today > fromDbDate(payable.dueDate)) return 'OVERDUE';
  if (paid.greaterThan(0)) return 'PARTIAL';
  return 'PENDING';
}

export function payableBalance(
  payable: Pick<SupplierPayable, 'originalAmount' | 'paidAmount'>,
): Prisma.Decimal {
  return new Prisma.Decimal(payable.originalAmount).minus(payable.paidAmount);
}

/** Monto de dinero: > 0, hasta 2 decimales y no mayor al máximo (DEC-98). */
export function assertPositiveMoney(value: number, field: string, message: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(String(value));
  if (
    !Number.isFinite(value) ||
    decimal.lessThanOrEqualTo(0) ||
    decimal.decimalPlaces() > 2 ||
    decimal.greaterThan(MAX_MONEY)
  ) {
    throw new ValidationProblemException([{ field, message }]);
  }
  return decimal;
}

/** Tipo de cambio: soles por 1 USD, > 0, hasta 4 decimales (DEC-99). */
export function assertExchangeRate(value: number, field: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(String(value));
  if (
    !Number.isFinite(value) ||
    decimal.lessThanOrEqualTo(0) ||
    decimal.decimalPlaces() > 4 ||
    decimal.greaterThan(9999)
  ) {
    throw new ValidationProblemException([
      { field, message: 'El tipo de cambio debe ser mayor que 0, con hasta 4 decimales.' },
    ]);
  }
  return decimal;
}

export function exchangeRateWarning(rate: Prisma.Decimal | null): string | null {
  if (rate === null) return null;
  if (
    rate.lessThan(EXCHANGE_RATE_WARNING_RANGE.min) ||
    rate.greaterThan(EXCHANGE_RATE_WARNING_RANGE.max)
  ) {
    return 'EXCHANGE_RATE_OUT_OF_RANGE';
  }
  return null;
}

/** Datos con los que nace una deuda (compra al crédito o recepción existente). */
export interface PayableDraftInput {
  currency: Currency;
  amount: Prisma.Decimal;
  amountSource: PayableAmountSource;
  /** Fecha de compra de la recepción (o la de recepción en la zona del negocio). */
  purchaseDate: string;
  /** Otra fecha base (D34), con motivo. */
  issueDate?: string;
  issueDateReason?: string;
  /** Vencimiento pactado distinto del plazo predeterminado, con motivo. */
  dueDate?: string;
  dueDateReason?: string;
  referenceExchangeRate?: number;
}

export interface PayableDraft {
  currency: Currency;
  originalAmount: Prisma.Decimal;
  amountSource: PayableAmountSource;
  issueDate: string;
  issueDateReason: string | null;
  termDays: number;
  dueDate: string;
  dueDateSource: 'DEFAULT_TERM' | 'AGREED';
  dueDateReason: string;
  referenceExchangeRate: Prisma.Decimal | null;
}

const reasonOf = (value: string | undefined) => (value ?? '').trim();

/**
 * Fecha base y vencimiento (BR-K2, BR-K8): base = la fecha de compra salvo
 * otra con motivo; vencimiento = base + 30 días calendario, salvo uno pactado
 * (≥ base) con motivo. Ninguna fecha posterior a hoy salvo el vencimiento.
 */
export function buildPayableDraft(input: PayableDraftInput, today: string): PayableDraft {
  const errors: FieldError[] = [];
  let issueDate = input.purchaseDate;
  let issueDateReason: string | null = null;
  if (input.issueDate !== undefined && input.issueDate !== input.purchaseDate) {
    if (!isDateOnly(input.issueDate)) {
      errors.push({ field: 'issueDate', message: 'La fecha base no es válida.' });
    } else if (input.issueDate > today) {
      errors.push({ field: 'issueDate', message: 'La fecha base no puede ser futura.' });
    } else if (reasonOf(input.issueDateReason).length < 3) {
      errors.push({
        field: 'issueDateReason',
        message: 'Explica por qué la fecha base no es la de compra.',
      });
    } else {
      issueDate = input.issueDate;
      issueDateReason = reasonOf(input.issueDateReason).slice(0, 500);
    }
  }

  const defaultDue = addDays(issueDate, DEFAULT_TERM_DAYS);
  let dueDate = defaultDue;
  let dueDateSource: 'DEFAULT_TERM' | 'AGREED' = 'DEFAULT_TERM';
  let dueDateReason = `Plazo predeterminado de ${DEFAULT_TERM_DAYS} días`;
  if (input.dueDate !== undefined && input.dueDate !== defaultDue) {
    if (!isDateOnly(input.dueDate)) {
      errors.push({ field: 'dueDate', message: 'La fecha de vencimiento no es válida.' });
    } else if (input.dueDate < issueDate) {
      errors.push({
        field: 'dueDate',
        message: 'El vencimiento no puede ser anterior a la fecha base.',
      });
    } else if (reasonOf(input.dueDateReason).length < 3) {
      errors.push({
        field: 'dueDateReason',
        message: 'Escribe por qué el vencimiento pactado es otro (por ejemplo, "45 días").',
      });
    } else {
      dueDate = input.dueDate;
      dueDateSource = 'AGREED';
      dueDateReason = reasonOf(input.dueDateReason).slice(0, 500);
    }
  }

  let referenceExchangeRate: Prisma.Decimal | null = null;
  if (input.referenceExchangeRate !== undefined) {
    if (input.currency !== 'USD') {
      errors.push({
        field: 'referenceExchangeRate',
        message: 'El tipo de cambio de referencia solo aplica a deudas en dólares.',
      });
    } else {
      referenceExchangeRate = assertExchangeRate(
        input.referenceExchangeRate,
        'referenceExchangeRate',
      );
    }
  }
  if (errors.length > 0) throw new ValidationProblemException(errors);

  return {
    currency: input.currency,
    originalAmount: input.amount,
    amountSource: input.amountSource,
    issueDate,
    issueDateReason,
    termDays: DEFAULT_TERM_DAYS,
    dueDate,
    dueDateSource,
    dueDateReason,
    referenceExchangeRate,
  };
}

/**
 * Crea la deuda y su fila `INITIAL` del historial, dentro de la transacción de
 * quien la origina (la recepción ya bloqueada). El índice parcial impide una
 * segunda deuda activa para la misma recepción.
 */
export async function createPayable(
  tx: ScopedTransaction,
  params: {
    businessId: string;
    userId: string;
    supplierId: string;
    receiptId: string;
    draft: PayableDraft;
  },
): Promise<SupplierPayable> {
  const { draft } = params;
  const existing = await tx.supplierPayable.findFirst({
    where: { receiptId: params.receiptId, voidedAt: null },
    select: { id: true },
  });
  if (existing) throw payableAlreadyExists(existing.id);
  try {
    const payable = await tx.supplierPayable.create({
      data: {
        // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
        businessId: params.businessId,
        supplierId: params.supplierId,
        receiptId: params.receiptId,
        currency: draft.currency,
        originalAmount: draft.originalAmount,
        amountSource: draft.amountSource,
        issueDate: toDbDate(draft.issueDate),
        issueDateReason: draft.issueDateReason,
        termDays: draft.termDays,
        dueDate: toDbDate(draft.dueDate),
        dueDateSource: draft.dueDateSource,
        referenceExchangeRate: draft.referenceExchangeRate,
        createdById: params.userId,
      },
    });
    await tx.supplierPayableDueDateChange.create({
      data: {
        businessId: params.businessId,
        payableId: payable.id,
        kind: 'INITIAL',
        previousDueDate: null,
        newDueDate: toDbDate(draft.dueDate),
        reason: draft.dueDateReason,
        createdById: params.userId,
      },
    });
    return payable;
  } catch (error) {
    if (isOpenPayableViolation(error)) throw payableAlreadyExists();
    throw error;
  }
}

export function payableAlreadyExists(payableId?: string): ProblemException {
  return new ProblemException({
    status: HttpStatus.CONFLICT,
    code: 'PAYABLE_ALREADY_EXISTS',
    title: 'Esta recepción ya tiene una deuda',
    ...(payableId ? { data: { payableId } } : {}),
  });
}

export function isOpenPayableViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    /receiptId|supplier_payables_receipt_open_key/.test(
      JSON.stringify(error.meta ?? {}) + error.message,
    )
  );
}

export function payableNotFound(): ProblemException {
  return new ProblemException({
    status: HttpStatus.NOT_FOUND,
    code: 'PAYABLE_NOT_FOUND',
    title: 'Deuda no encontrada',
  });
}
