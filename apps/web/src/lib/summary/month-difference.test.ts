import { describe, expect, it } from 'vitest';
import {
  exclusionsNote,
  formatDifference,
  monthDifference,
  type MonthDifferenceInput,
} from '@/lib/summary/month-difference';

function input(
  incomeTotal: string,
  purchases: Partial<MonthDifferenceInput['purchases']> = {},
): MonthDifferenceInput {
  return {
    incomeTotal,
    purchases: {
      totalCost: '0.00',
      receiptsWithoutCost: 0,
      linesWithoutCost: 0,
      usd: null,
      ...purchases,
    },
  };
}

describe('monthDifference', () => {
  it('solo soles: ingresos menos compras', () => {
    const result = monthDifference(input('2500.50', { totalCost: '1200.25' }));
    expect(result.incomeCents).toBe(250050);
    expect(result.penPurchasesCents).toBe(120025);
    expect(result.usdPenEquivalentCents).toBe(0);
    expect(result.differenceCents).toBe(130025);
    expect(result.isIncomplete).toBe(false);
  });

  it('resta el equivalente en soles de las compras en dólares con tipo de cambio', () => {
    const result = monthDifference(
      input('3000.00', {
        totalCost: '500.00',
        usd: { receiptCount: 2, totalCost: '200.00', penEquivalent: '750.40', withoutRateCount: 0 },
      }),
    );
    expect(result.usdPenEquivalentCents).toBe(75040);
    expect(result.differenceCents).toBe(300000 - 50000 - 75040);
    expect(result.usdExcludedCount).toBe(0);
    expect(result.isIncomplete).toBe(false);
  });

  it('excluye las compras en dólares sin equivalente y avisa (nunca suma US$ como S/)', () => {
    const none = monthDifference(
      input('1000.00', {
        totalCost: '100.00',
        usd: { receiptCount: 1, totalCost: '300.00', penEquivalent: null, withoutRateCount: 1 },
      }),
    );
    expect(none.usdPenEquivalentCents).toBe(0);
    expect(none.differenceCents).toBe(90000);
    expect(none.usdExcludedCount).toBe(1);
    expect(none.isIncomplete).toBe(true);

    const partial = monthDifference(
      input('1000.00', {
        usd: { receiptCount: 3, totalCost: '300.00', penEquivalent: '375.00', withoutRateCount: 2 },
      }),
    );
    expect(partial.usdPenEquivalentCents).toBe(37500);
    expect(partial.differenceCents).toBe(62500);
    expect(partial.usdExcludedCount).toBe(2);
    expect(partial.isIncomplete).toBe(true);
  });

  it('las recepciones sin monto no se restan y marcan la diferencia como incompleta', () => {
    const result = monthDifference(
      input('800.00', { totalCost: '200.00', receiptsWithoutCost: 2, linesWithoutCost: 2 }),
    );
    expect(result.differenceCents).toBe(60000);
    expect(result.receiptsWithoutCost).toBe(2);
    expect(result.hasPartialLines).toBe(false);
    expect(result.isIncomplete).toBe(true);

    const partialLines = monthDifference(
      input('800.00', { totalCost: '200.00', receiptsWithoutCost: 0, linesWithoutCost: 1 }),
    );
    expect(partialLines.hasPartialLines).toBe(true);
    expect(partialLines.isIncomplete).toBe(true);
  });

  it('sin datos: todo en cero y completo', () => {
    const result = monthDifference(input('0.00'));
    expect(result).toEqual({
      incomeCents: 0,
      penPurchasesCents: 0,
      usdPenEquivalentCents: 0,
      differenceCents: 0,
      usdExcludedCount: 0,
      receiptsWithoutCost: 0,
      hasPartialLines: false,
      isIncomplete: false,
    });
  });

  it('una diferencia negativa queda negativa', () => {
    const result = monthDifference(input('150.00', { totalCost: '1150.75' }));
    expect(result.differenceCents).toBe(-100075);
  });

  it('trabaja en céntimos: sin errores de coma flotante', () => {
    // En float, 0.3 - 0.1 - 0.2 da -2.7755575615628914e-17.
    expect(monthDifference(input('0.30', { totalCost: '0.10' })).differenceCents).toBe(20);
    const result = monthDifference(
      input('0.3', {
        totalCost: '0.1',
        usd: { receiptCount: 1, totalCost: '0.05', penEquivalent: '0.2', withoutRateCount: 0 },
      }),
    );
    expect(result.differenceCents).toBe(0);
    expect(monthDifference(input('1234567.89', { totalCost: '0.01' })).differenceCents).toBe(
      123456788,
    );
  });
});

describe('formatDifference', () => {
  it('usa el signo menos tipográfico solo si es negativa', () => {
    expect(formatDifference(-4450)).toBe('−S/ 44.50');
    expect(formatDifference(25600)).toBe('S/ 256.00');
    expect(formatDifference(0)).toBe('S/ 0.00');
  });
});

describe('exclusionsNote', () => {
  const none = { usdExcludedCount: 0, receiptsWithoutCost: 0, hasPartialLines: false };

  it('sin exclusiones no hay nota', () => {
    expect(exclusionsNote(none)).toBeNull();
  });

  it('junta las partes en una línea y omite las que son 0', () => {
    expect(exclusionsNote({ ...none, usdExcludedCount: 1, receiptsWithoutCost: 1 })).toBe(
      'No incluye: 1 compra en dólares sin tipo de cambio, 1 recepción sin monto.',
    );
    expect(exclusionsNote({ ...none, receiptsWithoutCost: 1 })).toBe(
      'No incluye: 1 recepción sin monto.',
    );
    expect(exclusionsNote({ ...none, usdExcludedCount: 1 })).toBe(
      'No incluye: 1 compra en dólares sin tipo de cambio.',
    );
  });

  it('pluraliza', () => {
    expect(exclusionsNote({ ...none, usdExcludedCount: 2, receiptsWithoutCost: 3 })).toBe(
      'No incluye: 2 compras en dólares sin tipo de cambio, 3 recepciones sin monto.',
    );
  });

  it('avisa de productos sin monto en recepciones con monto parcial', () => {
    expect(exclusionsNote({ ...none, receiptsWithoutCost: 1, hasPartialLines: true })).toBe(
      'No incluye: 1 recepción sin monto, productos sin monto.',
    );
  });
});
