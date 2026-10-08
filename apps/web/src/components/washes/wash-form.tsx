'use client';

import { Banknote, Smartphone } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { CHECKOUT_BUTTON_CLASS, CheckoutBar } from '@/components/ui/checkout-bar';
import { Field, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage } from '@/lib/api/request';
import {
  MAX_SALE_TEXT,
  PAYMENT_LABELS,
  formatMoney,
  type PaymentMethod,
  type Sale,
} from '@/lib/sales/format';
import { WASH_ERRORS, type WashType } from '@/lib/washes/format';
import { cn } from '@/lib/utils';
import { useSubmitLock } from '@/lib/use-submit-lock';

/** Códigos después de los cuales la lista de tipos y precios quedó vieja. */
const STALE_CODES = new Set([
  'WASH_TYPE_NOT_FOUND',
  'WASH_PRICE_NOT_FOUND',
  'WASH_PRICE_NOT_IN_TYPE',
  'WASH_TYPE_INACTIVE',
  'WASH_PRICE_INACTIVE',
]);

/**
 * Cobro de un lavado (07-UI-UX.md §3.9, B-146): tipo → precio (se salta si
 * hay uno) → Efectivo / Yape → nota opcional → Cobrar. Sin cliente ni placa
 * (DEC-44, BR-L2). `types` ya viene filtrado: solo tipos con algún precio
 * activo. El monto sale siempre de una opción (DEC-55): no hay monto libre.
 * `POST /washes` lleva `Idempotency-Key`: reintentar no cobra dos veces.
 */
export function WashForm({
  types,
  onSaved,
  onStale,
}: {
  types: WashType[];
  onSaved: (sale: Sale) => void;
  /** El tipo o el precio cambió en el servidor: la página recarga la lista y muestra `message`. */
  onStale: (message: string) => void;
}) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const [priceId, setPriceId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useSubmitLock();
  const [error, setError] = useState<string | null>(null);
  const idempotency = useIdempotencyKey();

  const type = types.find((candidate) => candidate.id === typeId) ?? null;
  const price = type?.prices.find((candidate) => candidate.id === priceId) ?? null;
  const ready = type !== null && price !== null && payment !== null;

  function chooseType(next: WashType) {
    setTypeId(next.id);
    // Con un solo precio, el paso se salta (07-UI-UX.md §3.9).
    setPriceId(next.prices.length === 1 ? next.prices[0]!.id : null);
    setError(null);
  }

  async function submit() {
    if (!type || !price || !payment) return;
    const trimmedNote = note.trim();
    const body = {
      washTypeId: type.id,
      priceOptionId: price.id,
      paymentMethod: payment,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };
    if (!lock.acquire()) return;
    setSaving(true);
    setError(null);
    const result = await callApi(
      api.POST('/washes', {
        params: { header: { 'Idempotency-Key': idempotency.keyFor(body) } },
        body,
      }),
    );
    lock.release();
    setSaving(false);
    if (result.ok) {
      idempotency.reset();
      onSaved(result.data);
      return;
    }
    const message = failureMessage(result.failure, { byCode: WASH_ERRORS });
    if (result.failure.code && STALE_CODES.has(result.failure.code)) {
      onStale(message);
      return;
    }
    setError(message);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Vehículo</h3>
        <div role="group" aria-label="Tipo de vehículo" className="grid grid-cols-2 gap-3">
          {types.map((candidate) => (
            <OptionButton
              key={candidate.id}
              selected={candidate.id === typeId}
              onClick={() => chooseType(candidate)}
              className="min-h-20"
            >
              <span className="text-base font-semibold break-words">{candidate.name}</span>
              <span className="text-sm opacity-80">
                {candidate.prices.map((option) => formatMoney(option.amount)).join(' · ')}
              </span>
            </OptionButton>
          ))}
        </div>
      </section>

      {type && type.prices.length > 1 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Precio</h3>
          <div role="group" aria-label="Precio" className="grid grid-cols-2 gap-3">
            {type.prices.map((option) => (
              <OptionButton
                key={option.id}
                selected={option.id === priceId}
                onClick={() => setPriceId(option.id)}
                className="min-h-16"
              >
                <span className="text-lg font-semibold">{formatMoney(option.amount)}</span>
                {option.label && <span className="text-sm opacity-80">{option.label}</span>}
              </OptionButton>
            ))}
          </div>
        </section>
      )}

      {type && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Pago</h3>
          <div role="group" aria-label="Método de pago" className="grid grid-cols-2 gap-3">
            {(['CASH', 'YAPE'] as const).map((method) => {
              const Icon = method === 'CASH' ? Banknote : Smartphone;
              return (
                <OptionButton
                  key={method}
                  selected={payment === method}
                  onClick={() => setPayment(method)}
                  className="min-h-14 flex-row gap-2"
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="text-base font-semibold">{PAYMENT_LABELS[method]}</span>
                </OptionButton>
              );
            })}
          </div>
        </section>
      )}

      {type && (
        <Field id="wash-note" label="Nota" optional>
          <Textarea
            id="wash-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={MAX_SALE_TEXT}
            rows={2}
          />
        </Field>
      )}

      <CheckoutBar error={error && <FormError>{error}</FormError>}>
        <Button
          size="lg"
          onClick={submit}
          disabled={!ready || saving}
          className={CHECKOUT_BUTTON_CLASS}
        >
          {saving
            ? 'Cobrando…'
            : !type
              ? 'Elige el vehículo'
              : !price
                ? 'Elige el precio'
                : !payment
                  ? 'Elige Efectivo o Yape'
                  : `Cobrar ${formatMoney(price.amount)}`}
        </Button>
      </CheckoutBar>
    </div>
  );
}

/** Opción grande que se toca (alto mínimo de 44 px); `selected` se anuncia con `aria-pressed`. */
function OptionButton({
  selected,
  children,
  className,
  ...props
}: { selected: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 text-center',
        selected
          ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
          : 'border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--muted)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
