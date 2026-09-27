'use client';

import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage } from '@/lib/api/request';
import { MAX_SALE_TEXT, type Sale } from '@/lib/sales/format';

/**
 * Anular una venta (BR-V7, DEC-59): el motivo es obligatorio. La API devuelve
 * el stock de las líneas que lo movieron; un lavado no mueve stock (DEC-54).
 * Nada se borra: la venta queda en el historial como anulada. Lleva
 * `Idempotency-Key`: reintentar tras un fallo de red no anula dos veces.
 */
export function VoidSale({ sale, onVoided }: { sale: Sale; onVoided: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotency = useIdempotencyKey();
  const isWash = sale.source === 'WASH';

  async function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('Escribe el motivo de la anulación.');
      return;
    }
    setReasonError(null);
    setWorking(true);
    setError(null);
    const body = { reason: trimmed };
    const result = await callApi(
      api.POST('/sales/{id}/void', {
        params: {
          path: { id: sale.id },
          header: { 'Idempotency-Key': idempotency.keyFor([sale.id, body]) },
        },
        body,
      }),
    );
    setWorking(false);
    if (result.ok || result.failure.code === 'SALE_ALREADY_VOIDED') {
      idempotency.reset();
      setConfirming(false);
      onVoided();
      return;
    }
    if (result.failure.fieldErrors.reason) {
      setReasonError(result.failure.fieldErrors.reason);
      return;
    }
    setError(
      failureMessage(result.failure, {
        notFound: 'Esta venta ya no existe.',
        byCode: {
          IDEMPOTENCY_KEY_IN_PROGRESS:
            'La anulación todavía se está procesando. Espera un momento.',
        },
      }),
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--border)] pt-5">
      {error && <FormError>{error}</FormError>}
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--danger)] p-4">
          <p className="text-sm">
            {isWash
              ? 'El lavado queda en el historial como anulado. No cambia el stock.'
              : 'Se devolverá al stock lo vendido. La venta queda en el historial como anulada.'}
          </p>
          <Field id="void-reason" label="Motivo" error={reasonError ?? undefined}>
            <Input
              id="void-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MAX_SALE_TEXT}
              autoComplete="off"
              aria-invalid={reasonError ? true : undefined}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              onClick={confirm}
              disabled={working}
              className="flex-1 bg-[var(--danger)] text-white"
            >
              {working ? 'Anulando…' : 'Sí, anular'}
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={working}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          {isWash ? 'Anular lavado' : 'Anular venta'}
        </Button>
      )}
    </section>
  );
}
