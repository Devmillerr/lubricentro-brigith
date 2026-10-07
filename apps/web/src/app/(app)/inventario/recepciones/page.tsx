'use client';

import { ChevronLeft, ChevronRight, History, PackagePlus } from 'lucide-react';
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
import { formatQuantity } from '@/lib/inventory/format';
import {
  currentMonth,
  monthLabel,
  productCountLabel,
  receiptDateFormat,
  shiftMonth,
  unitCostLabel,
  type InventoryReceiptSummary,
  type ReceiptProductSummary,
  type ReceiptsMonthSummary,
} from '@/lib/inventory/receipts';
import { formatMoney } from '@/lib/sales/format';

const PAGE_SIZE = 20;

/**
 * Recepciones y compras (07-UI-UX.md §3.6, DEC-90, DEC-94). Por defecto, un
 * mes: arriba el total pagado registrado; luego lo comprado de cada producto
 * (cantidad, monto, recepciones y costo unitario calculado) con una barra de
 * su parte del gasto; y debajo las recepciones de ese mismo mes. "Todo el
 * historial" muestra todas las recepciones, sin mezclarlas con un mes. Solo
 * lectura. Lo que no tiene monto (todo lo anterior a DEC-90) se cuenta, pero
 * no se suma ni se estima.
 */
export default function ReceiptsPage() {
  // `null` = todo el historial.
  const [month, setMonth] = useState<string | null>(currentMonth);

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
        subtitle="Lo que llegó, cuánto pagaste y en qué productos, mes a mes."
        back={{ href: '/inventario', label: 'Inventario' }}
        action={receive}
      />

      {month !== null ? (
        <MonthView month={month} onMonthChange={setMonth} />
      ) : (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold">Todo el historial</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Todas las recepciones, de la más reciente a la más antigua. Para ver cuánto pagaste y en
            qué productos, elige un mes.
          </p>
          <Button variant="outline" onClick={() => setMonth(currentMonth())}>
            Ver por mes
          </Button>
        </section>
      )}

      <section aria-labelledby="receipts-list-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="receipts-list-title" className="text-lg font-bold first-letter:uppercase">
            {month !== null ? `Recepciones de ${monthLabel(month)}` : 'Todas las recepciones'}
          </h3>
          {month !== null && (
            <Button variant="ghost" onClick={() => setMonth(null)}>
              <History className="mr-1 size-4" aria-hidden />
              Ver todo el historial
            </Button>
          )}
        </div>
        {/* La clave reinicia la paginación al cambiar de mes. */}
        <ReceiptList key={month ?? 'all'} month={month} />
      </section>
    </div>
  );
}

/** Total pagado del mes y lo comprado de cada producto (`GET /inventory/receipts/summary`). */
function MonthView({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const summary = useApiQuery(`receipts-summary:${month}`, () =>
    callApi(api.GET('/inventory/receipts/summary', { params: { query: { month } } })),
  );
  const isCurrent = month === currentMonth();

  return (
    <>
      <section
        aria-labelledby="month-summary-title"
        className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <h3
            id="month-summary-title"
            className="text-center text-sm font-semibold first-letter:uppercase"
          >
            {monthLabel(month)}
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
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
        {summary.status === 'success' && <MonthTotal summary={summary.data} />}
      </section>

      {summary.status === 'success' && summary.data.products.length > 0 && (
        <ProductBreakdown summary={summary.data} />
      )}
    </>
  );
}

function MonthTotal({ summary }: { summary: ReceiptsMonthSummary }) {
  const partialLines =
    summary.linesWithoutCost > 0 && summary.linesWithoutCost !== summary.receiptsWithoutCost;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-xs font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
        Total pagado registrado
      </p>
      <p className="text-3xl font-bold">{formatMoney(summary.totalCost)}</p>
      <p className="text-sm text-[var(--muted-foreground)]">
        {summary.receiptCount === 0
          ? 'Sin recepciones este mes.'
          : summary.receiptCount === 1
            ? '1 recepción'
            : `${summary.receiptCount} recepciones`}
      </p>
      {summary.receiptsWithoutCost > 0 && (
        <p className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent-strong)]">
          {summary.receiptsWithoutCost === 1
            ? '1 recepción sin monto — no incluida en el total'
            : `${summary.receiptsWithoutCost} recepciones sin monto — no incluidas en el total`}
        </p>
      )}
      {partialLines && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Algunas recepciones tienen productos sin monto: el total solo suma lo que tiene monto.
        </p>
      )}
    </div>
  );
}

/**
 * Lo comprado de cada producto en el mes: cuánto se pagó (con una barra de su
 * parte del total), cuánto llegó en su unidad, en cuántas recepciones y el
 * costo unitario calculado. Lo que no tiene monto aparece, pero sin barra ni
 * costo.
 */
