'use client';

import { ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import { formatPrice, type Product } from '@/lib/products/format';
import { rememberProducts } from '@/lib/products/product-lookup';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 20;

/** Catálogo (`GET /products`): búsqueda por nombre, marca o código y filtro por categoría. */
export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const term = useDebouncedValue(search.trim(), 400);
  const filterKey = `${term}|${categoryId}`;

  const categories = useApiQuery('product-categories', () =>
    callApi(api.GET('/product-categories')),
  );

  const query = (cursor?: string) => ({
    limit: PAGE_SIZE,
    ...(term ? { search: term } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(cursor ? { cursor } : {}),
  });

  const firstPage = useApiQuery(`products:${filterKey}`, async () => {
    const result = await callApi(api.GET('/products', { params: { query: query() } }));
    if (result.ok) rememberProducts(result.data.items);
    return result;
  });

  const [more, setMore] = useState<{ key: string; items: Product[]; cursor: string | null }>({
    key: '',
    items: [],
    cursor: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const extra = more.key === filterKey ? more : null;
  const items: Product[] =
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
    const result = await callApi(api.GET('/products', { params: { query: query(nextCursor) } }));
    setLoadingMore(false);
    if (!result.ok) {
      setMoreError(failureMessage(result.failure));
      return;
    }
    rememberProducts(result.data.items);
    setMore({
      key: filterKey,
      items: [...(extra?.items ?? []), ...result.data.items],
      cursor: result.data.nextCursor,
    });
  }

  const filtered = Boolean(term || categoryId);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Productos"
        action={
          <Link href="/productos/nuevo" className={buttonVariants()}>
            <Plus className="mr-1 size-4" aria-hidden />
            Nuevo
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, marca o código"
            aria-label="Buscar productos por nombre, marca o código"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Filtrar por categoría"
          disabled={categories.status !== 'success'}
          className="sm:w-56"
        >
          <option value="">
            {categories.status === 'loading'
              ? 'Cargando categorías…'
              : categories.status === 'error'
                ? 'Categorías no disponibles'
                : 'Todas las categorías'}
          </option>
          {categories.status === 'success' &&
            categories.data.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </Select>
      </div>

      {firstPage.status === 'loading' && <LoadingState label="Buscando productos…" />}

      {firstPage.status === 'error' && (
        <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />
      )}

      {firstPage.status === 'success' && items.length === 0 && (
        <EmptyState
          title={filtered ? 'Sin resultados' : 'Todavía no hay productos'}
          description={
            filtered
              ? 'Revisa la búsqueda o la categoría, o registra un producto nuevo.'
              : 'Registra el primer producto del catálogo.'
          }
          action={
            <Link href="/productos/nuevo" className={buttonVariants()}>
              Crear producto
            </Link>
          }
        />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {items.map((product) => {
            const details = [present(product.brand), present(product.code)].filter(Boolean);
            const price = formatPrice(product.salePrice);
            return (
              <li key={product.id}>
                <Link
                  href={`/productos/${product.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{product.name}</span>
                    <span className="truncate text-sm text-[var(--muted-foreground)]">
                      {[...details, product.unit].join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {price && <span className="text-sm font-medium">{price}</span>}
                    {!product.isActive && <Badge>Inactivo</Badge>}
                  </span>
                  <ChevronRight className="size-5 text-[var(--muted-foreground)]" aria-hidden />
                </Link>
              </li>
            );
          })}
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
