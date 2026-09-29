'use client';

import { ChevronRight, History, Package, PackagePlus, Search, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { StockAlerts } from '@/components/inventory/stock-alerts';
import { buttonVariants } from '@/components/ui/button';
import { StockBadge } from '@/components/inventory/stock-badge';
import { chipClass } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import {
  formatQuantity,
  stockStatus,
  type ProductWithStock,
  type StockStatus,
} from '@/lib/inventory/format';
import { loadCatalogWithStock, MAX_PAGES } from '@/lib/inventory/load-stock';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'not-counted' | 'out' | 'available';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'not-counted', label: 'Sin conteo' },
  { value: 'out', label: 'Sin stock' },
  { value: 'available', label: 'Con stock' },
];

function matchesSearch(product: ProductWithStock, term: string): boolean {
  if (!term) return true;
  const needle = term.toLocaleLowerCase('es');
  return [product.name, product.brand, product.code].some((value) =>
    value?.toLocaleLowerCase('es').includes(needle),
  );
}

/**
 * Inventario (07-UI-UX.md §3.6, dentro de Productos): saldo y estado de
 * conteo por producto, con "Contar" en cada fila para cargar el stock
 * inicial de una vez o de a uno (DEC-21 pendiente; sirve para ambos).
 */
export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const catalog = useApiQuery('inventory:catalog', loadCatalogWithStock);

  if (catalog.status === 'loading') return <LoadingState label="Cargando inventario…" />;

  const header = (
    <PageHeader
      title="Inventario"
      back={{ href: '/productos', label: 'Productos' }}
      action={
        <div className="flex gap-2">
          <Link
            href="/inventario/recepciones"
            aria-label="Recepciones"
            className={buttonVariants({
              variant: 'outline',
              className: 'w-11 px-0 sm:w-auto sm:px-4',
            })}
          >
            <History className="size-4 sm:mr-1" aria-hidden />
            <span className="hidden sm:inline">Recepciones</span>
          </Link>
          <Link href="/inventario/recepciones/nueva" className={buttonVariants()}>
            <PackagePlus className="mr-1 size-4" aria-hidden />
            Recibir
          </Link>
        </div>
      }
    />
  );

  if (catalog.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message={failureMessage(catalog.failure)} onRetry={catalog.reload} />
      </div>
    );
  }

  const withStatus = catalog.data.products.map((product) => ({
    product,
    status: stockStatus(product, product.stock),
  }));
  const counts: Record<StockStatus, number> = {
    untracked: 0,
    'not-counted': 0,
    out: 0,
    available: 0,
  };
  for (const { status } of withStatus) counts[status]++;

  const term = search.trim();
  const visible = withStatus.filter(
    ({ product, status }) =>
      matchesSearch(product, term) && (filter === 'all' || status === filter),
  );

  return (
    <div className="flex flex-col gap-5">
      {header}

      {catalog.data.products.length > 0 && (
        <StockAlerts
          onShowNotCounted={() => {
            setSearch('');
            setFilter('not-counted');
            document
              .getElementById('inventory-products')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      )}

      <h3 id="inventory-products" className="scroll-mt-20 text-lg font-bold">
        Productos
      </h3>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, marca o código"
          aria-label="Buscar en el inventario por nombre, marca o código"
          className="pl-9"
        />
      </div>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={chipClass(filter === option.value)}
          >
            {option.label}
            {option.value !== 'all' && (
              <span className="ml-1.5 opacity-70">{counts[option.value]}</span>
            )}
          </button>
        ))}
      </div>

      {catalog.data.truncated && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Se muestran los primeros {MAX_PAGES * 100} productos.
        </p>
      )}

      {catalog.data.products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Todavía no hay productos"
          description="Registra productos en el catálogo para llevar su inventario."
          action={
            <Link href="/productos/nuevo" className={buttonVariants()}>
              Crear producto
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Sin resultados"
          description="Prueba con otra búsqueda o filtro."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {visible.map(({ product, status }) => (
            <InventoryRow key={product.id} product={product} status={status} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InventoryRow({ product, status }: { product: ProductWithStock; status: StockStatus }) {
  const details = [present(product.brand), present(product.code)].filter(Boolean).join(' · ');
  const showBalance = status === 'available' || status === 'out';

  return (
    <li className="flex items-center gap-2 pr-2">
      <Link
        href={`/inventario/${product.id}`}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
      >
        {/* El estado va bajo el nombre: así el nombre no compite por ancho con el badge y "Contar". */}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 font-medium break-words">{product.name}</span>
          <span className="truncate text-sm text-[var(--muted-foreground)]">
            {details || product.unit}
          </span>
          {status !== 'available' && (
            <span className="mt-1 flex">
              <StockBadge status={status} />
            </span>
          )}
        </span>
        {showBalance && product.stock && (
          <span
            className={cn(
              'shrink-0 text-base font-semibold',
              status === 'out' && 'text-[var(--danger)]',
            )}
          >
            {formatQuantity(product.stock.balance)}
            <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
              {product.unit}
            </span>
          </span>
        )}
        <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
      {status === 'not-counted' && (
        <Link
          href={`/inventario/${product.id}`}
          className={buttonVariants({ variant: 'outline', className: 'h-10 shrink-0 px-3' })}
        >
          Contar
        </Link>
      )}
    </li>
  );
}
