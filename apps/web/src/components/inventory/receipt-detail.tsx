import { CalendarClock, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { present } from '@/lib/customers/format';
import { formatQuantity } from '@/lib/inventory/format';
import {
  productCountLabel,
  receiptDateFormat,
  type InventoryReceipt,
} from '@/lib/inventory/receipts';
import type { Product } from '@/lib/products/format';
import { formatMoney } from '@/lib/sales/format';

/**
 * Cabecera y líneas de una recepción (07-UI-UX.md §3.6, "Historial de
 * recepciones"): producto, cantidad recibida, monto pagado si se registró
 * (DEC-90) y saldo resultante. Solo lectura: los movimientos no se editan
 * (BR-P3). Las recepciones anteriores no tienen monto: no se inventa.
 */
export function ReceiptDetail({
  receipt,
  products,
}: {
  receipt: InventoryReceipt;
  /** Datos de los productos por id; si falta uno, se muestra sin nombre. */
  products: Map<string, Product>;
}) {
  const note = present(receipt.note);
  const missingCost = receipt.lines.filter((line) => line.purchaseCost === null).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <p className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
          {receiptDateFormat.format(new Date(receipt.occurredAt))}
        </p>
        <p className="text-[var(--muted-foreground)]">{productCountLabel(receipt.lines.length)}</p>
        <p className="flex items-baseline justify-between gap-3 border-t border-[var(--border)] pt-2">
          <span className="font-semibold">Total pagado</span>
          {receipt.totalCost !== null ? (
            <span className="text-lg font-bold">{formatMoney(receipt.totalCost)}</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">Sin monto registrado</span>
          )}
        </p>
        {receipt.totalCost !== null && missingCost > 0 && (
          <p className="text-xs text-[var(--muted-foreground)]">
            {missingCost === 1 ? '1 producto sin monto' : `${missingCost} productos sin monto`}: no
            se suma al total.
          </p>
        )}
        {note && (
          <p className="flex items-start gap-2 break-words">
            <StickyNote
              className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]"
              aria-hidden
            />
            <span className="min-w-0">{note}</span>
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">Productos recibidos</h3>
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {receipt.lines.map((line) => {
            const product = products.get(line.productId);
            const details = product
              ? [present(product.brand), present(product.code)].filter(Boolean).join(' · ')
              : '';
            return (
              <li key={line.id}>
                <Link
                  href={`/inventario/${line.productId}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium break-words">
                      {product?.name ?? 'Producto no disponible'}
                    </span>
                    {details && (
                      <span className="truncate text-xs text-[var(--muted-foreground)]">
                        {details}
                      </span>
                    )}
                    {line.resultingBalance !== null && (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        Saldo después: {formatQuantity(line.resultingBalance)}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="text-base font-semibold">
                      +{formatQuantity(line.quantityDelta)}
                      {product && (
                        <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
                          {product.unit}
                        </span>
                      )}
                    </span>
                    {line.purchaseCost !== null && (
                      <span className="text-sm">{formatMoney(line.purchaseCost)}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
