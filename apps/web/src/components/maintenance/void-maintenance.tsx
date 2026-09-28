'use client';

import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage } from '@/lib/api/request';

/**
 * Anular (BR-M12): la API genera los movimientos inversos de sus productos y
 * descarta el recordatorio que había creado. No se borra nada. Lleva
 * `Idempotency-Key`: reintentar tras un fallo de red no anula dos veces. El
 * motivo es obligatorio desde R6 (DEC-71).
 */
export function VoidMaintenance({
  maintenanceId,
  onVoided,
}: {
  maintenanceId: string;
  onVoided: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotency = useIdempotencyKey();

  const trimmedReason = reason.trim();

  async function confirm() {
    if (!trimmedReason) return;
    setWorking(true);
    setError(null);
    const body = { reason: trimmedReason };
    const result = await callApi(
      api.POST('/maintenances/{id}/void', {
        params: {
          path: { id: maintenanceId },
          header: { 'Idempotency-Key': idempotency.keyFor([maintenanceId, body]) },
        },
        body,
      }),
    );
    setWorking(false);
    if (result.ok || result.failure.code === 'MAINTENANCE_ALREADY_VOIDED') {
      idempotency.reset();
      setConfirming(false);
      onVoided();
      return;
    }
    setError(
      failureMessage(result.failure, {
        notFound: 'Este mantenimiento ya no existe.',
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
            Se devolverán al stock los productos usados y se descartará su recordatorio. El
            mantenimiento queda en el historial como anulado.
          </p>
          <Field id="void-reason" label="Motivo">
            <Input
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              autoComplete="off"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              onClick={confirm}
              disabled={working || !trimmedReason}
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
          Anular mantenimiento
        </Button>
      )}
    </section>
  );
}
