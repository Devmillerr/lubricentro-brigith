'use client';

import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Droplets,
  ShoppingCart,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { IncomeSummary, Panel, SourceRow } from '@/components/dashboard/dashboard-sections';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import type { Dashboard } from '@/lib/dashboard/format';
import {
  currentMonth,
  monthLabel,
  shiftMonth,
  type ReceiptsMonthSummary,
} from '@/lib/inventory/receipts';
import { formatMoney } from '@/lib/money';
import { exclusionsNote, formatDifference, monthDifference } from '@/lib/summary/month-difference';

/**
 * Resumen del mes (07-UI-UX.md §3.1): para un mes elegido, lo que entró
 * (`GET /dashboard?period=month`), lo que se compró
 * (`GET /inventory/receipts/summary`) y la diferencia entre ambos, calculada
 * en la web con `monthDifference`. Solo lectura. Las compras en dólares se
 * restan solo con su equivalente en soles; lo que no lo tiene, o no tiene
 * monto, queda fuera y se avisa en una sola línea bajo la diferencia.
 */
export default function MonthSummaryPage() {
  const [month, setMonth] = useState(currentMonth);
  const isCurrent = month === currentMonth();

  const income = useApiQuery(`month-income:${month}`, () =>
    callApi(api.GET('/dashboard', { params: { query: { period: 'month', date: `${month}-01` } } })),
  );
  const purchases = useApiQuery(`receipts-summary:${month}`, () =>
    callApi(api.GET('/inventory/receipts/summary', { params: { query: { month } } })),
  );

  const empty =
    income.status === 'success' &&
    purchases.status === 'success' &&
    income.data.totals.salesCount === 0 &&
    income.data.maintenances.count === 0 &&
    purchases.data.receiptCount === 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Resumen del mes" back={{ href: '/dashboard', label: 'Inicio' }} />

      <section className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <h2 className="text-center text-sm font-semibold first-letter:uppercase" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={isCurrent}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </section>

      {empty ? (
        <EmptyState icon={CalendarRange} title="Sin movimientos este mes" />
      ) : (
        <>
          <section aria-labelledby="income-title" className="flex flex-col gap-3">
            <h2 id="income-title" className="text-lg font-bold">
              Ingresos
            </h2>
            {income.status === 'loading' && <Skeleton className="h-56" />}
            {income.status === 'error' && (
              <ErrorState message={failureMessage(income.failure)} onRetry={income.reload} />
            )}
            {income.status === 'success' && <IncomeBlock data={income.data} />}
          </section>

          <section aria-labelledby="purchases-title" className="flex flex-col gap-3">
            <h2 id="purchases-title" className="text-lg font-bold">
              Compras
            </h2>
            {purchases.status === 'loading' && <Skeleton className="h-32" />}
            {purchases.status === 'error' && (
              <ErrorState message={failureMessage(purchases.failure)} onRetry={purchases.reload} />
            )}
            {purchases.status === 'success' && (
              <PurchasesBlock summary={purchases.data} month={month} />
            )}
          </section>

          <section aria-labelledby="difference-title" className="flex flex-col gap-3">
            <h2 id="difference-title" className="text-lg font-bold">
              Diferencia del mes
            </h2>
            {income.status === 'success' && purchases.status === 'success' ? (
              <DifferenceBlock income={income.data} purchases={purchases.data} />
            ) : income.status === 'error' || purchases.status === 'error' ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Se calcula al cargar ingresos y compras.
              </p>
            ) : (
              <Skeleton className="h-28" />
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Total, efectivo y Yape, y lo que entró por cada origen. */
function IncomeBlock({ data }: { data: Dashboard }) {
  const { totals } = data;
  return (
    <div className="flex flex-col gap-3">
      <IncomeSummary totals={totals} compact />
      <Panel>
        <ul aria-label="Por origen" className="flex flex-col divide-y divide-[var(--border)]">
          <SourceRow
            source="counter"
            icon={ShoppingCart}
            label="Venta de productos"
            amount={totals.bySource.counter}
          />
          <SourceRow source="wash" icon={Droplets} label="Lavados" amount={totals.bySource.wash} />
          <SourceRow
            source="maintenance"
            icon={Wrench}
            label="Mantenimiento"
            amount={totals.bySource.maintenance}
          />
        </ul>
      </Panel>
    </div>
  );
}

/** Compras en soles y, si las hay, en dólares con su equivalente (DEC-100). */
function PurchasesBlock({ summary, month }: { summary: ReceiptsMonthSummary; month: string }) {
  const usd = summary.usd;
  return (
    <Panel>
      <dl className="flex flex-col divide-y divide-[var(--border)]">
        <div className="flex items-baseline justify-between gap-3 pb-2.5">
          <dt className="text-sm font-medium text-[var(--muted-foreground)]">En soles</dt>
          <dd className="text-xl font-bold tabular-nums">{formatMoney(summary.totalCost)}</dd>
        </div>
        {usd && (
          <div className="flex items-baseline justify-between gap-3 pt-2.5">
            <dt className="text-sm font-medium text-[var(--muted-foreground)]">En dólares</dt>
            <dd className="flex flex-col items-end">
              <span className="text-xl font-bold tabular-nums">
                {formatMoney(usd.totalCost, 'USD')}
              </span>
              {usd.penEquivalent !== null && (
                <span className="text-sm text-[var(--muted-foreground)] tabular-nums">
                  ≈ {formatMoney(usd.penEquivalent)}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>

      <Link
        href={`/inventario/recepciones?mes=${month}`}
        aria-label={`Ver recepciones de ${monthLabel(month)}`}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium underline underline-offset-4 hover:opacity-80"
      >
        Ver recepciones
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </Panel>
  );
}

/** Ingresos − compras en soles − equivalente en soles de las compras en dólares. */
function DifferenceBlock({
  income,
  purchases,
}: {
  income: Dashboard;
  purchases: ReceiptsMonthSummary;
}) {
  const result = monthDifference({ incomeTotal: income.totals.total, purchases });
  const note = exclusionsNote(result);

  return (
    <Panel>
      <p className="font-display text-4xl leading-none font-bold tracking-tight tabular-nums">
        {formatDifference(result.differenceCents)}
      </p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Ingresos − compras. No es la ganancia exacta.
      </p>
      {note && (
        <p className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--accent-strong)]">
          {note}
        </p>
      )}
    </Panel>
  );
}
