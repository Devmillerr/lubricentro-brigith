'use client';

import { useParams } from 'next/navigation';
import { ReceiptDetail } from '@/components/inventory/receipt-detail';
import { ReceiptPurchaseInfo } from '@/components/inventory/receipt-purchase-info';
import { ReceiptVoid } from '@/components/inventory/receipt-void';
import { ReceiptPayable } from '@/components/payables/receipt-payable';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { PageSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, type ApiResult } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { loadReceiptProducts, type InventoryReceipt } from '@/lib/inventory/receipts';
import type { Product } from '@/lib/products/format';

async function loadReceipt(
  id: string,
): Promise<ApiResult<{ receipt: InventoryReceipt; products: Map<string, Product> }>> {
  const receipt = await callApi(api.GET('/inventory/receipts/{id}', { params: { path: { id } } }));
  if (!receipt.ok) return receipt;
  const products = await loadReceiptProducts(receipt.data.lines.map((line) => line.productId));
  if (!products.ok) return products;
  return { ok: true, data: { receipt: receipt.data, products: products.data } };
}

/** Detalle de una recepción con sus líneas (`GET /inventory/receipts/:id`). */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const receipt = useApiQuery(`receipt:${id}`, () => loadReceipt(id));

  const back = { href: '/inventario/recepciones', label: 'Recepciones' };

  if (receipt.status === 'loading') return <PageSkeleton label="Cargando recepción…" />;
  if (receipt.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Recepción" back={back} />
        <QueryError
          failure={receipt.failure}
          onRetry={receipt.reload}
          notFound={{
            title: 'Recepción no encontrada',
            href: '/inventario/recepciones',
            label: 'Ver recepciones',
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Recepción" back={back} />
      <ReceiptDetail receipt={receipt.data.receipt} products={receipt.data.products} />
      <ReceiptPurchaseInfo receipt={receipt.data.receipt} onSaved={receipt.reload} />
      <ReceiptPayable receipt={receipt.data.receipt} onSaved={receipt.reload} />
      <ReceiptVoid
        receipt={receipt.data.receipt}
        products={receipt.data.products}
        onVoided={receipt.reload}
      />
    </div>
  );
}
