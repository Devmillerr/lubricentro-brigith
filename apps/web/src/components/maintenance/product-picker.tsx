'use client';

import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page-header';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import { formatQuantity, type ProductWithStock } from '@/lib/inventory/format';
import type { Product } from '@/lib/products/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/** Saldo o "sin conteo inicial" (BR-P8) junto a un producto (07-UI-UX.md §3.3.3). */
export function StockHint({ product }: { product: ProductWithStock }) {
  if (!product.tracksStock) return <Badge>No controla stock</Badge>;
  if (!product.stock) return null;
  if (!product.stock.isCounted) return <Badge>Sin conteo inicial</Badge>;
  return (
    <span className="text-xs text-[var(--muted-foreground)]">
      Saldo {formatQuantity(product.stock.balance)} {product.unit}
    </span>
  );
}

/**
 * Buscador de productos usados (07-UI-UX.md §3.3.3): por código, nombre o
 * marca, con su saldo. Arriba, los compatibles confirmados con el modelo del
 * vehículo (`GET /vehicles/{id}/compatible-products`), si los hay.
 */
export function ProductPicker({
  vehicleId,
  excludedIds,
  onAdd,
}: {
  vehicleId: string;
  excludedIds: Set<string>;
  onAdd: (product: Product | ProductWithStock) => void;
}) {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 400);

  const compatible = useApiQuery(`vehicle-compatible:${vehicleId}`, () =>
    callApi(api.GET('/vehicles/{id}/compatible-products', { params: { path: { id: vehicleId } } })),
  );
  const results = useApiQuery(term ? `maintenance-products:${term}` : null, () =>
    callApi(
      api.GET('/products', {
        params: { query: { search: term, includeStock: true, isActive: true, limit: 10 } },
      }),
    ),
  );

  const compatibleAvailable =
    compatible.status === 'success'
      ? compatible.data.filter((product) => product.isActive && !excludedIds.has(product.id))
      : [];

  return (
    <div className="flex flex-col gap-3">
      {compatibleAvailable.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--muted-foreground)]">
            Compatibles con este vehículo
          </span>
          <div className="flex flex-wrap gap-2">
            {compatibleAvailable.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onAdd(product)}
                className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-sm hover:bg-[var(--muted)]"
              >
                <Plus className="size-4" aria-hidden />
                {product.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto por código, nombre o marca"
          aria-label="Buscar producto usado"
          className="pl-9"
        />
      </div>

      {term && results.status === 'loading' && (
        <p className="text-sm text-[var(--muted-foreground)]">Buscando…</p>
      )}
      {term && results.status === 'error' && (
        <p className="text-sm text-[var(--danger)]">
          {failureMessage(results.failure)}{' '}
          <button type="button" onClick={results.reload} className="underline">
            Reintentar
          </button>
        </p>
      )}
      {term && results.status === 'success' && (
        <SearchResults
          products={results.data.items.filter((product) => !excludedIds.has(product.id))}
          onAdd={(product) => {
            onAdd(product);
            setSearch('');
          }}
        />
      )}
    </div>
  );
}

function SearchResults({
  products,
  onAdd,
}: {
  products: ProductWithStock[];
  onAdd: (product: ProductWithStock) => void;
}) {
  if (products.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">Sin resultados.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
      {products.map((product) => {
        const details = [present(product.brand), present(product.code)].filter(Boolean).join(' · ');
        return (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onAdd(product)}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--muted)]"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{product.name}</span>
                <span className="truncate text-xs text-[var(--muted-foreground)]">
                  {details || product.unit}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StockHint product={product} />
                {!product.isActive && <Badge>Inactivo</Badge>}
              </span>
              <Plus className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
