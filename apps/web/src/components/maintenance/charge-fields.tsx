'use client';

import { Banknote, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page-header';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage } from '@/lib/api/request';
import {
  PAYMENT_LABELS,
  formatMoney,
  parsePrice,
  saleDateFormat,
  type PaymentMethod,
  type Sale,
} from '@/lib/sales/format';
import { cn } from '@/lib/utils';

/**
 * Monto del cobro de un mantenimiento: > 0 con hasta 2 decimales, como
 * `totalAmount` (R6, DEC-72). null si no es válido. Solo valida el formato: el
 * total guardado es el que devuelve la API.
 */
export function parseChargeAmount(raw: string): number | null {
  const value = parsePrice(raw);
  return value !== null && value > 0 ? value : null;
}

export const CHARGE_AMOUNT_ERROR = 'Ingresa un monto mayor que 0 (hasta 2 decimales).';

/** Método de pago (Efectivo / Yape, DEC-30) y monto único del cobro (BR-V3). */
export function ChargeFields({
  idPrefix,
  method,
  onMethod,
  amount,
  onAmount,
  amountError,
}: {
  idPrefix: string;
  method: PaymentMethod | null;
  onMethod: (method: PaymentMethod) => void;
  amount: string;
  onAmount: (amount: string) => void;
  amountError?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Método de pago" className="grid grid-cols-2 gap-3">
        {(['CASH', 'YAPE'] as const).map((option) => {
          const Icon = option === 'CASH' ? Banknote : Smartphone;
          const selected = method === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onMethod(option)}
              className={cn(
                'flex min-h-14 items-center justify-center gap-2 rounded-lg border px-3 text-base font-semibold',
                selected
                  ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                  : 'border-[var(--border)] hover:bg-[var(--muted)]',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {PAYMENT_LABELS[option]}
            </button>
          );
        })}
      </div>
      <Field
        id={`${idPrefix}-amount`}
        label="Total cobrado (S/)"
        hint="Un solo monto: producto y mano de obra."
        error={amountError}
      >
        <Input
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          aria-invalid={!!amountError || undefined}
          className="w-40"
        />
      </Field>
    </div>
  );
}

/** Cobro de un mantenimiento tal como lo devolvió la API: monto, pago y estado. */
export function ChargeSummary({ sale }: { sale: Sale | null }) {
  if (!sale) {
    return <p className="text-sm text-[var(--muted-foreground)]">Sin cobro.</p>;
  }
  const voided = sale.status === 'VOIDED';
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn('text-base font-semibold', voided && 'line-through')}>
          {formatMoney(sale.total)}
        </span>
        <span className="flex items-center gap-2">
          {PAYMENT_LABELS[sale.paymentMethod]}
          {voided && <Badge>Anulado</Badge>}
        </span>
      </div>
      <span className="text-[var(--muted-foreground)]">
        Cobrado el {saleDateFormat.format(new Date(sale.occurredAt))}
      </span>
      {voided && (
        <span className="text-[var(--muted-foreground)]">
          El cobro se anuló junto con el mantenimiento.
        </span>
      )}
      <Link href={`/ventas/${sale.id}`} className="w-fit font-medium underline underline-offset-4">
        Ver venta
      </Link>
    </div>
  );
}

/**
 * Cobro posterior de un mantenimiento activo y sin cobro (R6, DEC-72):
 * `POST /maintenances/{id}/charge` con `Idempotency-Key`. Tras cobrar (o si la
 * API dice que ya estaba cobrado o anulado) se recarga el detalle para
 * mostrar el estado real.
 */
export function ChargeLater({
  maintenanceId,
  onDone,
}: {
  maintenanceId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const idempotency = useIdempotencyKey();

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Cobrar
      </Button>
    );
  }

  async function confirm() {
    const totalAmount = parseChargeAmount(amount);
    setAmountError(totalAmount === null ? CHARGE_AMOUNT_ERROR : undefined);
    setError(method ? null : 'Elige Efectivo o Yape.');
    if (totalAmount === null || !method) return;

    setWorking(true);
    const body = { paymentMethod: method, totalAmount };
    const result = await callApi(
      api.POST('/maintenances/{id}/charge', {
        params: {
          path: { id: maintenanceId },
          header: { 'Idempotency-Key': idempotency.keyFor([maintenanceId, body]) },
        },
        body,
      }),
    );
    setWorking(false);
    if (result.ok) {
      idempotency.reset();
      setOpen(false);
      onDone();
      return;
    }
    const code = result.failure.code;
    if (code === 'MAINTENANCE_ALREADY_CHARGED' || code === 'MAINTENANCE_VOIDED') {
      idempotency.reset();
      setOpen(false);
      onDone();
      return;
    }
    setAmountError(result.failure.fieldErrors.totalAmount);
    setError(
      failureMessage(result.failure, {
        notFound: 'Este mantenimiento ya no existe.',
        byCode: {
          IDEMPOTENCY_KEY_IN_PROGRESS: 'El cobro todavía se está procesando. Espera un momento.',
          IDEMPOTENCY_KEY_REUSED: 'Los datos cambiaron mientras se reintentaba. Vuelve a cobrar.',
        },
      }),
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
      {error && <FormError>{error}</FormError>}
      <ChargeFields
        idPrefix="charge-later"
        method={method}
        onMethod={(value) => {
          setMethod(value);
          setError(null);
        }}
        amount={amount}
        onAmount={setAmount}
        amountError={amountError}
      />
      <div className="flex gap-2">
        <Button onClick={confirm} disabled={working} className="flex-1">
          {working ? 'Cobrando…' : 'Confirmar cobro'}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)} disabled={working}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
