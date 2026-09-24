'use client';

import { MessageCircle, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { isOpen, type ReminderDetail } from '@/lib/reminders/format';

const MESSAGES = {
  byCode: {
    NO_PHONE: 'El cliente no tiene teléfono registrado: agrégalo en su ficha para poder avisarle.',
    REMINDER_ALREADY_CLOSED: 'Este recordatorio ya está cerrado.',
    REMINDER_DONE: 'Este recordatorio ya se cumplió y no se puede reabrir.',
    REMINDER_SOURCE_VOIDED:
      'El mantenimiento que originó este recordatorio fue anulado: no se puede reabrir.',
    REMINDER_OPEN_EXISTS:
      'Ya hay otro recordatorio abierto para este vehículo y este mantenimiento.',
  },
  notFound: 'Este recordatorio ya no existe.',
};

/**
 * Acciones sobre un recordatorio (07-UI-UX.md §3.4):
 * - WhatsApp: `POST /reminders/{id}/contacts` registra el aviso (BR-W6),
 *   devuelve el enlace `wa.me` y pasa el recordatorio a "contactado". El
 *   mensaje lo envía el usuario desde WhatsApp; nada se envía solo (BR-W2).
 * - Deshacer / reabrir: vuelve a "pendiente". "Reabrir" solo aparece si la API
 *   lo permite (`reopenBlockedBy`: no si se cumplió, si se anuló su
 *   mantenimiento o si ya hay otro abierto). Descartar: acción explícita (BR-R9).
 */
export function ReminderActions({
  reminder,
  onChanged,
  onContacted,
}: {
  reminder: ReminderDetail;
  onChanged: () => void;
  /** Recibe el enlace wa.me, por si el navegador bloqueó la ventana. */
  onContacted: (waLink: string) => void;
}) {
  const [working, setWorking] = useState<'contact' | 'dismiss' | 'reopen' | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [failure, setFailure] = useState<{ failure: ApiFailure; action: string } | null>(null);

  async function openWhatsApp() {
    // Se abre dentro del gesto del usuario para que el navegador no la bloquee;
    // se dirige al enlace recién cuando la API registra el aviso.
    const popup = window.open('', '_blank');
    setWorking('contact');
    setFailure(null);
    const result = await callApi(
      api.POST('/reminders/{id}/contacts', { params: { path: { id: reminder.id } } }),
    );
    setWorking(null);
    if (!result.ok) {
      popup?.close();
      setFailure({ failure: result.failure, action: 'contact' });
      if (result.failure.code === 'REMINDER_ALREADY_CLOSED') onChanged();
      return;
    }
    onContacted(result.data.waLink);
    if (popup) {
      popup.opener = null;
      popup.location.href = result.data.waLink;
    }
    onChanged();
  }

  async function setStatus(status: 'PENDING' | 'DISMISSED') {
    const action = status === 'DISMISSED' ? 'dismiss' : 'reopen';
    setWorking(action);
    setFailure(null);
    const result = await callApi(
      api.PATCH('/reminders/{id}', { params: { path: { id: reminder.id } }, body: { status } }),
    );
    setWorking(null);
    if (!result.ok) {
      setFailure({ failure: result.failure, action });
      // 409: el estado cambió (o ya no se puede reabrir); se recarga para ocultar la acción.
      if (result.failure.status === 409) onChanged();
      return;
    }
    setConfirmDismiss(false);
    onChanged();
  }

  const open = isOpen(reminder.status);

  return (
    <div className="flex flex-col gap-3">
      {failure && <FormError>{failureMessage(failure.failure, MESSAGES)}</FormError>}

      {open && reminder.hasPhone && (
        <Button size="lg" onClick={openWhatsApp} disabled={working !== null}>
          <MessageCircle className="mr-2 size-5" aria-hidden />
          {working === 'contact' ? 'Abriendo WhatsApp…' : 'Avisar por WhatsApp'}
        </Button>
      )}
      {reminder.status === 'CONTACTED' && (
        <Button variant="outline" onClick={() => setStatus('PENDING')} disabled={working !== null}>
          <RotateCcw className="mr-2 size-4" aria-hidden />
          {working === 'reopen' ? 'Guardando…' : 'Deshacer: volver a pendiente'}
        </Button>
      )}

      {reminder.status === 'DISMISSED' && reminder.reopenBlockedBy === null && (
        <Button variant="outline" onClick={() => setStatus('PENDING')} disabled={working !== null}>
          <RotateCcw className="mr-2 size-4" aria-hidden />
          {working === 'reopen' ? 'Guardando…' : 'Reabrir recordatorio'}
        </Button>
      )}

      {open &&
        (confirmDismiss ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--danger)] p-4">
            <p className="text-sm">
              El recordatorio se cerrará sin avisar. Podrás reabrirlo después.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => setStatus('DISMISSED')}
                disabled={working !== null}
                className="flex-1 bg-[var(--danger)] text-white"
              >
                {working === 'dismiss' ? 'Descartando…' : 'Sí, descartar'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDismiss(false)}
                disabled={working !== null}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setConfirmDismiss(true)}
            disabled={working !== null}
          >
            <X className="mr-2 size-4" aria-hidden />
            Descartar
          </Button>
        ))}
    </div>
  );
}
