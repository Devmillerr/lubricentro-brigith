'use client';

import { CircleCheck, Info } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ReceiptDetail } from '@/components/inventory/receipt-detail';
import { ReceiptForm } from '@/components/inventory/receipt-form';
import { FormError } from '@/components/customers/form-error';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/states';
import { failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import type { ProductWithStock } from '@/lib/inventory/format';
import { loadProductToReceive, type InventoryReceipt } from '@/lib/inventory/receipts';
import type { Product } from '@/lib/products/format';

/**
 * Recibir mercadería (07-UI-UX.md §3.6, cambios de R3): varios productos,
 * todo o nada. `?producto=` llega desde "Ingreso" en el inventario de un
 * producto y lo deja agregado con cantidad 1.
 */
export default function NewReceiptPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewReceipt />
    </Suspense>
  );
}

function NewReceipt() {
  const productId = useSearchParams().get('producto');
  const initial = useApiQuery(productId ? `receive-product:${productId}` : null, () =>
    loadProductToReceive(productId!),
  );
  const [saved, setSaved] = useState<{
    receipt: InventoryReceipt;
    products: Map<string, Product>;
  } | null>(null);
  // Cambia al empezar otra recepción, para montar un formulario vacío.
  const [formKey, setFormKey] = useState(0);

  const back = productId
    ? { href: `/inventario/${productId}`, label: 'Volver al producto' }
    : { href: '/inventario/recepciones', label: 'Recepciones' };

  function handleSaved(receipt: InventoryReceipt, products: ProductWithStock[]) {
    setSaved({ receipt, products: new Map(products.map((product) => [product.id, product])) });
    window.scrollTo({ top: 0 });
  }

  if (saved) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Recepción guardada" back={back} />
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Se sumó al stock de todos los productos.
        </p>
        <ReceiptDetail receipt={saved.receipt} products={saved.products} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={buttonVariants({ className: 'sm:flex-1' })}
            onClick={() => {
              setSaved(null);
              setFormKey((value) => value + 1);
            }}
          >
            Nueva recepción
          </button>
          <Link
            href={productId ? `/inventario/${productId}` : '/inventario'}
            className={buttonVariants({ variant: 'outline', className: 'sm:flex-1' })}
          >
            {productId ? 'Volver al producto' : 'Ver inventario'}
          </Link>
        </div>
      </div>
    );
  }

  const header = (
    <PageHeader
      title="Recibir mercadería"
      subtitle="Agrega todo lo que llegó y guárdalo junto."
      back={back}
    />
  );

  if (productId && initial.status === 'loading') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <LoadingState label="Cargando producto…" />
      </div>
    );
  }

  // Solo la primera recepción arranca con el producto; "Nueva recepción" empieza vacía.
  const fromIngreso = formKey === 0 && initial.status === 'success' ? initial.data : null;
  const initialProducts = fromIngreso?.isActive ? [fromIngreso] : [];

  return (
    <div className="flex flex-col gap-5">
      {header}
      {formKey === 0 && productId && (
        <IngresoNotice
          product={fromIngreso}
          error={
            initial.status === 'error'
              ? initial.failure.status === 404
                ? 'El producto ya no existe. Puedes agregar otros abajo.'
                : `${failureMessage(initial.failure)} Puedes agregarlo desde el buscador.`
              : null
          }
        />
      )}
      <ReceiptForm key={formKey} initialProducts={initialProducts} onSaved={handleSaved} />
    </div>
  );
}

/** Aviso de que "Ingreso" ahora se registra aquí, junto con otros productos si llegaron. */
function IngresoNotice({
  product,
  error,
}: {
  product: ProductWithStock | null;
  error: string | null;
}) {
  if (error) return <FormError>{error}</FormError>;
  if (product && !product.isActive) {
    return (
      <FormError>
        {product.name} está inactivo y no se puede recibir. Reactívalo desde su ficha o agrega otros
        productos.
      </FormError>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Los ingresos se registran como recepción. Ya agregamos{' '}
        {product ? <strong className="font-medium">{product.name}</strong> : 'el producto'}; revisa
        la cantidad y suma otros productos si llegaron juntos.
      </span>
    </p>
  );
}
