'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { present } from '@/lib/customers/format';
import {
  PAYMENT_LABELS,
  formatMoney,
  saleDateFormat,
  salesHistoryHref,
  type Sale,
} from '@/lib/sales/format';

/** Confirmación del cobro: qué se cobró, cómo y cuándo; luego otro lavado o volver al inicio. */
export function WashSaved({ sale, onNew }: { sale: Sale; onNew: () => void }) {
  const line = sale.lines[0];
  const note = present(sale.note);

  return (
    <div className="flex flex-col gap-5">
      <p
        role="status"
        className="flex items-center gap-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-lg font-bold"
      >
        <CircleCheck className="size-7 shrink-0 text-[var(--success)]" aria-hidden />
        Lavado cobrado.
      </p>

      <dl className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <Row label="Vehículo">{line?.descriptionSnapshot ?? 'Lavado'}</Row>
        <Row label="Monto">
          <span className="text-base font-semibold">{formatMoney(sale.total)}</span>
        </Row>
        <Row label="Pago">{PAYMENT_LABELS[sale.paymentMethod]}</Row>
        <Row label="Fecha">{saleDateFormat.format(new Date(sale.occurredAt))}</Row>
        {note && <Row label="Nota">{note}</Row>}
      </dl>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onNew}>
          Nuevo lavado
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Volver al inicio
        </Link>
        <Link
          href={`/ventas/${sale.id}`}
          className="py-2 text-center text-sm font-medium underline underline-offset-4"
        >
          Ver detalle
        </Link>
        <Link
          href={salesHistoryHref('WASH')}
          className="py-2 text-center text-sm font-medium underline underline-offset-4"
        >
          Ver lavados registrados
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}
