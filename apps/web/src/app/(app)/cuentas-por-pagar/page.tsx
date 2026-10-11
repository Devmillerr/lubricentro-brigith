'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import {
  STATUS_CLASSES,
  STATUS_LABELS,
  daysUntil,
  formatAmount,
  formatDay,
  type Payable,
} from '@/lib/payables/format';

const FILTERS = [
  { value: 'OPEN', label: 'Por pagar' },
  { value: 'OVERDUE', label: 'Vencidas' },
  { value: 'PAID', label: 'Pagadas' },
  { value: 'VOIDED', label: 'Anuladas' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

/**
 * Cuentas por pagar (R8, DEC-98): cuánto se debe a cada proveedor, por moneda,
 * qué está vencido y qué vence pronto. Los totales nunca suman soles con
 * dólares (DEC-100).
 */
export default function PayablesPage() {
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [supplierId, setSupplierId] = useState('');
  const summary = useApiQuery('payables:summary', () => callApi(api.GET('/payables/summary')));
  const suppliers = useApiQuery('suppliers:all', () =>
    callApi(api.GET('/suppliers', { params: { query: { includeInactive: true } } })),
  );
  const list = useApiQuery(`payables:${filter}:${supplierId}`, () =>
    callApi(
      api.GET('/payables', {
        params: { query: { status: filter, ...(supplierId ? { supplierId } : {}) } },
      }),
    ),
  );
  const today = summary.status === 'success' ? summary.data.today : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cuentas por pagar" subtitle="Lo que debes a tus proveedores" />

      {summary.status === 'success' && summary.data.currencies.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {summary.data.currencies.map((c) => (
            <div
              key={c.currency}
              className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <span className="text-sm text-[var(--muted-foreground)]">
                Por pagar en {c.currency === 'USD' ? 'dólares' : 'soles'}
              </span>
              <span className="text-2xl font-bold">{formatAmount(c.openBalance, c.currency)}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {c.openCount === 1 ? '1 deuda' : `${c.openCount} deudas`}
              </span>
              {c.overdueCount > 0 && (
                <span className="text-sm font-medium text-[var(--danger)]">
                  Vencido: {formatAmount(c.overdueBalance, c.currency)} ({c.overdueCount})
                </span>
              )}
              {c.dueSoonCount > 0 && (
                <span className="text-sm text-[var(--accent-strong)]">
                  Vence en 7 días: {formatAmount(c.dueSoonBalance, c.currency)} ({c.dueSoonCount})
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Estado">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className="min-h-11 rounded-full border border-[var(--border)] px-4 text-sm aria-pressed:border-[var(--primary)] aria-pressed:bg-[var(--primary)] aria-pressed:text-[var(--primary-foreground)]"
            >
              {f.label}
            </button>
          ))}
        </div>
        <Select
          aria-label="Proveedor"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="sm:ml-auto sm:w-64"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.status === 'success' &&
            suppliers.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </Select>
      </div>

      {list.status === 'loading' && <ListSkeleton label="Cargando deudas…" />}
      {list.status === 'error' && (
        <ErrorState message={failureMessage(list.failure)} onRetry={list.reload} />
      )}
      {list.status === 'success' &&
        (list.data.length === 0 ? (
          <EmptyState
            title="No hay deudas aquí"
            description="Las compras al crédito aparecen en esta lista con su vencimiento."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {list.data.map((payable) => (
              <PayableRow key={payable.id} payable={payable} today={today} />
            ))}
          </ul>
        ))}
    </div>
  );
}

function PayableRow({ payable, today }: { payable: Payable; today: string | null }) {
  const days = today ? daysUntil(payable.dueDate, today) : null;
  const open = ['PENDING', 'PARTIAL', 'OVERDUE'].includes(payable.status);
  return (
    <li>
      <Link
        href={`/cuentas-por-pagar/${payable.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium break-words">{payable.supplier?.name ?? 'Proveedor'}</span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {[payable.receipt?.documentRef, `vence el ${formatDay(payable.dueDate)}`]
              .filter(Boolean)
              .join(' · ')}
            {open &&
              days !== null &&
              days >= 0 &&
              days <= 7 &&
              ` (en ${days} ${days === 1 ? 'día' : 'días'})`}
            {open &&
              days !== null &&
              days < 0 &&
              ` (hace ${-days} ${days === -1 ? 'día' : 'días'})`}
          </span>
          <span
            className={`self-start rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[payable.status]}`}
          >
            {STATUS_LABELS[payable.status]}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="font-semibold">{formatAmount(payable.balance, payable.currency)}</span>
          {payable.paidAmount !== '0.00' && (
            <span className="text-xs text-[var(--muted-foreground)]">
              de {formatAmount(payable.originalAmount, payable.currency)}
            </span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
    </li>
  );
}
