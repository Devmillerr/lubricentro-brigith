'use client';

import { ChevronRight, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatQuantity } from '@/lib/inventory/format';
import { cn } from '@/lib/utils';

type StockAlert = Schemas['StockAlertProductResponse'];

/** Filas visibles por grupo antes de "Ver todos". */
const COLLAPSED = 5;

/**
 * Stock que requiere atención (07-UI-UX.md §3.6, BR-P19), con
 * `GET /inventory/alerts`: negativos y agotados (solo productos activos con
 * conteo, DEC-50) y, aparte, cuántos siguen sin conteo inicial, con acceso a
 * Contar. Es una lista, sin gráficos ni stock mínimo.
 */
export function StockAlerts({ onShowNotCounted }: { onShowNotCounted: () => void }) {
  const alerts = useApiQuery('inventory:alerts', () => callApi(api.GET('/inventory/alerts')));

  return (
    <section aria-labelledby="stock-alerts-title" className="flex flex-col gap-3">
      <h3 id="stock-alerts-title" className="text-lg font-semibold">
        Stock que requiere atención
      </h3>

      {alerts.status === 'loading' && (
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          Revisando el stock…
        </p>
      )}

      {alerts.status === 'error' && (
        <FormError>
          {failureMessage(alerts.failure)}{' '}
          <button type="button" className="underline" onClick={alerts.reload}>
            Reintentar
          </button>
        </FormError>
      )}

      {alerts.status === 'success' && (
        <>
          {alerts.data.negative.length === 0 && alerts.data.outOfStock.length === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-[var(--border)] px-4 py-3 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Ningún producto contado está agotado ni en negativo.
            </p>
          ) : (
            <>
              <AlertGroup
                title="Negativos"
                description="El sistema registra más salidas que lo que había. Cuenta o ajusta."
                items={alerts.data.negative}
                danger
              />
              <AlertGroup title="Agotados" items={alerts.data.outOfStock} />
            </>
          )}

          {alerts.data.notCountedCount > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                <span className="font-semibold">
                  {alerts.data.notCountedCount === 1
                    ? '1 producto sin conteo inicial'
                    : `${alerts.data.notCountedCount} productos sin conteo inicial`}
                </span>
                <span className="block text-[var(--muted-foreground)]">
                  Su saldo no es confiable, por eso no aparecen arriba.
                </span>
              </p>
              <Button variant="outline" className="shrink-0" onClick={onShowNotCounted}>
                Ver y contar
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AlertGroup({
  title,
  description,
  items,
  danger = false,
}: {
  title: string;
  description?: string;
  items: StockAlert[];
  danger?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, COLLAPSED);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h4 className={cn('text-sm font-semibold', danger && 'text-[var(--danger)]')}>
          {title} <span className="font-normal opacity-70">{items.length}</span>
        </h4>
        {description && <p className="text-xs text-[var(--muted-foreground)]">{description}</p>}
      </div>
      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {visible.map((item) => (
          <li key={item.productId}>
            <Link
              href={`/inventario/${item.productId}`}
              className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-[var(--muted)]"
            >
              <span className="min-w-0 flex-1 font-medium break-words">{item.name}</span>
              <span
                className={cn(
                  'shrink-0 text-base font-semibold',
                  item.balance < 0 && 'text-[var(--danger)]',
                )}
              >
                {formatQuantity(item.balance)}
                <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
                  {item.unit}
                </span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-[var(--muted-foreground)]"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
      {items.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="min-h-11 self-start text-sm font-medium underline underline-offset-4"
        >
          {expanded ? 'Ver menos' : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  );
}
