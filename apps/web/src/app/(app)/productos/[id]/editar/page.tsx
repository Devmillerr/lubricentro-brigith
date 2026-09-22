'use client';

import { useParams } from 'next/navigation';
import { ProductForm } from '@/components/products/product-form';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/use-api-query';
import { findProduct } from '@/lib/products/product-lookup';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`product:${id}`, () => findProduct(id));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Editar producto"
        subtitle={query.status === 'success' ? query.data.name : undefined}
        back={{ href: `/productos/${id}`, label: 'Volver al producto' }}
      />
      {query.status === 'loading' && <LoadingState />}
      {query.status === 'error' && (
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{ title: 'Producto no encontrado', href: '/productos', label: 'Ver productos' }}
        />
      )}
      {query.status === 'success' && <ProductForm product={query.data} />}
    </div>
  );
}
