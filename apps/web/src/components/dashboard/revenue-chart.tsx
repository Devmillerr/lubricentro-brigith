'use client';

import { useState } from 'react';
import {
  SERIES_COLOR,
  SERIES_SOURCES,
  SERIES_TO_SOURCE,
  bucketLabel,
  bucketTick,
  formatCentsMoney,
  isCurrentBucket,
  pointTotalCents,
  toCents,
  type DashboardPeriodKind,
  type DashboardSeriesPoint,
} from '@/lib/dashboard/format';
import { SOURCE_LABELS } from '@/lib/sales/format';
import { cn } from '@/lib/utils';

const PLOT_HEIGHT = 144;
/** Con pocas barras cabe el valor encima de cada una; con más, va en la lectura y la tabla. */
const MAX_LABELED_BARS = 7;

/**
 * Ingresos por hora (Hoy) o por día (Semana, Mes), apilados por fuente
 * (07-UI-UX.md §3.1, DEC-83). Barras de CSS propio, sin librerías. Cada
 * columna es un botón: tocarla muestra su desglose en texto. La leyenda lleva
 * los totales del período y hay una vista de tabla: el color nunca va solo.
 */
export function RevenueChart({
  series,
  kind,
  timeZone,
  periodTo,
}: {
  series: DashboardSeriesPoint[];
  kind: DashboardPeriodKind;
  timeZone: string;
  periodTo: string;
}) {
  const [now] = useState(() => Date.now());
  const totals = series.map(pointTotalCents);
  const max = Math.max(...totals, 0);
  const currentIndex = series.findIndex((point, i) =>
    isCurrentBucket(point, series[i + 1], periodTo, now),
  );
  let lastWithData = -1;
  totals.forEach((total, i) => {
    if (total > 0) lastWithData = i;
  });
  // La franja actual si ya tiene ingresos; si no, la última que tuvo (la lectura no queda en 0).
  const defaultIndex =
    currentIndex >= 0 && (totals[currentIndex] ?? 0) > 0
      ? currentIndex
      : lastWithData >= 0
        ? lastWithData
        : Math.max(currentIndex, 0);
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked !== null && picked < series.length ? picked : defaultIndex;
  const point = series[selected];
  const labeled = series.length <= MAX_LABELED_BARS;

  if (!point) return null;

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-live="polite"
        className="flex flex-col gap-1.5 rounded-lg bg-[var(--muted)] px-3 py-2.5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-[var(--muted-foreground)]">
            {bucketLabel(point.bucket, kind, timeZone)}
          </span>
          <span className="text-base font-semibold tabular-nums">
            {formatCentsMoney(totals[selected] ?? 0)}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {SERIES_SOURCES.map((source) => (
            <span key={source} className="flex items-center gap-1.5 text-xs">
              <Swatch source={source} />
              <span className="text-[var(--muted-foreground)]">
                {SOURCE_LABELS[SERIES_TO_SOURCE[source]]}
              </span>
              <span className="font-medium tabular-nums">
                {formatCentsMoney(toCents(point[source]))}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div
        role="group"
        aria-label="Ingresos por período, toca una barra para ver su detalle"
        className="flex items-end gap-[2px]"
        style={{ height: PLOT_HEIGHT + (labeled ? 18 : 0) }}
      >
        {series.map((item, index) => {
          const total = totals[index] ?? 0;
          const isSelected = index === selected;
          return (
            <button
              key={item.bucket}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${bucketLabel(item.bucket, kind, timeZone)}: ${formatCentsMoney(total)}`}
              onClick={() => setPicked(index)}
              onMouseEnter={() => setPicked(index)}
              className={cn(
                'group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-md outline-none',
                'focus-visible:ring-2 focus-visible:ring-[var(--foreground)]',
              )}
            >
              {labeled && (
                <span className="mb-1 text-[0.6875rem] leading-none font-medium text-[var(--muted-foreground)] tabular-nums">
                  {compactSoles(total)}
                </span>
              )}
              <Stack point={item} total={total} max={max} />
            </button>
          );
        })}
      </div>

      <div className="flex gap-[2px]" aria-hidden>
        {series.map((item, index) => (
          <span
            key={item.bucket}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[0.6875rem] leading-none text-[var(--muted-foreground)]',
              index === selected && 'font-semibold text-[var(--foreground)]',
            )}
          >
            {/* Marca de la franja elegida, en el eje: no se confunde con una barra. */}
            <span
              className={cn(
                'h-[3px] w-full max-w-6 rounded-full',
                index === selected ? 'bg-[var(--foreground)]' : 'bg-transparent',
              )}
            />
            {showTick(kind, index) ? bucketTick(item.bucket, kind, timeZone) : ''}
          </span>
        ))}
      </div>

      <Legend series={series} />
      <SeriesTable series={series} totals={totals} kind={kind} timeZone={timeZone} />
    </div>
  );
}

/** Segmentos de abajo arriba; 2 px de separación y extremo superior redondeado. */
function Stack({ point, total, max }: { point: DashboardSeriesPoint; total: number; max: number }) {
  if (total <= 0 || max <= 0) {
    return <span className="h-[2px] w-full max-w-6 rounded-full bg-[var(--chart-track)]" />;
  }
  const height = Math.max(4, (total / max) * PLOT_HEIGHT);
  const parts = SERIES_SOURCES.map((source) => ({ source, cents: toCents(point[source]) })).filter(
    (part) => part.cents > 0,
  );
  return (
    <span className="flex w-full max-w-6 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]">
      {parts.map((part) => (
        <span
          key={part.source}
          className="block w-full shrink-0"
          style={{
            // Proporcional a su monto dentro de la barra; mínimo 2 px para que se vea.
            height: Math.max(2, (part.cents / total) * height),
            background: SERIES_COLOR[part.source],
          }}
        />
      ))}
    </span>
  );
}

function Legend({ series }: { series: DashboardSeriesPoint[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Leyenda">
      {SERIES_SOURCES.map((source) => {
        const cents = series.reduce((sum, point) => sum + toCents(point[source]), 0);
        return (
          <li key={source} className="flex items-center gap-1.5">
            <Swatch source={source} />
            <span>{SOURCE_LABELS[SERIES_TO_SOURCE[source]]}</span>
            <span className="text-[var(--muted-foreground)] tabular-nums">
              {formatCentsMoney(cents)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SeriesTable({
  series,
  totals,
  kind,
  timeZone,
}: {
  series: DashboardSeriesPoint[];
  totals: number[];
  kind: DashboardPeriodKind;
  timeZone: string;
}) {
  // Todas las franjas, también las de S/ 0.00: cada barra tiene su valor en texto (07 §3.1).
  const rows = series.map((point, index) => ({ point, total: totals[index] ?? 0 }));
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium underline-offset-4 hover:underline">
        Ver como tabla
      </summary>
      {rows.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">Sin ingresos en este período.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-xs tabular-nums">
            <caption className="pb-2 text-left text-[var(--muted-foreground)]">
              {kind === 'today' ? 'Una fila por hora.' : 'Una fila por día.'}
            </caption>
            <thead className="text-[var(--muted-foreground)]">
              <tr>
                <th className="px-1 py-1 font-medium">{kind === 'today' ? 'Hora' : 'Día'}</th>
                {SERIES_SOURCES.map((source) => (
                  <th key={source} className="px-1 py-1 text-right font-medium">
                    {SOURCE_LABELS[SERIES_TO_SOURCE[source]]}
                  </th>
                ))}
                <th className="px-1 py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map(({ point, total }) => (
                <tr key={point.bucket}>
                  <td className="px-1 py-1.5">{bucketLabel(point.bucket, kind, timeZone)}</td>
                  {SERIES_SOURCES.map((source) => (
                    <td key={source} className="px-1 py-1.5 text-right">
                      {formatCentsMoney(toCents(point[source]))}
                    </td>
                  ))}
                  <td className="px-1 py-1.5 text-right font-medium">{formatCentsMoney(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

export function Swatch({ source }: { source: (typeof SERIES_SOURCES)[number] }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-[3px]"
      style={{ background: SERIES_COLOR[source] }}
    />
  );
}

function showTick(kind: DashboardPeriodKind, index: number): boolean {
  if (kind === 'today') return index % 6 === 0;
  if (kind === 'week') return true;
  return index % 7 === 0;
}

/** "85", "1.2k": el valor encima de la barra, en soles, sin decimales. */
function compactSoles(cents: number): string {
  const soles = Math.round(cents / 100);
  if (soles < 1000) return String(soles);
  const thousands = soles / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}
