'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { VoidSale } from '@/components/sales/void-sale';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import { formatQuantity } from '@/lib/inventory/format';
import {
  PAYMENT_LABELS,
  SOURCE_LABELS,
  formatMoney,
  saleDateFormat,
  salesHistoryHref,
} from '@/lib/sales/format';

/**
 * Detalle genérico de una venta (`GET /sales/{id}`, B-135) con **Anular**.
 * Sirve igual para mostrador y lavado (DEC-68): no hay detalle propio de lavado.
 */
export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`sale:${id}`, () =>
    callApi(api.GET('/sales/{id}', { params: { path: { id } } })),
  );

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Venta" back={{ href: salesHistoryHref(), label: 'Ventas' }} />
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{ title: 'Venta no encontrada', href: salesHistoryHref(), label: 'Ver ventas' }}
        />
      </div>
    );
  }

  const sale = query.data;
  const voided = sale.status === 'VOIDED';
  const isWash = sale.source === 'WASH';
  const note = present(sale.note);
  const title = isWash ? (sale.lines[0]?.descriptionSnapshot ?? 'Lavado') : 'Venta';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        subtitle={
          <span className="flex items-center gap-2">
            {SOURCE_LABELS[sale.source]}
            {voided && <Badge>Anulada</Badge>}
          </span>
        }
        back={{
          href: salesHistoryHref(sale.source),
          label: isWash ? 'Lavados' : 'Ventas',
        }}
      />

      <dl className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-4 text-sm">
        <Row label="Total">
          <span
            className={voided ? 'text-base font-semibold line-through' : 'text-base font-semibold'}
          >
            {formatMoney(sale.total)}
          </span>
        </Row>
        <Row label="Pago">{PAYMENT_LABELS[sale.paymentMethod]}</Row>
        <Row label="Fecha">{saleDateFormat.format(new Date(sale.occurredAt))}</Row>
        {note && <Row label="Nota">{note}</Row>}
      </dl>

      {!isWash && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Detalle</h3>
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {sale.lines.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium break-words">{line.descriptionSnapshot}</span>
                  <span className="text-sm text-[var(--muted-foreground)]">
                    {formatQuantity(line.quantity)} × {formatMoney(line.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{formatMoney(line.subtotal)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {voided ? (
        <section className="flex flex-col gap-1 rounded-lg border border-[var(--border)] p-4 text-sm">
          <h3 className="font-semibold">Anulada</h3>
          {sale.voidedAt && <span>{saleDateFormat.format(new Date(sale.voidedAt))}</span>}
          {present(sale.voidReason) && (
            <span className="text-[var(--muted-foreground)]">Motivo: {sale.voidReason}</span>
          )}
        </section>
      ) : (
        <VoidSale sale={sale} onVoided={query.reload} />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}
