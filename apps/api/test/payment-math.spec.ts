import { Prisma } from '@prisma/client';
import { ProblemException } from '../src/common/exceptions/problem.exception';
import {
  appliedAmountOf,
  fxDifferenceOf,
  maxPayableAmount,
  planPayment,
} from '../src/payables/payment-math';

const d = (v: string | number) => new Prisma.Decimal(v);

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as ProblemException).code;
  }
  return 'ok';
}

/** Cálculo de pagos (R8, DEC-99, D12, DEC-100): sin base de datos. */
describe('appliedAmountOf', () => {
  it('misma moneda: lo pagado', () => {
    expect(appliedAmountOf(d('120.50'), 'PEN', 'PEN', null).toFixed(2)).toBe('120.50');
  });
  it('deuda USD pagada en PEN: soles ÷ tipo de cambio, half-up a 2 decimales', () => {
    expect(appliedAmountOf(d('750.00'), 'PEN', 'USD', d('3.75')).toFixed(2)).toBe('200.00');
    expect(appliedAmountOf(d('100.00'), 'PEN', 'USD', d('3.3333')).toFixed(2)).toBe('30.00');
    // 1.125 → 1.13 (half-up, no al par)
    expect(appliedAmountOf(d('4.50'), 'PEN', 'USD', d('4')).toFixed(2)).toBe('1.13');
  });
  it('deuda PEN pagada en USD: dólares × tipo de cambio', () => {
    expect(appliedAmountOf(d('10.00'), 'USD', 'PEN', d('3.7525')).toFixed(2)).toBe('37.53');
  });
});

