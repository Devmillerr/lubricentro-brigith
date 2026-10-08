'use client';

import { Check, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { StockHint } from '@/components/maintenance/product-picker';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ListSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import { formatQuantity, parseQuantity, type ProductWithStock } from '@/lib/inventory/format';
import { buildCategoryTree } from '@/lib/products/categories';
import { formatStock } from '@/lib/products/container';
import type { ProductCategory } from '@/lib/products/format';
import { rememberProducts } from '@/lib/products/product-lookup';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';

/** Lo que cabe en una pantalla de teléfono; el resto, con "Cargar más" o buscando. */
const PAGE_SIZE = 10;

/**
 * Filtro rápido "Aceites auto/moto" (07-UI-UX.md §3.6, 10-OPERACION-REAL.md
 * §3.2d): la reposición semanal. Las categorías se editan desde
 * Configuración (DEC-37, sin enums), así que se buscan por nombre y el chip
 * solo aparece si la categoría existe.
 */
const QUICK_CATEGORY_NAMES = ['Aceite auto', 'Aceite moto'];

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('es');
}

function quickCategories(categories: ProductCategory[]): ProductCategory[] {
  return QUICK_CATEGORY_NAMES.flatMap((name) => {
    const found = categories.find((category) => normalize(category.name) === normalize(name));
    return found ? [found] : [];
  });
}

/**
 * Buscador del catálogo para Recibir y Vender (B-134): texto (nombre, marca,
 * código, viscosidad o vehículo), chips de categoría y filtro rápido de
 * aceites. Solo ofrece productos activos (BR-P21). Con "Todas" se ve el
 * catálogo desde el inicio, por páginas de 10, sin tener que buscar antes.
 * Tocar un producto ya agregado le suma 1.
 */
export function ReceiptProductPicker({
  quantities,
  onAdd,
  searchLabel = 'Buscar producto recibido por nombre, marca, código o viscosidad',
  stockDisplay = 'status',
}: {
  /** Cantidad escrita por producto ya agregado, para marcarlo en la lista. */
  quantities: Map<string, string>;
  onAdd: (product: ProductWithStock) => void;
  /** Etiqueta accesible del buscador. */
  searchLabel?: string;
  /**
   * `status`: saldo o estado del stock ("Sin conteo inicial", "No controla
   * stock"), útil al recibir. `balance`: solo el saldo de los productos
   * contados, lo que cambia algo al vender (no se puede vender más de lo que
   * hay); sin conteo se vende igual (DEC-27), así que no se marca.
   */
  stockDisplay?: 'status' | 'balance';
}) {
  const [search, setSearch] = useState('');
  const [topId, setTopId] = useState('');
  const [subId, setSubId] = useState('');
  const term = useDebouncedValue(search.trim(), 400);
  const categoryId = subId || topId;

  const categories = useApiQuery('product-categories', () =>
    callApi(api.GET('/product-categories')),
  );
  const flat = categories.status === 'success' ? categories.data : [];
  const tree = buildCategoryTree(flat);
  const quick = quickCategories(flat);
  const top = tree.find((node) => node.id === topId);

  const filterKey = JSON.stringify([term, categoryId]);
  const query = (cursor?: string) => ({
    limit: PAGE_SIZE,
    isActive: true,
    includeStock: true,
    ...(term ? { search: term } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(cursor ? { cursor } : {}),
  });

  const firstPage = useApiQuery(`receipt-products:${filterKey}`, async () => {
    const result = await callApi(api.GET('/products', { params: { query: query() } }));
    if (result.ok) rememberProducts(result.data.items);
    return result;
  });

  const [more, setMore] = useState<{
    key: string;
    items: ProductWithStock[];
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

  /** Un chip de categoría: de primer nivel o subcategoría (p. ej. los aceites rápidos). */
  function chooseCategory(id: string) {
    const category = flat.find((c) => c.id === id);
    const parentInTree = category?.parentId && tree.some((node) => node.id === category.parentId);
    if (category && parentInTree) {
      setTopId(category.parentId!);
      setSubId(category.id);
    } else {
      setTopId(id);
      setSubId('');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, marca, código o viscosidad"
          aria-label={searchLabel}
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
          <Chip selected={!categoryId} onClick={() => chooseCategory('')}>
            Todas
          </Chip>
          {quick.map((category) => (
            <Chip
              key={`quick-${category.id}`}
              selected={categoryId === category.id}
              onClick={() =>
                categoryId === category.id ? chooseCategory('') : chooseCategory(category.id)
              }
            >
              {category.name}
            </Chip>
          ))}
          {tree.map((node) => (
            <Chip
              key={node.id}
              selected={topId === node.id && !subId}
              onClick={() => chooseCategory(node.id)}
            >
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
            <Chip key={child.id} selected={subId === child.id} onClick={() => setSubId(child.id)}>
              {child.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      {firstPage.status === 'loading' && <ListSkeleton label="Buscando productos…" rows={4} />}
      {firstPage.status === 'error' && (
        <FormError>
          {failureMessage(firstPage.failure)}{' '}
          <button type="button" onClick={firstPage.reload} className="underline">
            Reintentar
          </button>
        </FormError>
      )}
      {firstPage.status === 'success' && items.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">No hay productos con ese filtro.</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {items.map((product) => (
            <PickerRow
              key={product.id}
              product={product}
              added={quantities.get(product.id)}
              stockDisplay={stockDisplay}
              onAdd={() => onAdd(product)}
            />
          ))}
        </ul>
      )}

      {moreError && <FormError>{moreError}</FormError>}
      {nextCursor && (
        <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </div>
  );
}

function PickerRow({
  product,
  added,
  stockDisplay,
  onAdd,
}: {
  product: ProductWithStock;
  added: string | undefined;
  stockDisplay: 'status' | 'balance';
  onAdd: () => void;
}) {
  const details = [present(product.brand), present(product.viscosity), present(product.code)]
    .filter(Boolean)
    .join(' · ');
  const addedQuantity = added === undefined ? null : parseQuantity(added);

  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        aria-label={added === undefined ? `Agregar ${product.name}` : `Sumar 1 a ${product.name}`}
        className={cn(
          'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--muted)]',
          added !== undefined && 'bg-[var(--muted)]',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium break-words">{product.name}</span>
          <span className="truncate text-xs text-[var(--muted-foreground)]">
            {details || product.unit}
          </span>
          {stockDisplay === 'status' ? (
            <StockHint product={product} />
          ) : (
            product.tracksStock &&
            product.stock?.isCounted && (
              <span className="text-xs text-[var(--muted-foreground)]">
                Saldo {formatStock(product.stock.balance, product.unit)}
              </span>
            )
          )}
        </span>
        {added !== undefined && (
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
            <Check className="size-4" aria-hidden />
            {addedQuantity !== null ? formatQuantity(addedQuantity) : '—'}
          </span>
        )}
        <Plus className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </button>
    </li>
  );
}
