'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MovementHistory } from '@/components/inventory/movement-history';
import { StockBadge } from '@/components/inventory/stock-badge';
import { StockOperationForm } from '@/components/inventory/stock-operation-form';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { ErrorState, LoadingState, PageSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import {
  formatQuantity,
  MOVEMENT_LABELS,
  stockStatus,
  type StockStatus,
  type MovementType,
} from '@/lib/inventory/format';
import { findProduct } from '@/lib/products/product-lookup';
import { BucketGauge, hasContainer } from '@/components/products/bucket-gauge';
import { cn } from '@/lib/utils';

/** Inventario de un producto: saldo, Contar / Ingreso / Ajuste e historial. */
export default function ProductInventoryPage() {
  const { id } = useParams<{ id: string }>();
  const product = useApiQuery(`product:${id}`, () => findProduct(id));
  const stock = useApiQuery(`stock:${id}`, () =>
    callApi(api.GET('/inventory/stock', { params: { query: { productId: id } } })),
  );
  const [version, setVersion] = useState(0);
  const [lastRegistered, setLastRegistered] = useState<MovementType | null>(null);

  const back = { href: '/inventario', label: 'Inventario' };
  const notFound = {
    title: 'Producto no encontrado',
    href: '/inventario',
    label: 'Ver inventario',
  };

  if (product.status === 'loading') return <PageSkeleton label="Cargando producto…" />;
  if (product.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Inventario" back={back} />
        <QueryError failure={product.failure} onRetry={product.reload} notFound={notFound} />
      </div>
    );
  }

  const data = product.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.name}
        subtitle={
          <Link
            href={`/productos/${data.id}`}
            className="-my-3 inline-flex min-h-11 items-center font-medium text-[var(--foreground)] underline underline-offset-4"
          >
            Ver ficha del producto
          </Link>
        }
        back={back}
      />

      {stock.status === 'loading' && <LoadingState label="Cargando saldo…" />}
      {stock.status === 'error' &&
        (stock.failure.status === 404 || stock.failure.status === 400 ? (
          <QueryError failure={stock.failure} onRetry={stock.reload} notFound={notFound} />
        ) : (
          <ErrorState message={failureMessage(stock.failure)} onRetry={stock.reload} />
        ))}

      {stock.status === 'success' && (
        <>
          {lastRegistered && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-md border border-[var(--success)]/40 bg-[var(--success-soft)] px-3 py-2.5 text-sm font-medium"
            >
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
              {MOVEMENT_LABELS[lastRegistered]} registrado. Stock actual:{' '}
              {formatQuantity(stock.data.balance)} {data.unit}.
            </p>
          )}

          <StockCard
            balance={stock.data.balance}
            unit={data.unit}
            status={stockStatus(data, stock.data)}
            negative={stock.data.balance < 0}
            tracksStock={data.tracksStock}
          />
          {hasContainer(data) && data.tracksStock && (
            <BucketGauge
              product={data}
              balance={stock.data.balance}
              counted={stock.data.isCounted}
            />
          )}

          <StockOperationForm
            productId={data.id}
            productActive={data.isActive}
            stock={stock.data}
            onRegistered={(movement) => {
              setLastRegistered(movement.type);
              setVersion((value) => value + 1);
              stock.reload();
            }}
          />
        </>
      )}

      <MovementHistory productId={data.id} version={version} />
    </div>
  );
}

function StockCard({
  balance,
  unit,
  status,
  negative,
  tracksStock,
}: {
  balance: number;
  unit: string;
  status: StockStatus;
  negative: boolean;
  tracksStock: boolean;
}) {
  return (
    <Card className="gap-2">
      <span className="text-sm font-medium text-[var(--muted-foreground)]">Saldo actual</span>
      <span
        className={cn(
          'font-display text-4xl leading-none font-bold',
          negative && 'text-[var(--danger)]',
        )}
      >
        {formatQuantity(balance)}
        <span className="ml-2 text-base font-normal text-[var(--muted-foreground)]">{unit}</span>
      </span>
      <div>
        <StockBadge status={status} />
      </div>
      {!tracksStock && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Este producto no controla stock: los mantenimientos no lo descuentan.
        </p>
      )}
    </Card>
  );
}
