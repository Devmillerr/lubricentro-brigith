'use client';

import { History } from 'lucide-react';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import {
  formatQuantity,
  formatSigned,
  MOVEMENT_LABELS,
  type InventoryMovement,
} from '@/lib/inventory/format';
import { dateTimeFormat } from '@/lib/utils';

const PAGE_SIZE = 20;
const dateFormat = dateTimeFormat();

/**
 * Historial de movimientos del producto, solo lectura (07-UI-UX.md §3.6;
 * BR-P3: los movimientos no se editan ni se borran). `version` cambia cuando
 * se registra un movimiento nuevo, para volver a pedir la primera página.
 */
export function MovementHistory({ productId, version }: { productId: string; version: number }) {
  const key = `movements:${productId}:${version}`;
  const firstPage = useApiQuery(key, () =>
    callApi(
      api.GET('/inventory/movements', { params: { query: { productId, limit: PAGE_SIZE } } }),
    ),
  );
  const [more, setMore] = useState<{
    key: string;
    items: InventoryMovement[];
    cursor: string | null;
  }>({ key: '', items: [], cursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const extra = more.key === key ? more : null;
  const items =
    firstPage.status === 'success' ? [...firstPage.data.items, ...(extra?.items ?? [])] : [];
  const nextCursor =
    firstPage.status === 'success'
      ? extra && extra.items.length > 0
        ? extra.cursor
        : firstPage.data.nextCursor
      : null;

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    const result = await callApi(
      api.GET('/inventory/movements', {
        params: { query: { productId, limit: PAGE_SIZE, cursor: nextCursor } },
      }),
    );
    setLoadingMore(false);
    if (!result.ok) {
      setMoreError(failureMessage(result.failure));
      return;
    }
    setMore({
      key,
      items: [...(extra?.items ?? []), ...result.data.items],
      cursor: result.data.nextCursor,
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Movimientos</h3>

      {firstPage.status === 'loading' && <ListSkeleton label="Cargando movimientos…" rows={3} />}
      {firstPage.status === 'error' && (
        <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />
      )}
      {firstPage.status === 'success' && items.length === 0 && (
        <EmptyState
          icon={History}
          title="Sin movimientos"
          description="Registra un conteo para cargar el stock inicial."
        />
      )}
      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {items.map((movement) => (
            <MovementRow key={movement.id} movement={movement} />
          ))}
        </ul>
      )}

      {moreError && <FormError>{moreError}</FormError>}
      {nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </section>
  );
}

function MovementRow({ movement }: { movement: InventoryMovement }) {
  const delta = Number(movement.quantityDelta);
  const reason = present(movement.reason);

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{MOVEMENT_LABELS[movement.type]}</span>
        <span className={delta < 0 ? 'font-semibold text-[var(--danger)]' : 'font-semibold'}>
          {formatSigned(delta)}
        </span>
      </div>
      <span className="text-xs text-[var(--muted-foreground)]">
        {dateFormat.format(new Date(movement.occurredAt))}
      </span>
      {movement.type === 'COUNT' &&
        movement.countedQuantity !== null &&
        movement.previousBalance !== null && (
          <span className="text-sm text-[var(--muted-foreground)]">
            Contado {formatQuantity(movement.countedQuantity)} · saldo anterior{' '}
            {formatQuantity(movement.previousBalance)}
          </span>
        )}
      {/* Ajuste por cantidad física (BR-P7b); los ajustes anteriores a R3 no la tienen. */}
      {movement.type === 'ADJUSTMENT' &&
        movement.countedQuantity !== null &&
        movement.previousBalance !== null && (
          <span className="text-sm text-[var(--muted-foreground)]">
            En el estante {formatQuantity(movement.countedQuantity)} · el sistema decía{' '}
            {formatQuantity(movement.previousBalance)}
          </span>
        )}
      {reason && <span className="text-sm">{reason}</span>}
    </li>
  );
}
