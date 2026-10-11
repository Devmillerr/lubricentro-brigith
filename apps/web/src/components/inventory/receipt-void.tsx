'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { MOVEMENT_LABELS, formatQuantity, type MovementType } from '@/lib/inventory/format';
import { receiptDateFormat, type InventoryReceipt } from '@/lib/inventory/receipts';
import type { Product } from '@/lib/products/format';

interface LaterMovement {
  movementId: string;
  productId: string;
  name: string;
  type: MovementType;
  occurredAt: string;
}

interface ShortProduct {
  productId: string;
  name: string;
  unit: string;
  balance: string;
  received: string;
}

/**
 * Anular una recepción (R8, DEC-97, BR-K6). Exige motivo y confirmación. Si la
 * API la rechaza, se explica por qué y se ofrecen alternativas seguras, que
 * solo llevan a otra pantalla: el sistema nunca cambia cantidades ni crea
 * ajustes por su cuenta.
 */
export function ReceiptVoid({
  receipt,
  products,
  onVoided,
}: {
  receipt: InventoryReceipt;
  products: Map<string, Product>;
  onVoided: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotency = useIdempotencyKey();

  if (receipt.voidedAt) {
    return (
      <section className="flex flex-col gap-1 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm">
        <h3 className="text-base font-semibold">Recepción anulada</h3>
        <p>
          Anulada el {receiptDateFormat.format(new Date(receipt.voidedAt))}. Lo que sumó se descontó
          del stock y no cuenta en las compras del mes.
        </p>
        {receipt.voidReason && <p className="break-words">Motivo: {receipt.voidReason}</p>}
      </section>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setReasonError('Escribe el motivo de la anulación (al menos 3 caracteres).');
      return;
    }
    setReasonError(undefined);
    setFailure(null);
    setSaving(true);
    const body = { reason: trimmed };
    const result = await callApi(
      api.POST('/inventory/receipts/{id}/void', {
        params: {
          path: { id: receipt.id },
          header: { 'Idempotency-Key': idempotency.keyFor({ id: receipt.id, ...body }) },
        },
        body,
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    idempotency.reset();
    setOpen(false);
    onVoided();
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="self-start">
        Anular recepción
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h3 className="text-base font-semibold">Anular recepción</h3>
      <p className="text-sm text-[var(--muted-foreground)]">
        Se descuenta del stock lo que sumó esta recepción y deja de contar en las compras del mes.
        La recepción queda en el historial como anulada. No se puede deshacer.
      </p>
      <Field id="void-reason" label="Motivo" error={reasonError}>
        <Textarea
          id="void-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Ej.: se registró dos veces"
          aria-invalid={!!reasonError || undefined}
        />
      </Field>
      {failure && <VoidRejection failure={failure} receipt={receipt} products={products} />}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? 'Anulando…' : 'Confirmar anulación'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function AdjustLink({ productId, name }: { productId: string; name: string }) {
  return (
    <Link
      href={`/inventario/${productId}`}
      className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
    >
      Ajustar stock de {name}
    </Link>
  );
}

/** Motivo del rechazo y alternativas (07-UI-UX.md, R8). */
function VoidRejection({
  failure,
  receipt,
  products,
}: {
  failure: ApiFailure;
  receipt: InventoryReceipt;
  products: Map<string, Product>;
}) {
  const nameOf = (id: string) => products.get(id)?.name ?? 'el producto';
  const lineProducts = [...new Set(receipt.lines.map((line) => line.productId))];

  switch (failure.code) {
    case 'RECEIPT_ALREADY_VOIDED':
      return <FormError>Esta recepción ya fue anulada. Recarga la página para verla.</FormError>;
    case 'RECEIPT_PREDATES_AUDIT':
      return (
        <div role="alert" className="flex flex-col gap-1 text-sm">
          <p className="text-[var(--danger)]">
            Esta recepción se registró antes del control de anulaciones, por eso no se puede anular.
            Si la cantidad estaba mal, corrige el stock con un ajuste.
          </p>
          {lineProducts.map((id) => (
            <AdjustLink key={id} productId={id} name={nameOf(id)} />
          ))}
        </div>
      );
    case 'RECEIPT_HAS_LATER_MOVEMENTS': {
      const movements = ((failure.data as { movements?: LaterMovement[] } | undefined)?.movements ??
        []) as LaterMovement[];
      const ids = [...new Set(movements.map((m) => m.productId))];
      return (
        <div role="alert" className="flex flex-col gap-1 text-sm">
          <p className="text-[var(--danger)]">
            No se puede anular: después de esta recepción hubo movimientos de estos productos.
            Anularla cambiaría un stock que ya se vendió, se usó o se contó.
          </p>
          <ul className="list-disc pl-5">
            {movements.map((m) => (
              <li key={m.movementId}>
                {m.name}: {MOVEMENT_LABELS[m.type] ?? m.type} del{' '}
                {receiptDateFormat.format(new Date(m.occurredAt))}
              </li>
            ))}
          </ul>
          <p>Si la cantidad recibida estaba mal, corrígela con un ajuste:</p>
          {ids.map((id) => (
            <AdjustLink key={id} productId={id} name={nameOf(id)} />
          ))}
        </div>
      );
    }
    case 'RECEIPT_VOID_NEGATIVE_STOCK': {
      const short = ((failure.data as { products?: ShortProduct[] } | undefined)?.products ??
        []) as ShortProduct[];
      return (
        <div role="alert" className="flex flex-col gap-1 text-sm">
          <p className="text-[var(--danger)]">No se puede anular: el stock quedaría negativo.</p>
          <ul className="list-disc pl-5">
            {short.map((p) => (
              <li key={p.productId}>
                {p.name}: hay {formatQuantity(p.balance)} {p.unit} y la recepción sumó{' '}
                {formatQuantity(p.received)} {p.unit}
              </li>
            ))}
          </ul>
          {short.map((p) => (
            <AdjustLink key={p.productId} productId={p.productId} name={p.name} />
          ))}
        </div>
      );
    }
    case 'PAYABLE_HAS_PAYMENTS':
      return (
        <div role="alert" className="flex flex-col gap-1 text-sm">
          <p className="text-[var(--danger)]">
            No se puede anular: la deuda de esta compra tiene pagos registrados. Primero anula los
            pagos.
          </p>
          <Link
            href={
              receipt.payable ? `/cuentas-por-pagar/${receipt.payable.id}` : '/cuentas-por-pagar'
            }
            className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
          >
            Ver la deuda y sus pagos
          </Link>
        </div>
      );
    default:
      return <FormError>{failureMessage(failure)}</FormError>;
  }
}