function ProductBreakdown({ summary }: { summary: ReceiptsMonthSummary }) {
  const total = Number(summary.totalCost);
  return (
    <section aria-labelledby="products-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 id="products-title" className="text-lg font-bold">
          Por producto
        </h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          En qué gastaste y cuánto compraste de cada uno. El costo unitario es un cálculo: monto
          pagado ÷ cantidad recibida.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {summary.products.map((product) => (
          <ProductRow key={product.productId} product={product} total={total} />
        ))}
      </ul>
    </section>
  );
}

function ProductRow({ product, total }: { product: ReceiptProductSummary; total: number }) {
  const paid = Number(product.totalCost);
  // Alguna línea con monto (las cantidades recibidas siempre son > 0).
  const hasCost = Number(product.quantityWithCost) > 0;
  const share = total > 0 && hasCost ? paid / total : 0;
  const percent = Math.round(share * 100);
  return (
    <li>
      <Link
        href={`/inventario/${product.productId}`}
        className="flex flex-col gap-1.5 px-4 py-3 hover:bg-[var(--muted)]"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-medium break-words">{product.name}</span>
          <span
            className={
              hasCost ? 'shrink-0 font-semibold' : 'shrink-0 text-sm text-[var(--muted-foreground)]'
            }
          >
            {hasCost ? formatMoney(product.totalCost) : 'Sin monto'}
          </span>
        </span>
        {hasCost && total > 0 && (
          <span className="flex items-center gap-2">
            <span
              className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]"
              role="img"
              aria-label={`${percent}% del total pagado del mes`}
            >
              <span
                className="block h-full rounded-full bg-[var(--primary)]"
                style={{ width: `${Math.max(share * 100, paid > 0 ? 2 : 0)}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-[var(--muted-foreground)]">
              {percent}%
            </span>
          </span>
        )}
        <span className="text-sm text-[var(--muted-foreground)]">
          {formatQuantity(product.quantity)} {product.unit} ·{' '}
          {product.receiptCount === 1 ? '1 recepción' : `${product.receiptCount} recepciones`}
          {product.unitCost !== null && <> · {unitCostLabel(product.unitCost, product.unit)}</>}
        </span>
        {hasCost && product.linesWithoutCost > 0 && (
          <span className="text-xs text-[var(--muted-foreground)]">
            {formatQuantity(Number(product.quantity) - Number(product.quantityWithCost))}{' '}
            {product.unit} sin monto: cuentan en la cantidad, no en el total ni en el costo.
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * Recepciones del mes (o todas, con `month` nulo), de la más reciente a la
 * más antigua, paginadas. Cada fila dice qué llegó: hasta 3 productos con su
 * cantidad y, si hay más, cuántos faltan.
 */
function ReceiptList({ month }: { month: string | null }) {
  const query = month !== null ? { month } : {};
  const firstPage = useApiQuery(`receipts:${month ?? 'all'}`, () =>
    callApi(api.GET('/inventory/receipts', { params: { query: { limit: PAGE_SIZE, ...query } } })),
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
        params: { query: { limit: PAGE_SIZE, cursor: nextCursor, ...query } },
      }),
    );
    setLoadingMore(false);
    if (!result.ok) {
      setMoreError(failureMessage(result.failure));
      return;
    }
    setMore({ items: [...more.items, ...result.data.items], cursor: result.data.nextCursor });
  }

  return (
    <>
      {firstPage.status === 'loading' && <ListSkeleton label="Cargando recepciones…" />}
      {firstPage.status === 'error' && (
        <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />
      )}
      {firstPage.status === 'success' && items.length === 0 && (
        <EmptyState
          icon={PackagePlus}
          title={month !== null ? 'Sin recepciones este mes' : 'Todavía no hay recepciones'}
          description="Cuando llegue mercadería, regístrala con Recibir."
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
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
    </>
  );
}

function ReceiptRow({ receipt }: { receipt: InventoryReceiptSummary }) {
  const note = present(receipt.note);
  const hidden = receipt.lineCount - receipt.preview.length;
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
          {receipt.lineCount > 1 && (
            <span className="text-xs text-[var(--muted-foreground)]">
              {productCountLabel(receipt.lineCount)}
            </span>
          )}
          {receipt.preview.map((line) => (
            <span key={line.productId} className="text-sm break-words">
              {line.name}{' '}
              <span className="whitespace-nowrap text-[var(--muted-foreground)]">
                · +{formatQuantity(line.quantity)} {line.unit}
              </span>
            </span>
          ))}
          {hidden > 0 && (
            <span className="text-xs text-[var(--muted-foreground)]">
              {hidden === 1 ? 'y 1 producto más' : `y ${hidden} productos más`}
            </span>
          )}
          {note && <span className="truncate text-xs text-[var(--muted-foreground)]">{note}</span>}
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
