'use client';

import { Boxes, Package, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { ProductImage } from '@/components/products/product-image';
import { Button, buttonVariants } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { buildCategoryTree } from '@/lib/products/categories';
import { formatPrice, type Product } from '@/lib/products/format';
import { rememberProducts } from '@/lib/products/product-lookup';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 30;

type Attribute = 'brand' | 'viscosity' | 'presentation';
const ATTRIBUTES: {
  key: Attribute;
  facet: 'brands' | 'viscosities' | 'presentations';
  label: string;
}[] = [
  { key: 'brand', facet: 'brands', label: 'Marca' },
  { key: 'viscosity', facet: 'viscosities', label: 'Viscosidad' },
  { key: 'presentation', facet: 'presentations', label: 'Presentación' },
];

/**
 * Catálogo visual (R2): búsqueda siempre visible (nombre, marca, código,
 * viscosidad, presentación o vehículo compatible), categorías y subcategorías
 * como chips, filtros por atributo con los valores que de verdad existen, y
 * tarjetas con imagen (placeholder hasta DEC-34), precio o "Sin precio".
 */
export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [topId, setTopId] = useState('');
  const [subId, setSubId] = useState('');
  const [attributes, setAttributes] = useState<Partial<Record<Attribute, string>>>({});
  const [missingPrice, setMissingPrice] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const term = useDebouncedValue(search.trim(), 400);
  const categoryId = subId || topId;

  const categories = useApiQuery('product-categories', () =>
    callApi(api.GET('/product-categories')),
  );
  const tree = categories.status === 'success' ? buildCategoryTree(categories.data) : [];
  const top = tree.find((node) => node.id === topId);

  const facets = useApiQuery(`product-facets:${categoryId}`, () =>
    callApi(api.GET('/products/facets', { params: { query: categoryId ? { categoryId } : {} } })),
  );

  const filterKey = JSON.stringify([term, categoryId, attributes, missingPrice, showInactive]);
  const query = (cursor?: string) => ({
    limit: PAGE_SIZE,
    isActive: !showInactive,
    ...(term ? { search: term } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...attributes,
    ...(missingPrice ? { missingPrice: true } : {}),
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

  function chooseTop(id: string) {
    setTopId(id);
    setSubId('');
    setAttributes({});
  }

  function toggleAttribute(key: Attribute, value: string) {
    setAttributes((current) => {
      const next = { ...current };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const filtered = Boolean(
    term || categoryId || Object.keys(attributes).length || missingPrice || showInactive,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Productos"
        action={
          <div className="flex gap-2">
            <Link href="/inventario" className={buttonVariants({ variant: 'outline' })}>
              <Boxes className="mr-1 size-4" aria-hidden />
              Inventario
            </Link>
            <Link href="/productos/nuevo" className={buttonVariants()}>
              <Plus className="mr-1 size-4" aria-hidden />
              Nuevo
            </Link>
          </div>
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
          placeholder="Nombre, marca, código o vehículo"
          aria-label="Buscar productos por nombre, marca, código, viscosidad o vehículo compatible"
          className="pl-9"
        />
      </div>

      {categories.status === 'error' && (
        <FormError>
          No se pudieron cargar las categorías.{' '}
          <button type="button" className="underline" onClick={categories.reload}>
            Reintentar
          </button>
        </FormError>
      )}

      {tree.length > 0 && (
        <ChipRow label="Categorías">
          <Chip selected={!topId} onClick={() => chooseTop('')}>
            Todas
          </Chip>
          {tree.map((node) => (
            <Chip key={node.id} selected={topId === node.id} onClick={() => chooseTop(node.id)}>
              {node.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      {top && top.children.length > 0 && (
        <ChipRow label={`Subcategorías de ${top.name}`}>
          <Chip selected={!subId} onClick={() => setSubId('')}>
            Todo {top.name}
          </Chip>
          {top.children.map((child) => (
            <Chip
              key={child.id}
              selected={subId === child.id}
              onClick={() => {
                setSubId(child.id);
                setAttributes({});
              }}
            >
              {child.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      {facets.status === 'success' &&
        ATTRIBUTES.map(({ key, facet, label }) => {
          const values = facets.data[facet].filter((value) => value.count > 0);
          if (values.length === 0) return null;
          return (
            <ChipRow key={key} label={label}>
              {values.map((value) => (
                <Chip
                  key={value.value}
                  selected={attributes[key] === value.value}
                  onClick={() => toggleAttribute(key, value.value)}
                >
                  {value.value}
                  <span className="text-xs opacity-70">{value.count}</span>
                </Chip>
              ))}
            </ChipRow>
          );
        })}

      <ChipRow label="Estado">
        <Chip selected={missingPrice} onClick={() => setMissingPrice((v) => !v)}>
          Sin precio
        </Chip>
        <Chip selected={showInactive} onClick={() => setShowInactive((v) => !v)}>
          Inactivos
        </Chip>
      </ChipRow>

      {firstPage.status === 'loading' && <LoadingState label="Buscando productos…" />}

      {firstPage.status === 'error' && (
        <ErrorState message={failureMessage(firstPage.failure)} onRetry={firstPage.reload} />
      )}

      {firstPage.status === 'success' && items.length === 0 && (
        <EmptyState
          icon={Package}
          title={filtered ? 'Sin resultados' : 'Todavía no hay productos'}
          description={
            filtered
              ? 'Prueba con otra búsqueda o quita algún filtro.'
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
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

function ProductCard({ product }: { product: Product }) {
  const price = formatPrice(product.salePrice);
  const details = [product.brand, product.viscosity, product.presentation].filter(Boolean);
  return (
    <Link
      href={`/productos/${product.id}`}
      className="flex h-full flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 hover:bg-[var(--muted)]"
    >
      <ProductImage product={product} />
      <span className="line-clamp-2 text-sm font-medium break-words">{product.name}</span>
      {details.length > 0 && (
        <span className="truncate text-xs text-[var(--muted-foreground)]">
          {details.join(' · ')}
        </span>
      )}
      <span className="mt-auto flex flex-wrap items-center gap-1">
        {price ? (
          <span className="text-sm font-semibold">{price}</span>
        ) : (
          <Badge tone="warning">Sin precio</Badge>
        )}
        {!product.isActive && <Badge>Inactivo</Badge>}
      </span>
    </Link>
  );
}
