'use client';

import { ChevronRight, PackagePlus } from 'lucide-react';
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
  productCountLabel,
  receiptDateFormat,
  type InventoryReceiptSummary,
} from '@/lib/inventory/receipts';

const PAGE_SIZE = 20;

/**
 * Historial de recepciones (07-UI-UX.md §3.6): de la más reciente a la más
 * antigua, con fecha, cantidad de productos y nota. Solo lectura.
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
        title="Recepciones"
        back={{ href: '/inventario', label: 'Inventario' }}
        action={receive}
      />

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
        <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
    </li>
  );
}
