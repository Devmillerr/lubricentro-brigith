'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatQuantity, type ProductWithStock } from '@/lib/inventory/format';
import { DUE_RULE_LABELS, formatDate, formatKm } from '@/lib/maintenance/format';
import type { SavedMaintenance } from './maintenance-form';

/**
 * Confirmación tras guardar (07-UI-UX.md §3.3, "Después de guardar"): avisos
 * no bloqueantes que devolvió la API, el recordatorio creado y el saldo
 * actual de cada producto con control de stock que se usó.
 */
export function MaintenanceSaved({
  saved,
  vehicleId,
}: {
  saved: SavedMaintenance;
  vehicleId: string;
}) {
  const { maintenance, reminder, warnings } = saved.result;
  const productName = (productId?: string) =>
    maintenance.items.find((item) => item.productId === productId)?.productNameSnapshot;

  return (
    <div className="flex flex-col gap-5">
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 font-medium"
      >
        <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        Mantenimiento registrado.
      </p>

      {warnings.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-4 text-sm">
          <h3 className="font-semibold">Avisos (se guardó igual)</h3>
          {warnings.map((warning, index) => (
            <div key={`${warning.code}-${index}`} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span>
                  {productName(warning.productId) ? `${productName(warning.productId)}: ` : ''}
                  {warning.message}
                  {warning.balance !== undefined && warning.requestedQuantity !== undefined
                    ? ` Saldo ${formatQuantity(warning.balance)}, cantidad ${formatQuantity(warning.requestedQuantity)}.`
                    : ''}
                </span>
                {warning.productId &&
                  (warning.code === 'INSUFFICIENT_STOCK' ||
                    warning.code === 'PRODUCT_NOT_COUNTED') && (
                    <Link
                      href={`/inventario/${warning.productId}`}
                      className="w-fit font-medium underline underline-offset-4"
                    >
                      Contar
                    </Link>
                  )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-1 rounded-lg border border-[var(--border)] p-4 text-sm">
        <h3 className="font-semibold">Próximo mantenimiento</h3>
        {reminder ? (
          <>
            {reminder.dueKm !== null && <span>Km: {formatKm(reminder.dueKm)}</span>}
            {reminder.dueDate && <span>Fecha: {formatDate(reminder.dueDate)}</span>}
            <span className="text-[var(--muted-foreground)]">
              Aviso: {DUE_RULE_LABELS[reminder.dueRule].toLowerCase()}
            </span>
          </>
        ) : (
          <span className="text-[var(--muted-foreground)]">
            Sin recordatorio: no se indicó próximo km ni fecha.
          </span>
        )}
      </section>

      {saved.stockProducts.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-4 text-sm">
          <h3 className="font-semibold">Stock actual</h3>
          {saved.stockProducts.map((product) => (
            <CurrentStock key={product.id} product={product} />
          ))}
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/mantenimientos/${maintenance.id}`}
          className={buttonVariants({ size: 'lg', className: 'flex-1' })}
        >
          Ver mantenimiento
        </Link>
        <Link
          href={`/vehiculos/${vehicleId}`}
          className={buttonVariants({ variant: 'outline', size: 'lg', className: 'flex-1' })}
        >
          Volver al vehículo
        </Link>
      </div>
    </div>
  );
}

function CurrentStock({ product }: { product: ProductWithStock }) {
  const stock = useApiQuery(`stock-after:${product.id}`, () =>
    callApi(api.GET('/inventory/stock', { params: { query: { productId: product.id } } })),
  );

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate">{product.name}</span>
      <span className="shrink-0 font-medium">
        {stock.status === 'loading' && '…'}
        {stock.status === 'error' && (
          <button type="button" onClick={stock.reload} className="underline">
            Reintentar
          </button>
        )}
        {stock.status === 'success' &&
          (stock.data.isCounted
            ? `${formatQuantity(stock.data.balance)} ${product.unit}`
            : 'Sin conteo inicial')}
      </span>
    </div>
  );
}
