'use client';

import { ChevronRight, PhoneOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatDate, formatKm } from '@/lib/maintenance/format';
import {
  DUE_FILTER_LABELS,
  REASON_LABELS,
  STATUS_LABELS,
  type DueFilter,
  type ReminderListItem,
  type ReminderStatus,
} from '@/lib/reminders/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const DUE_FILTERS: DueFilter[] = ['now', 'upcoming', 'all'];
const STATUSES: ReminderStatus[] = ['PENDING', 'CONTACTED', 'DONE', 'DISMISSED'];

/**
 * Avisar (07-UI-UX.md §3.4): recordatorios ordenados por urgencia (la API
 * ordena por fecha; los solo-km van al final). "Corresponde avisar" lo
 * calcula la API en cada consulta (BR-R3, BR-R4, BR-R6).
 */
export default function RemindersPage() {
  const [due, setDue] = useState<DueFilter>('now');
  const [status, setStatus] = useState<ReminderStatus | ''>('');
  const filterKey = `${due}|${status}`;

  const query = (cursor?: string) => ({
    due,
    limit: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
  });

  const types = useApiQuery('maintenance-types', () => callApi(api.GET('/maintenance-types')));
  const firstPage = useApiQuery(`reminders:${filterKey}`, () =>
    callApi(api.GET('/reminders', { params: { query: query() } })),
  );

  const [more, setMore] = useState<{
    key: string;
    items: ReminderListItem[];
    cursor: string | null;
  }>({ key: '', items: [], cursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const extra = more.key === filterKey ? more : null;
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
    const result = await callApi(api.GET('/reminders', { params: { query: query(nextCursor) } }));
    setLoadingMore(false);
    if (!result.ok) {
      setMoreError(failureMessage(result.failure));
      return;
    }
    setMore({
      key: filterKey,
      items: [...(extra?.items ?? []), ...result.data.items],
      cursor: result.data.nextCursor,
    });
  }

  const typeName = (id: string) =>
    types.status === 'success' ? types.data.find((type) => type.id === id)?.name : undefined;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Avisar" />

      <div className="flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
          {DUE_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={due === value}
              onClick={() => setDue(value)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3 text-sm font-medium',
                due === value
                  ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)]',
              )}
            >
              {DUE_FILTER_LABELS[value]}
            </button>
          ))}
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as ReminderStatus | '')}
          aria-label="Filtrar por estado"
          className="sm:w-56"
        >
          <option value="">Abiertos (pendientes y contactados)</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {firstPage.status === 'loading' && <LoadingState label="Cargando recordatorios…" />}
      {firstPage.status === 'error' && (
        <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />
      )}

      {firstPage.status === 'success' && items.length === 0 && (
        <EmptyState
          title={due === 'now' ? 'No hay a quién avisar ahora' : 'Sin recordatorios'}
          description={
            due === 'now'
              ? 'Un recordatorio solo por km aparece cuando el vehículo vuelve y se registra su km. Revisa «Próximos».'
              : 'Los recordatorios se crean al registrar un mantenimiento con próximo km o fecha.'
          }
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {items.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              typeName={typeName(reminder.maintenanceTypeId)}
            />
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

function ReminderRow({
  reminder,
  typeName,
}: {
  reminder: ReminderListItem;
  typeName: string | undefined;
}) {
  const next = [formatDate(reminder.dueDate), formatKm(reminder.dueKm)].filter(Boolean).join(' · ');

  return (
    <li>
      <Link
        href={`/avisar/${reminder.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="font-semibold tracking-wide">{reminder.plate}</span>
            <span className="truncate text-sm text-[var(--muted-foreground)]">
              {reminder.customerName ?? 'Sin cliente'}
            </span>
          </span>
          <span className="truncate text-sm">{[typeName, next].filter(Boolean).join(' · ')}</span>
          {reminder.reason && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                reminder.reason === 'NO_PHONE' && 'text-[var(--danger)]',
              )}
            >
              {reminder.reason === 'NO_PHONE' && <PhoneOff className="size-3.5" aria-hidden />}
              {REASON_LABELS[reminder.reason]}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {reminder.status !== 'PENDING' && <Badge>{STATUS_LABELS[reminder.status]}</Badge>}
          {!reminder.hasPhone && reminder.reason !== 'NO_PHONE' && <Badge>Sin teléfono</Badge>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
    </li>
  );
}