describe('planPayment (L1 a L8)', () => {
  const base = { balance: d('300.00'), settlesBalance: false };
  it('L1 misma moneda dentro del saldo; L2 sobrepago', () => {
    expect(
      planPayment({
        ...base,
        amountPaid: d(300),
        paymentCurrency: 'USD',
        debtCurrency: 'USD',
        rate: null,
      }).appliedAmount.toFixed(2),
    ).toBe('300.00');
    expect(
      codeOf(() =>
        planPayment({
          ...base,
          amountPaid: d('300.01'),
          paymentCurrency: 'USD',
          debtCurrency: 'USD',
          rate: null,
        }),
      ),
    ).toBe('OVERPAYMENT');
  });
  it('L3 misma moneda con "cancela el saldo": 400', () => {
    expect(
      codeOf(() =>
        planPayment({
          ...base,
          amountPaid: d(300),
          paymentCurrency: 'PEN',
          debtCurrency: 'PEN',
          rate: null,
          settlesBalance: true,
          settlementReason: 'abc',
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });
  it('L4 parcial; L5 sobrepago con el máximo admisible', () => {
    const plan = planPayment({
      ...base,
      amountPaid: d('750.00'),
      paymentCurrency: 'PEN',
      debtCurrency: 'USD',
      rate: d('3.75'),
    });
    expect(plan.appliedAmount.toFixed(2)).toBe('200.00');
    try {
      planPayment({
        ...base,
        amountPaid: d('1200.00'),
        paymentCurrency: 'PEN',
        debtCurrency: 'USD',
        rate: d('3.80'),
      });
      throw new Error('no');
    } catch (error) {
      expect((error as ProblemException).code).toBe('OVERPAYMENT');
      expect((error as ProblemException).data).toMatchObject({
        balance: '300.00',
        maxAmountPaid: '1140.01',
      });
    }
  });
  it('L6 liquidación de un céntimo con motivo; L7 más de un céntimo; L8 sin motivo', () => {
    // 1140.00 / 3.8 = 300.00; 1139.97 / 3.8 = 299.99 (a un céntimo del saldo)
    const plan = planPayment({
      ...base,
      amountPaid: d('1139.97'),
      paymentCurrency: 'PEN',
      debtCurrency: 'USD',
      rate: d('3.8'),
      settlesBalance: true,
      settlementReason: 'Redondeo del banco',
    });
    expect(plan.computedAppliedAmount.toFixed(2)).toBe('299.99');
    expect(plan.appliedAmount.toFixed(2)).toBe('300.00');
    expect(
      codeOf(() =>
        planPayment({
          ...base,
          amountPaid: d('1139.90'),
          paymentCurrency: 'PEN',
          debtCurrency: 'USD',
          rate: d('3.8'),
          settlesBalance: true,
          settlementReason: 'abc',
        }),
      ),
    ).toBe('SETTLEMENT_MISMATCH');
    expect(
      codeOf(() =>
        planPayment({
          ...base,
          amountPaid: d('1139.97'),
          paymentCurrency: 'PEN',
          debtCurrency: 'USD',
          rate: d('3.8'),
          settlesBalance: true,
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });
  it('sin "cancela el saldo", un céntimo de menos deja la deuda parcial (no se cierra sola)', () => {
    const plan = planPayment({
      ...base,
      amountPaid: d('1139.97'),
      paymentCurrency: 'PEN',
      debtCurrency: 'USD',
      rate: d('3.8'),
    });
    expect(plan.appliedAmount.toFixed(2)).toBe('299.99');
  });
  it('pago que redondea a 0: PAYMENT_TOO_SMALL', () => {
    expect(
      codeOf(() =>
        planPayment({
          ...base,
          amountPaid: d('0.01'),
          paymentCurrency: 'PEN',
          debtCurrency: 'USD',
          rate: d('3.8'),
        }),
      ),
    ).toBe('PAYMENT_TOO_SMALL');
  });
});

describe('maxPayableAmount', () => {
  it('el máximo nunca aplica más que el saldo y un céntimo más sí lo supera', () => {
    for (const rate of ['3.75', '3.8', '3.3333', '3.7525']) {
      const max = maxPayableAmount(d('300.00'), 'PEN', 'USD', d(rate));
      expect(appliedAmountOf(max, 'PEN', 'USD', d(rate)).lessThanOrEqualTo(300)).toBe(true);
      expect(appliedAmountOf(max.plus('0.01'), 'PEN', 'USD', d(rate)).greaterThan(300)).toBe(true);
    }
  });
});

describe('fxDifferenceOf (DEC-100)', () => {
  it('deuda USD pagada en PEN con referencia: pagado − aplicado × referencia', () => {
    expect(
      fxDifferenceOf({
        debtCurrency: 'USD',
        paymentCurrency: 'PEN',
        amountPaid: d('750.00'),
        appliedAmount: d('200.00'),
        referenceRate: d('3.70'),
      }),
    ).toEqual({ status: 'CALCULATED', amountPen: '10.00' });
    expect(
      fxDifferenceOf({
        debtCurrency: 'USD',
        paymentCurrency: 'PEN',
        amountPaid: d('1140.00'),
        appliedAmount: d('300.00'),
        referenceRate: d('3.70'),
      }),
    ).toEqual({ status: 'CALCULATED', amountPen: '30.00' });
  });
  it('sin referencia: no se puede calcular; otras combinaciones: no aplica', () => {
    expect(
      fxDifferenceOf({
        debtCurrency: 'USD',
        paymentCurrency: 'PEN',
        amountPaid: d(1),
        appliedAmount: d(1),
        referenceRate: null,
      }).status,
    ).toBe('NOT_CALCULABLE');
    expect(
      fxDifferenceOf({
        debtCurrency: 'USD',
        paymentCurrency: 'USD',
        amountPaid: d(1),
        appliedAmount: d(1),
        referenceRate: d(3.7),
      }).status,
    ).toBe('NOT_APPLICABLE');
    expect(
      fxDifferenceOf({
        debtCurrency: 'PEN',
        paymentCurrency: 'USD',
        amountPaid: d(1),
        appliedAmount: d(3.7),
        referenceRate: null,
      }).status,
    ).toBe('NOT_APPLICABLE');
    expect(
      fxDifferenceOf({
        debtCurrency: 'PEN',
        paymentCurrency: 'PEN',
        amountPaid: d(1),
        appliedAmount: d(1),
        referenceRate: null,
      }).status,
    ).toBe('NOT_APPLICABLE');
  });
});
