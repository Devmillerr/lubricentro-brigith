'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { present } from '@/lib/customers/format';
import { formatQuantity } from '@/lib/inventory/format';
import { PAYMENT_LABELS, formatMoney, saleDateFormat } from '@/lib/sales/format';
import type { CreateSaleResult } from './sale-form';

/**
 * Confirmación de la venta con los datos que devolvió la API (total del
 * servidor). Sin "Deshacer": para revertirla se usa **Anular** con motivo
 * desde el detalle (BR-V7). Los avisos `PRODUCT_NOT_COUNTED` no bloquean (DEC-27).
 */
export function SaleSaved({ result, onNew }: { result: CreateSaleResult; onNew: () => void }) {
  const note = present(result.note);
  const productName = (productId: string) =>
    result.lines.find((line) => line.productId === productId)?.descriptionSnapshot;

  return (
    <div className="flex flex-col gap-5">
      <p
        role="status"
        className="flex items-center gap-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-lg font-bold"
      >
        <CircleCheck className="size-7 shrink-0 text-[var(--success)]" aria-hidden />
        Venta cobrada.
      </p>

      {result.warnings.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent-soft)] p-4 text-sm">
          <h3 className="text-base font-semibold">Avisos (se cobró igual)</h3>
          {result.warnings.map((warning) => (
            <p key={`${warning.code}-${warning.productId}`} className="flex items-start gap-2">
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-[var(--accent-strong)]"
                aria-hidden
              />
              <span>
                {productName(warning.productId) ? `${productName(warning.productId)}: ` : ''}
                {warning.message}
              </span>
            </p>
          ))}
        </section>
      )}

      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden text-sm">
        {result.lines.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="font-medium break-words">{line.descriptionSnapshot}</span>
              <span className="text-[var(--muted-foreground)]">
                {formatQuantity(line.quantity)}
                {line.saleUnitLabel ? ` ${line.saleUnitLabel}` : ''} × {formatMoney(line.unitPrice)}
              </span>
            </span>
            <span className="shrink-0 font-medium">{formatMoney(line.subtotal)}</span>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <Row label="Total">
          <span className="text-base font-semibold">{formatMoney(result.total)}</span>
        </Row>
        <Row label="Pago">{PAYMENT_LABELS[result.paymentMethod]}</Row>
        <Row label="Fecha">{saleDateFormat.format(new Date(result.occurredAt))}</Row>
        {note && <Row label="Nota">{note}</Row>}
      </dl>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onNew}>
          Nueva venta
        </Button>
        <Link
          href={`/ventas/${result.id}`}
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          Ver detalle
        </Link>
        <Link
          href="/dashboard"
          className="flex min-h-11 items-center justify-center text-sm font-medium underline underline-offset-4"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}
