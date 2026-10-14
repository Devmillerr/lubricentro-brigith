import type { Schemas } from '@/lib/api/client';
import { formatMoney } from '@/lib/money';

export type Payable = Schemas['PayableResponse'];
export type PayableDetail = Schemas['PayableDetailResponse'];
export type Currency = Schemas['Currency'];
export type PayableStatus = Payable['status'];

/** Monto en su moneda (R8), con el formato único de `lib/money`: nunca se mezclan soles y dólares. */
export function formatAmount(
  amount: string | number,
  currency: Currency | null | undefined,
): string {
  return formatMoney(amount, currency === 'USD' ? 'USD' : 'PEN');
}

export const CURRENCY_LABELS: Record<Currency, string> = {
  PEN: 'Soles (S/)',
  USD: 'Dólares (US$)',
};

export const STATUS_LABELS: Record<PayableStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Pago parcial',
  OVERDUE: 'Vencida',
  PAID: 'Pagada',
  VOIDED: 'Anulada',
};

/** Clases del distintivo de estado (tokens del tema, claro y oscuro). */
export const STATUS_CLASSES: Record<PayableStatus, string> = {
  PENDING: 'bg-[var(--muted)] text-[var(--foreground)]',
  PARTIAL: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  OVERDUE: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  PAID: 'bg-[var(--success-soft)] text-[var(--success)]',
  VOIDED: 'bg-[var(--muted)] text-[var(--muted-foreground)]',
};

const dateOnly = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'UTC' });

/** "15 oct 2026" para `YYYY-MM-DD` (se lee en UTC: no cambia de día). */
export function formatDay(value: string): string {
  return dateOnly.format(new Date(`${value}T00:00:00.000Z`));
}

/** Suma días calendario a `YYYY-MM-DD` (vista previa del vencimiento). */
export function addDaysTo(value: string, days: number): string {
  return new Date(new Date(`${value}T00:00:00.000Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Plazo predeterminado (C-A, DEC-98). */
export const DEFAULT_TERM_DAYS = 30;

/** Días entre hoy y el vencimiento (negativo si ya venció). */
export function daysUntil(dueDate: string, today: string): number {
  return Math.round(
    (new Date(`${dueDate}T00:00:00.000Z`).getTime() -
      new Date(`${today}T00:00:00.000Z`).getTime()) /
      86_400_000,
  );
}
