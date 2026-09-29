'use client';

import { ChevronRight, Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle, present, type Customer } from '@/lib/customers/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 20;

/** Clientes (`GET /customers?search=`), búsqueda por nombre o teléfono y paginación por cursor. */
export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 400);

  const firstPage = useApiQuery(`customers:${term}`, () =>
    callApi(
      api.GET('/customers', {
        params: { query: { limit: PAGE_SIZE, ...(term ? { search: term } : {}) } },
      }),
    ),
  );

  // Páginas extra ("Cargar más"), atadas al término que las pidió.
  const [more, setMore] = useState<{ term: string; items: Customer[]; cursor: string | null }>({
    term: '',
    items: [],
    cursor: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const extra = more.term === term ? more : null;
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
      api.GET('/customers', {
        params: {
          query: { limit: PAGE_SIZE, cursor: nextCursor, ...(term ? { search: term } : {}) },
        },
      }),
    );
    setLoadingMore(false);
    if (!result.ok) {
      setMoreError(failureMessage(result.failure));
      return;
    }
    setMore({
      term,
      items: [...(extra?.items ?? []), ...result.data.items],
      cursor: result.data.nextCursor,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clientes"
        back={{ href: '/mas', label: 'Más' }}
        action={
          <Link href="/clientes/nuevo" className={buttonVariants()}>
            <Plus className="mr-1 size-4" aria-hidden />
            Nuevo
          </Link>
        }
      />

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar clientes por nombre o teléfono"
          className="pl-9"
        />
      </div>

      {firstPage.status === 'loading' && <ListSkeleton label="Buscando clientes…" />}

      {firstPage.status === 'error' && (
        <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />
      )}

      {firstPage.status === 'success' && items.length === 0 && (
        <EmptyState
          icon={Users}
          title={term ? `Sin resultados para «${term}»` : 'Todavía no hay clientes'}
          description={
            term
              ? 'Revisa lo escrito o registra un cliente nuevo.'
              : 'Registra el primero; ningún dato es obligatorio.'
          }
          action={
            <Link href="/clientes/nuevo" className={buttonVariants()}>
              Crear cliente
            </Link>
          }
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {items.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/clientes/${customer.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{customerTitle(customer)}</span>
                  <span className="truncate text-sm text-[var(--muted-foreground)]">
                    {present(customer.phone) ?? 'Sin teléfono'}
                  </span>
                </span>
                {!customer.isActive && <Badge>Inactivo</Badge>}
                <ChevronRight className="size-5 text-[var(--muted-foreground)]" aria-hidden />
              </Link>
            </li>
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
