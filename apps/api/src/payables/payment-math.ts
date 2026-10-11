import { HttpStatus } from '@nestjs/common';
import { Prisma, type Currency } from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
} from '../common/exceptions/problem.exception';

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** Tolerancia de una liquidación por redondeo (D12): un céntimo de la moneda de la deuda. */
export const SETTLEMENT_TOLERANCE = new D('0.01');

const round2 = (value: Dec) => value.toDecimalPlaces(2, D.ROUND_HALF_UP);

/**
 * Monto aplicado a la deuda, en su moneda (DEC-99): misma moneda, lo pagado;
 * deuda en USD pagada en PEN, soles ÷ tipo de cambio; deuda en PEN pagada en
 * USD, dólares × tipo de cambio. Un solo redondeo half-up a 2 decimales.
 */
export function appliedAmountOf(
  amountPaid: Dec,
  paymentCurrency: Currency,
  debtCurrency: Currency,
  rate: Dec | null,
): Dec {
  if (paymentCurrency === debtCurrency) return amountPaid;
  if (!rate) throw new Error('Falta el tipo de cambio');
  return debtCurrency === 'USD'
    ? round2(amountPaid.dividedBy(rate))
    : round2(amountPaid.times(rate));
}

/**
 * Mayor monto en la moneda del pago cuyo aplicado no supera el saldo (para el
 * mensaje de sobrepago). Se busca por céntimos desde una estimación.
 */
export function maxPayableAmount(
  balance: Dec,
  paymentCurrency: Currency,
  debtCurrency: Currency,
  rate: Dec | null,
): Dec {
  if (paymentCurrency === debtCurrency || !rate) return balance;
  let candidate =
    debtCurrency === 'USD'
      ? balance.plus('0.005').times(rate).toDecimalPlaces(2, D.ROUND_DOWN)
      : balance.plus('0.005').dividedBy(rate).toDecimalPlaces(2, D.ROUND_DOWN);
  while (
    candidate.greaterThan(0) &&
    appliedAmountOf(candidate, paymentCurrency, debtCurrency, rate).greaterThan(balance)
  ) {
    candidate = candidate.minus('0.01');
  }
  return candidate;
}

export interface PaymentPlan {
  computedAppliedAmount: Dec;
  appliedAmount: Dec;
}

/**
 * Reglas L1–L8 de un pago (DEC-99, D12). Nunca hay cierres silenciosos ni
 * sobrepagos encubiertos: con la misma moneda no existe redondeo; con monedas
 * distintas, "cancela el saldo" admite hasta un céntimo de diferencia y exige
 * motivo; todo lo demás que supere el saldo es un sobrepago.
 */
export function planPayment(params: {
  balance: Dec;
  amountPaid: Dec;
  paymentCurrency: Currency;
  debtCurrency: Currency;
  rate: Dec | null;
  settlesBalance: boolean;
  settlementReason?: string;
}): PaymentPlan {
  const { balance, amountPaid, paymentCurrency, debtCurrency, rate, settlesBalance } = params;
  const sameCurrency = paymentCurrency === debtCurrency;
  if (settlesBalance && sameCurrency) {
    throw new ValidationProblemException([
      {
        field: 'settlesBalance',
        message: 'Con la misma moneda no hay redondeo: paga el saldo exacto.',
      },
    ]);
  }
  if (settlesBalance && (params.settlementReason ?? '').trim().length < 3) {
    throw new ValidationProblemException([
      {
        field: 'settlementReason',
        message: 'Escribe por qué se cancela el saldo con esta diferencia.',
      },
    ]);
  }
  const computed = appliedAmountOf(amountPaid, paymentCurrency, debtCurrency, rate);
  if (computed.lessThanOrEqualTo(0)) {
    throw new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: 'PAYMENT_TOO_SMALL',
      title: 'El pago es demasiado pequeño',
      detail: 'Convertido a la moneda de la deuda, el pago redondea a 0.',
      errors: [{ field: 'amountPaid', message: 'El pago redondea a 0 en la moneda de la deuda.' }],
    });
  }
  if (settlesBalance) {
    if (computed.minus(balance).abs().greaterThan(SETTLEMENT_TOLERANCE)) {
      throw new ProblemException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'SETTLEMENT_MISMATCH',
        title: 'La diferencia con el saldo es mayor que un céntimo',
        detail: 'Solo se cancela el saldo con una diferencia de redondeo de hasta un céntimo.',
        data: { balance: balance.toFixed(2), computedAppliedAmount: computed.toFixed(2) },
      });
    }
    return { computedAppliedAmount: computed, appliedAmount: balance };
  }
  if (computed.greaterThan(balance)) {
    throw new ProblemException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'OVERPAYMENT',
      title: 'El pago supera el saldo de la deuda',
      data: {
        balance: balance.toFixed(2),
        computedAppliedAmount: computed.toFixed(2),
        maxAmountPaid: maxPayableAmount(balance, paymentCurrency, debtCurrency, rate).toFixed(2),
      },
    });
  }
  return { computedAppliedAmount: computed, appliedAmount: computed };
}

export type FxDifference =
  | { status: 'CALCULATED'; amountPen: string }
  | { status: 'NOT_CALCULABLE'; amountPen: null }
  | { status: 'NOT_APPLICABLE'; amountPen: null };

/**
 * Diferencia cambiaria informativa de un pago (DEC-100, §2.6 del plan): solo
 * deuda en USD pagada en PEN con tipo de cambio de referencia; ambos términos
 * en soles. Positiva: se pagaron más soles que al tipo de cambio de la compra.
 */
export function fxDifferenceOf(params: {
  debtCurrency: Currency;
  paymentCurrency: Currency;
  amountPaid: Dec;
  appliedAmount: Dec;
  referenceRate: Dec | null;
}): FxDifference {
  if (params.debtCurrency !== 'USD' || params.paymentCurrency !== 'PEN') {
    return { status: 'NOT_APPLICABLE', amountPen: null };
  }
  if (!params.referenceRate) return { status: 'NOT_CALCULABLE', amountPen: null };
  const atPurchase = round2(params.appliedAmount.times(params.referenceRate));
  return { status: 'CALCULATED', amountPen: params.amountPaid.minus(atPurchase).toFixed(2) };
}
