'use client';

import { ChevronRight, Droplets, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import {
  HISTORY_SOURCES,
  PAYMENT_LABELS,
  SOURCE_LABELS,
  formatMoney,
  isSaleSource,
  saleDateFormat,
  salesHistoryHref,
  type SaleSource,
  type SaleSummary,
} from '@/lib/sales/format';

const PAGE_SIZE = 20;

/**
 * Historial genérico de ventas (B-135, 06-API.md §2 "Ventas"): de la más
 * reciente a la más antigua, con filtro por fuente. Los lavados no tienen
 * historial propio: son este mismo con `?source=WASH` (DEC-68).
 */
export default function SalesHistoryPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SalesHistory />
    </Suspense>
  );
}

function SalesHistory() {
  const router = useRouter();
  const raw = useSearchParams().get('source');
  const source: SaleSource | null = isSaleSource(raw) ? raw : null;
  const isWash = source === 'WASH';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={isWash ? 'Lavados' : 'Ventas'}
        subtitle="Historial de cobros; toca uno para ver el detalle o anularlo"
        back={isWash ? { href: '/lavado', label: 'Lavado' } : { href: '/mas', label: 'Más' }}
        action={
          isWash ? (
            <Link href="/lavado" className={buttonVariants()}>
              <Droplets className="mr-1 size-4" aria-hidden />
              Cobrar
            </Link>
          ) : (
            <Link href="/ventas/nueva" className={buttonVariants()}>
              <ShoppingCart className="mr-1 size-4" aria-hidden />
              Vender
            </Link>
          )
        }
      />
      <ChipRow label="Filtrar por fuente">
        <Chip selected={source === null} onClick={() => router.replace(salesHistoryHref(null))}>
          Todas
        </Chip>
        {HISTORY_SOURCES.map((option) => (
          <Chip
            key={option}
            selected={source === option}
            onClick={() => router.replace(salesHistoryHref(option))}
          >
            {SOURCE_LABELS[option]}
          </Chip>
        ))}
      </ChipRow>
      {/* La clave reinicia la paginación al cambiar de filtro. */}
      <SalesList key={source ?? 'all'} source={source} />
    </div>
  );
}

function SalesList({ source }: { source: SaleSource | null }) {
  const baseQuery = { limit: PAGE_SIZE, ...(source ? { source } : {}) };
  const firstPage = useApiQuery(`sales:${source ?? 'all'}`, () =>
    callApi(api.GET('/sales', { params: { query: baseQuery } })),
  );
  const [more, setMore] = useState<{ items: SaleSummary[]; cursor: string | null }>({
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
      api.GET('/sales', { params: { query: { ...baseQuery, cursor: nextCursor } } }),
    );
    setLoadingMore(false);
    if (!result.ok) {
      setMoreError(failureMessage(result.failure));
      return;
    }
    setMore({ items: [...more.items, ...result.data.items], cursor: result.data.nextCursor });
  }

  if (firstPage.status === 'loading') return <LoadingState label="Cargando historial…" />;
  if (firstPage.status === 'error') {
    return <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title={source === 'WASH' ? 'Todavía no hay lavados' : 'Todavía no hay ventas'}
        description={
          source === 'WASH'
            ? 'Los lavados cobrados aparecerán aquí.'
            : 'Los cobros aparecerán aquí.'
        }
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {items.map((sale) => (
          <SaleRow key={sale.id} sale={sale} />
        ))}
      </ul>
      {moreError && <FormError>{moreError}</FormError>}
      {nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </>
  );
}

function SaleRow({ sale }: { sale: SaleSummary }) {
  const voided = sale.status === 'VOIDED';
  const note = present(sale.note);
  return (
    <li>
      <Link
        href={`/ventas/${sale.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className={voided ? 'font-medium line-through' : 'font-medium'}>
              {formatMoney(sale.total)}
            </span>
            {voided && <Badge>Anulada</Badge>}
          </span>
          <span className="text-sm text-[var(--muted-foreground)]">
            {SOURCE_LABELS[sale.source]} · {PAYMENT_LABELS[sale.paymentMethod]} ·{' '}
            {saleDateFormat.format(new Date(sale.occurredAt))}
          </span>
          {note && <span className="truncate text-sm">{note}</span>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
    </li>
  );
}
