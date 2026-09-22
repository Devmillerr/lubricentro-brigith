'use client';

import { ProductForm } from '@/components/products/product-form';
import { PageHeader } from '@/components/ui/page-header';

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Nuevo producto" back={{ href: '/productos', label: 'Productos' }} />
      <ProductForm />
    </div>
  );
}
