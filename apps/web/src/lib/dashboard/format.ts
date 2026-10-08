import type { Schemas } from '@/lib/api/client';
import { formatCentsMoney, toCents } from '@/lib/money';
import type { SaleSource } from '@/lib/sales/format';

export type Dashboard = Schemas['DashboardResponse'];
export type DashboardSeriesPoint = Schemas['DashboardSeriesPointResponse'];
export type DashboardPeriodKind = Dashboard['period']['kind'];

/** Selector de período del Inicio (07-UI-UX.md §3.1, DEC-79). */
export const PERIOD_OPTIONS: { kind: DashboardPeriodKind; label: string }[] = [
  { kind: 'today', label: 'Hoy' },
  { kind: 'week', label: 'Semana' },
  { kind: 'month', label: 'Mes' },
];

/** Orden de apilado de abajo arriba y de la leyenda (siempre el mismo: color = fuente). */
export const SERIES_SOURCES = ['counter', 'wash', 'maintenance'] as const;
export type SeriesSource = (typeof SERIES_SOURCES)[number];

export const SERIES_TO_SOURCE: Record<SeriesSource, SaleSource> = {
  counter: 'COUNTER',
  wash: 'WASH',
  maintenance: 'MAINTENANCE',
};

export const SERIES_COLOR: Record<SeriesSource, string> = {
  counter: 'var(--series-counter)',
  wash: 'var(--series-wash)',
  maintenance: 'var(--series-maintenance)',
};

// El formato de dinero vive en `lib/money.ts` (uno solo para toda la app).
export { formatCentsMoney, toCents };

export function formatAmount(amount: string): string {
  return formatCentsMoney(toCents(amount));
}

/** Total del punto de la serie en céntimos. */
export function pointTotalCents(point: DashboardSeriesPoint): number {
  return SERIES_SOURCES.reduce((sum, source) => sum + toCents(point[source]), 0);
}

function inZone(timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es-PE', { timeZone, ...options });
}

/**
 * Rango del período en la zona del negocio (BR-D1): "hoy, lun 28 sep",
 * "lun 22 – dom 28 sep" o "septiembre de 2026". `to` es excluido: el último
 * día es el anterior a `to`.
 */
export function describeDashboardPeriod(period: Dashboard['period']): string {
  const tz = period.timezone;
  const from = new Date(period.from);
  const lastDay = new Date(new Date(period.to).getTime() - 1);
  const day = inZone(tz, { weekday: 'short', day: 'numeric', month: 'short' });
  if (period.kind === 'today') return `Hoy, ${day.format(from)}`;
  if (period.kind === 'month') return inZone(tz, { month: 'long', year: 'numeric' }).format(from);
  const start = inZone(tz, { weekday: 'short', day: 'numeric' }).format(from);
  return `${start} – ${day.format(lastDay)}`;
}

/** Etiqueta corta del eje: hora ("14") para Hoy, día de la semana o del mes para Semana/Mes. */
export function bucketTick(bucket: string, kind: DashboardPeriodKind, timeZone: string): string {
  const date = new Date(bucket);
  if (kind === 'today') return inZone(timeZone, { hour: 'numeric', hourCycle: 'h23' }).format(date);
  if (kind === 'week') {
    return inZone(timeZone, { weekday: 'narrow' }).format(date).toUpperCase();
  }
  return inZone(timeZone, { day: 'numeric' }).format(date);
}

/** Etiqueta larga para la lectura del punto elegido: "14:00 – 15:00" o "mié 24 sep". */
export function bucketLabel(bucket: string, kind: DashboardPeriodKind, timeZone: string): string {
  const date = new Date(bucket);
  if (kind === 'today') {
    const hour = inZone(timeZone, { hour: 'numeric', hourCycle: 'h23' });
    const end = new Date(date.getTime() + 60 * 60 * 1000);
    return `${hour.format(date)}:00 – ${hour.format(end)}:00`;
  }
  return inZone(timeZone, { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

/** ¿El punto contiene "ahora"? (la hora o el día en curso). */
export function isCurrentBucket(
  point: DashboardSeriesPoint,
  next: DashboardSeriesPoint | undefined,
  periodTo: string,
  now: number,
): boolean {
  const start = new Date(point.bucket).getTime();
  const end = new Date(next ? next.bucket : periodTo).getTime();
  return now >= start && now < end;
}

/** Cantidad decimal de la API ("2.500") para mostrar: sin ceros de más. */
export function formatUnits(value: string): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('es-PE', { maximumFractionDigits: 3 })
    : value;
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('es-PE')} ${count === 1 ? one : many}`;
}
