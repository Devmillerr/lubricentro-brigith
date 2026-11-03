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
import {
  IncomeSummary,
  MaintenancesCard,
  Panel,
  SourceRow,
} from '@/components/dashboard/dashboard-sections';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { plural, type Dashboard } from '@/lib/dashboard/format';
import {
  currentMonth,
  monthLabel,
  shiftMonth,
  type ReceiptsMonthSummary,
} from '@/lib/inventory/receipts';
import { formatCentsMoney, formatMoney } from '@/lib/money';
import { monthDifference } from '@/lib/summary/month-difference';

/**
 * Resumen del mes (07-UI-UX.md §3.1): para un mes elegido, lo que entró
 * (`GET /dashboard?period=month`), lo que se compró
 * (`GET /inventory/receipts/summary`) y la diferencia entre ambos, calculada
 * en la web con `monthDifference`. Solo lectura. Las compras en dólares se
 * restan solo con su equivalente en soles; lo que no lo tiene, o no tiene
 * monto, queda fuera y se avisa.
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
        <EmptyState
          icon={CalendarRange}
          title="Sin movimientos este mes"
          description="No hay ventas, mantenimientos ni recepciones registradas."
        />
      ) : (
        <>
          <section aria-labelledby="income-title" className="flex flex-col gap-3">
            <h2 id="income-title" className="text-lg font-bold">
              Ingresos del mes
            </h2>
            {income.status === 'loading' && <Skeleton className="h-56" />}
            {income.status === 'error' && (
              <ErrorState message={failureMessage(income.failure)} onRetry={income.reload} />
            )}
            {income.status === 'success' && <IncomeBlock data={income.data} />}
          </section>

          <section aria-labelledby="purchases-title" className="flex flex-col gap-3">
            <h2 id="purchases-title" className="text-lg font-bold">
              Compras del mes
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
                Se calcula cuando carguen los ingresos y las compras.
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
  const { totals, washes, maintenances } = data;
  return (
    <div className="flex flex-col gap-3">
      <IncomeSummary totals={totals} />
      <Panel title="Por origen">
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          <SourceRow
            source="counter"
            icon={ShoppingCart}
            label="Venta de productos"
            amount={totals.bySource.counter}
          />
          <SourceRow
            source="wash"
            icon={Droplets}
            label="Lavados"
            amount={totals.bySource.wash}
            detail={plural(washes.count, 'lavado', 'lavados')}
          />
          <SourceRow
            source="maintenance"
            icon={Wrench}
            label="Mantenimiento"
            amount={totals.bySource.maintenance}
            detail="Por el día del cobro"
          />
        </ul>
        <MaintenancesCard maintenances={maintenances} />
      </Panel>
    </div>
  );
}

/** Total comprado en soles; las compras en dólares, aparte (DEC-100). */
function PurchasesBlock({ summary, month }: { summary: ReceiptsMonthSummary; month: string }) {
  const usd = summary.usd;
  const penCount = summary.receiptCount - (usd?.receiptCount ?? 0);
  return (
    <Panel>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-[var(--muted-foreground)]">
          {usd ? 'Total comprado registrado en soles' : 'Total comprado registrado'}
        </p>
        <p className="text-3xl font-bold tabular-nums">{formatMoney(summary.totalCost)}</p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {summary.receiptCount === 0
            ? 'Sin recepciones este mes.'
            : usd && penCount === 0
              ? 'Sin compras en soles este mes.'
              : plural(penCount, 'recepción', 'recepciones')}
        </p>
      </div>

      {usd && (
        <div className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-3">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Compras en dólares (aparte)
          </p>
          <p className="text-xl font-bold tabular-nums">{formatMoney(usd.totalCost, 'USD')}</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {plural(usd.receiptCount, 'recepción', 'recepciones')}
          </p>
          {usd.penEquivalent !== null ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              ≈ {formatMoney(usd.penEquivalent)} con el tipo de cambio de cada compra
              {usd.withoutRateCount > 0 &&
                ` (sin contar ${usd.withoutRateCount} sin tipo de cambio)`}
            </p>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">Sin tipo de cambio registrado.</p>
          )}
        </div>
      )}

      {summary.receiptsWithoutCost > 0 && (
        <p className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent-strong)]">
          {summary.receiptsWithoutCost === 1
            ? '1 recepción sin monto — no incluida en el total'
            : `${summary.receiptsWithoutCost} recepciones sin monto — no incluidas en el total`}
        </p>
      )}

      <Link
        href={`/inventario/recepciones?mes=${month}`}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium underline underline-offset-4 hover:opacity-80"
      >
        Ver recepciones de {monthLabel(month)}
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
  const warnings: string[] = [];
  if (result.usdExcludedCount > 0) {
    warnings.push(
      result.usdExcludedCount === 1
        ? '1 compra en dólares sin tipo de cambio no se resta: no tiene equivalente en soles.'
        : `${result.usdExcludedCount} compras en dólares sin tipo de cambio no se restan: no tienen equivalente en soles.`,
    );
  }
  if (result.receiptsWithoutCost > 0) {
    warnings.push(
      result.receiptsWithoutCost === 1
        ? '1 recepción sin monto no se resta.'
        : `${result.receiptsWithoutCost} recepciones sin monto no se restan.`,
    );
  }
  if (result.hasPartialLines) {
    warnings.push(
      'Algunas recepciones tienen productos sin monto: solo se resta lo que tiene monto.',
    );
  }

  return (
    <Panel>
      <p className="font-display text-4xl leading-none font-bold tracking-tight tabular-nums">
        {formatCentsMoney(result.differenceCents)}
      </p>
      <dl className="flex flex-col gap-1 text-sm">
        <Line label="Ingresos del mes" value={formatCentsMoney(result.incomeCents)} />
        <Line label="− Compras en soles" value={formatCentsMoney(result.penPurchasesCents)} />
        {purchases.usd && (
          <Line
            label="− Compras en dólares (equivalente en soles)"
            value={formatCentsMoney(result.usdPenEquivalentCents)}
          />
        )}
      </dl>
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--accent-strong)]">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-[var(--muted-foreground)]">
        No es la ganancia exacta: las compras pueden ser stock para meses siguientes.
      </p>
    </Panel>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="shrink-0 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
