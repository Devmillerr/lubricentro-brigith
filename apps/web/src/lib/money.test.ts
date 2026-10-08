import { describe, expect, it } from 'vitest';
import { formatAmount } from '@/lib/dashboard/format';
import { formatCentsMoney, formatMoney, toCents } from '@/lib/money';
import { formatCents } from '@/lib/sales/format';

describe('formatMoney: "S/ 25,474.50" en toda la app', () => {
  it('pone coma de miles y punto decimal, con 2 decimales', () => {
    expect(formatMoney('25474.5')).toBe('S/ 25,474.50');
    expect(formatMoney('1234567.89')).toBe('S/ 1,234,567.89');
    expect(formatMoney('99999999.99')).toBe('S/ 99,999,999.99');
  });

  it('sin miles no cambia nada respecto de antes', () => {
    expect(formatMoney('0')).toBe('S/ 0.00');
    expect(formatMoney('8')).toBe('S/ 8.00');
    expect(formatMoney('25.5')).toBe('S/ 25.50');
    expect(formatMoney('999.99')).toBe('S/ 999.99');
  });

  it('acepta números ya calculados y redondea a 2 decimales como toFixed', () => {
    expect(formatMoney(25474.5)).toBe('S/ 25,474.50');
    expect(formatMoney(5.75)).toBe('S/ 5.75');
    expect(formatMoney(10 / 3)).toBe('S/ 3.33');
    expect(formatMoney(2 / 3)).toBe('S/ 0.67');
  });

  it('un negativo lleva el signo delante del símbolo', () => {
    expect(formatMoney('-1500')).toBe('-S/ 1,500.00');
  });

  it('un valor que no es número se muestra tal cual', () => {
    expect(formatMoney('abc')).toBe('S/ abc');
  });
});

describe('las demás entradas dan el mismo formato', () => {
  it('céntimos, montos del dashboard y montos de venta coinciden', () => {
    expect(formatCentsMoney(2547450)).toBe('S/ 25,474.50');
    expect(formatCents(2547450)).toBe('S/ 25,474.50');
    expect(formatAmount('25474.50')).toBe('S/ 25,474.50');
    expect(formatCentsMoney(5)).toBe('S/ 0.05');
  });

  it('toCents convierte sin pasar por float', () => {
    expect(toCents('25474.5')).toBe(2547450);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('-12.34')).toBe(-1234);
    expect(toCents('7')).toBe(700);
  });
});
