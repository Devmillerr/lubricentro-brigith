import { toCents } from '@/lib/money';

/**
 * Lo que la diferencia del mes necesita de `GET /dashboard?period=month`
 * (`totals.total`, en soles) y de `GET /inventory/receipts/summary` (montos
 * como string decimal, 06-API.md §1).
 */
export interface MonthDifferenceInput {
  /** Ingresos del mes en soles (`totals.total`). */
  incomeTotal: string;
  purchases: {
    /** Total comprado en soles (las compras en dólares van aparte, en `usd`). */
    totalCost: string;
    /** Recepciones del mes sin ningún monto registrado. */
    receiptsWithoutCost: number;
    /** Líneas sin monto, también de recepciones con monto parcial. */
    linesWithoutCost: number;
    usd: {
      receiptCount: number;
      totalCost: string;
      /** Equivalente en soles de las compras en USD que tienen tipo de cambio. */
      penEquivalent: string | null;
      /** Compras en USD con monto pero sin tipo de cambio. */
      withoutRateCount: number;
    } | null;
  };
}

export interface MonthDifference {
  incomeCents: number;
  /** Compras registradas en soles. */
  penPurchasesCents: number;
  /** Equivalente en soles de las compras en USD con tipo de cambio (0 si no hay). */
  usdPenEquivalentCents: number;
  /** Ingresos − compras en soles − equivalente en soles de las compras en USD. */
  differenceCents: number;
  /**
   * Compras en USD que no entran en la resta por no tener equivalente en soles:
   * las que no tienen tipo de cambio o, si la respuesta no trae equivalente,
   * todas las del mes.
   */
  usdExcludedCount: number;
  /** Recepciones sin monto: no se pueden restar. */
  receiptsWithoutCost: number;
  /** Hay recepciones con algún producto sin monto (aparte de las que no tienen ninguno). */
  hasPartialLines: boolean;
  /** Algo de lo comprado quedó fuera de la resta: la diferencia es incompleta. */
  isIncomplete: boolean;
}

/**
 * Diferencia del mes (07-UI-UX.md, "Resumen del mes"): ingresos en soles menos
 * lo comprado en soles y menos el equivalente en soles de las compras en
 * dólares que tienen tipo de cambio. Nunca suma soles y dólares sin convertir:
 * lo que no tiene equivalente (o no tiene monto) queda fuera y se avisa. Todo
 * en céntimos enteros, sin errores de coma flotante. No es la ganancia: las
 * compras pueden ser stock para meses siguientes.
 */
export function monthDifference({ incomeTotal, purchases }: MonthDifferenceInput): MonthDifference {
  const incomeCents = toCents(incomeTotal);
  const penPurchasesCents = toCents(purchases.totalCost);
  const usd = purchases.usd;
  const usdPenEquivalentCents = usd?.penEquivalent != null ? toCents(usd.penEquivalent) : 0;

  let usdExcludedCount = 0;
  if (usd) {
    usdExcludedCount =
      usd.penEquivalent == null && toCents(usd.totalCost) > 0
        ? Math.max(usd.withoutRateCount, 1)
        : usd.withoutRateCount;
  }

  const receiptsWithoutCost = purchases.receiptsWithoutCost;
  const hasPartialLines =
    purchases.linesWithoutCost > 0 && purchases.linesWithoutCost !== receiptsWithoutCost;

  return {
    incomeCents,
    penPurchasesCents,
    usdPenEquivalentCents,
    differenceCents: incomeCents - penPurchasesCents - usdPenEquivalentCents,
    usdExcludedCount,
    receiptsWithoutCost,
    hasPartialLines,
    isIncomplete: usdExcludedCount > 0 || receiptsWithoutCost > 0 || hasPartialLines,
  };
}
