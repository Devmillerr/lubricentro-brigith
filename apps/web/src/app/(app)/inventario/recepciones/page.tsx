'use client';

import { ChevronLeft, ChevronRight, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import {
  currentMonth,
  monthLabel,
  productCountLabel,
  receiptDateFormat,
  shiftMonth,
  type InventoryReceiptSummary,
} from '@/lib/inventory/receipts';
import { formatMoney } from '@/lib/sales/format';

const PAGE_SIZE = 20;

/**
 * Recepciones y compras (07-UI-UX.md §3.6, DEC-90): arriba, cuánto se compró
 * en el mes (suma de lo pagado en las recepciones con monto); debajo, el
 * historial de la más reciente a la más antigua, con fecha, cantidad de
 * productos, total pagado y nota. Solo lectura. Las recepciones sin monto
 * (todas las anteriores a DEC-90) se cuentan aparte, sin estimarlas.
 */
export default function ReceiptsPage() {
  const firstPage = useApiQuery('receipts', () =>
    callApi(api.GET('/inventory/receipts', { params: { query: { limit: PAGE_SIZE } } })),
  );
  const [more, setMore] = useState<{ items: InventoryReceiptSummary[]; cursor: string | null }>({
    items: [],
    cursor: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const items = firstPage.status === 'success' ? [...firstPage.data.items, ...more.items] : [];
  const nextCursor =
    firstPage.status === 'success'
      ? more.items.length > 0
        ? more.cursor
        : firstPage.data.nextCursor
      : null;

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    const result = await callApi(
      api.GET('/inventory/receipts', {
        params: { query: { limit: PAGE_SIZE, cursor: nextCursor } },
      }),
    );
    setLoadingMore(false);
    if (!result.ok) {
      setMoreError(failureMessage(result.failure));
      return;
    }
    setMore({ items: [...more.items, ...result.data.items], cursor: result.data.nextCursor });
  }

  const receive = (
    <Link href="/inventario/recepciones/nueva" className={buttonVariants()}>
      <PackagePlus className="mr-1 size-4" aria-hidden />
      Recibir
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Recepciones y compras"
        subtitle="Lo que llegó, cuánto pagaste y cuánto invertiste en el mes."
        back={{ href: '/inventario', label: 'Inventario' }}
        action={receive}
      />

      <MonthSummary />

      {firstPage.status === 'loading' && <ListSkeleton label="Cargando recepciones…" />}
      {firstPage.status === 'error' && (
        <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />
      )}
      {firstPage.status === 'success' && items.length === 0 && (
        <EmptyState
          icon={PackagePlus}
          title="Todavía no hay recepciones"
          description="Cuando llegue mercadería, regístrala con Recibir."
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {items.map((receipt) => (
            <ReceiptRow key={receipt.id} receipt={receipt} />
          ))}
        </ul>
      )}

      {moreError && <FormError>{moreError}</FormError>}
      {nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </div>
  );
}

function ReceiptRow({ receipt }: { receipt: InventoryReceiptSummary }) {
  const note = present(receipt.note);
  return (
    <li>
      <Link
        href={`/inventario/recepciones/${receipt.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">
            {receiptDateFormat.format(new Date(receipt.occurredAt))}
          </span>
          <span className="text-sm text-[var(--muted-foreground)]">
            {productCountLabel(receipt.lineCount)}
          </span>
          {note && <span className="truncate text-sm">{note}</span>}
        </span>
        <span
          className={
            receipt.totalCost !== null
              ? 'shrink-0 font-semibold'
              : 'shrink-0 text-sm text-[var(--muted-foreground)]'
          }
        >
          {receipt.totalCost !== null ? formatMoney(receipt.totalCost) : 'Sin monto'}
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * Total comprado en un mes (`GET /inventory/receipts/summary`, DEC-90), con
 * flechas para ver meses anteriores. Lo que no tiene monto se informa aparte.
 */
function MonthSummary() {
  const [month, setMonth] = useState(currentMonth);
  const summary = useApiQuery(`receipts-summary:${month}`, () =>
    callApi(api.GET('/inventory/receipts/summary', { params: { query: { month } } })),
  );
  const isCurrent = month === currentMonth();

  return (
    <section
      aria-labelledby="month-summary-title"
      className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <h3
          id="month-summary-title"
          className="text-center text-sm font-semibold first-letter:uppercase"
        >
          Comprado en {monthLabel(month)}
        </h3>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={isCurrent}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
      {summary.status === 'loading' && (
        <p className="text-center text-sm text-[var(--muted-foreground)]">Calculando…</p>
      )}
      {summary.status === 'error' && (
        <ErrorState message={failureMessage(summary.failure)} onRetry={summary.reload} />
      )}
      {summary.status === 'success' && (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-3xl font-bold">{formatMoney(summary.data.totalCost)}</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {summary.data.receiptCount === 0
              ? 'Sin recepciones este mes.'
              : summary.data.receiptCount === 1
                ? '1 recepción'
                : `${summary.data.receiptCount} recepciones`}
            {summary.data.receiptsWithoutCost > 0 &&
              ` · ${summary.data.receiptsWithoutCost} sin monto (no se suman)`}
          </p>
          {summary.data.linesWithoutCost > 0 &&
            summary.data.linesWithoutCost !== summary.data.receiptsWithoutCost && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Hay productos recibidos sin monto: el total solo suma lo que tiene monto.
              </p>
            )}
        </div>
      )}
    </section>
  );
}
