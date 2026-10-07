'use client';

import { Boxes, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { CompatibilitiesSection } from '@/components/products/compatibilities-section';
import { ProductImage } from '@/components/products/product-image';
import { SaleUnitsSection } from '@/components/products/sale-units-section';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { PageSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { present } from '@/lib/customers/format';
import { categoryPath } from '@/lib/products/categories';
import { formatPrice, type Product } from '@/lib/products/format';
import { findProduct, rememberProducts } from '@/lib/products/product-lookup';

/**
 * Ficha del producto con sus formas de venta (DEC-91) y modelos compatibles;
 * desactivar y reactivar (BR-G5).
 */
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`product:${id}`, () => findProduct(id));
  const categories = useApiQuery('product-categories', () =>
    callApi(api.GET('/product-categories')),
  );

  if (query.status === 'loading') return <PageSkeleton label="Cargando producto…" />;
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Producto" back={{ href: '/productos', label: 'Productos' }} />
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{ title: 'Producto no encontrado', href: '/productos', label: 'Ver productos' }}
        />
      </div>
    );
  }

  const product = query.data;
  const categoryText = !product.categoryId
    ? null
    : ((categories.status === 'success'
        ? categoryPath(categories.data, product.categoryId)
        : null) ?? (categories.status === 'loading' ? 'Cargando…' : 'Categoría no disponible'));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product.name}
        subtitle={!product.isActive ? <Badge>Inactivo</Badge> : undefined}
        back={{ href: '/productos', label: 'Productos' }}
        action={
          <Link
            href={`/productos/${product.id}/editar`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Pencil className="mr-1 size-4" aria-hidden />
            Editar
          </Link>
        }
      />

      <ProductImage product={product} size="lg" />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <Detail label="Marca">{present(product.brand)}</Detail>
        <Detail label="Código">{present(product.code)}</Detail>
        <Detail label="Viscosidad">{present(product.viscosity)}</Detail>
        <Detail label="Presentación">{present(product.presentation)}</Detail>
        <Detail label="Unidad">{product.unit}</Detail>
        <Detail label="Categoría">{categoryText}</Detail>
        <Detail label="Precio de venta">{formatPrice(product.salePrice) ?? 'Pendiente'}</Detail>
        <Detail label="Stock">
          {product.tracksStock ? 'Controla stock' : 'No controla stock'}
        </Detail>
      </dl>

      <Link href={`/inventario/${product.id}`} className={buttonVariants({ variant: 'outline' })}>
        <Boxes className="mr-2 size-4" aria-hidden />
        Inventario: saldo, conteo, ingreso y ajuste
      </Link>

      <SaleUnitsSection product={product} onSaved={query.reload} />

      <CompatibilitiesSection productId={product.id} />

      {product.isActive ? (
        <DeactivateProduct product={product} onDone={query.reload} />
      ) : (
        <ReactivateProduct product={product} onDone={query.reload} />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className={children ? 'break-words' : 'text-[var(--muted-foreground)]'}>
        {children ?? '—'}
      </dd>
    </div>
  );
}

/** `DELETE /products/{id}` lo desactiva (BR-G5: nunca se borra). */
function DeactivateProduct({ product, onDone }: { product: Product; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deactivate() {
    setWorking(true);
    setError(null);
    const result = await callApi(
      api.DELETE('/products/{id}', { params: { path: { id: product.id } } }),
    );
    setWorking(false);
    if (!result.ok) {
      setError(failureMessage(result.failure, { notFound: 'Este producto ya no existe.' }));
      return;
    }
    rememberProducts([{ ...product, isActive: false }]);
    setConfirming(false);
    onDone();
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--border)] pt-5">
      {error && <FormError>{error}</FormError>}
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--danger)]/60 bg-[var(--danger-soft)] p-4">
          <p className="text-sm">
            El producto dejará de estar activo. No se borra: su historial se conserva.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={deactivate}
              disabled={working}
              variant="destructive"
              className="flex-1"
            >
              {working ? 'Desactivando…' : 'Sí, desactivar'}
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={working}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Desactivar producto
        </Button>
      )}
    </section>
  );
}

/** `PATCH /products/{id}` con `isActive: true`: vuelve al catálogo, con su historial intacto. */
function ReactivateProduct({ product, onDone }: { product: Product; onDone: () => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reactivate() {
    setWorking(true);
    setError(null);
    const result = await callApi(
      api.PATCH('/products/{id}', {
        params: { path: { id: product.id } },
        body: { isActive: true },
      }),
    );
    setWorking(false);
    if (!result.ok) {
      setError(failureMessage(result.failure, { notFound: 'Este producto ya no existe.' }));
      return;
    }
    rememberProducts([result.data]);
    onDone();
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--border)] pt-5">
      {error && <FormError>{error}</FormError>}
      <p className="text-sm text-[var(--muted-foreground)]">
        Este producto está inactivo: no aparece en el catálogo ni en mantenimientos.
      </p>
      <Button onClick={reactivate} disabled={working}>
        {working ? 'Reactivando…' : 'Reactivar producto'}
      </Button>
    </section>
  );
}
