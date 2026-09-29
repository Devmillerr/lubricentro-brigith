'use client';

import { ExternalLink, PhoneOff } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ReminderActions } from '@/components/reminders/reminder-actions';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { DUE_RULE_LABELS, formatDate, formatDateTime, formatKm } from '@/lib/maintenance/format';
import { REASON_LABELS, STATUS_LABELS, type ReminderDetail } from '@/lib/reminders/format';

/** Detalle de un recordatorio (`GET /reminders/{id}`): datos, mensaje, acciones e historial. */
export default function ReminderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`reminder:${id}`, () =>
    callApi(api.GET('/reminders/{id}', { params: { path: { id } } })),
  );
  const types = useApiQuery('maintenance-types', () => callApi(api.GET('/maintenance-types')));
  // Fuera del bloque que se recarga, para no perderlo si el navegador bloqueó la ventana.
  const [waLink, setWaLink] = useState<string | null>(null);

  const back = { href: '/avisar', label: 'Avisar' };

  return (
    <div className="flex flex-col gap-6">
      {waLink && (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm font-medium"
        >
          <ExternalLink className="size-4" aria-hidden />
          ¿No se abrió WhatsApp? Toca aquí
        </a>
      )}

      {query.status === 'loading' && <LoadingState />}
      {query.status === 'error' && (
        <>
          <PageHeader title="Recordatorio" back={back} />
          <QueryError
            failure={query.failure}
            onRetry={query.reload}
            notFound={{ title: 'Recordatorio no encontrado', href: '/avisar', label: 'Ver avisos' }}
          />
        </>
      )}
      {query.status === 'success' && (
        <ReminderView
          reminder={query.data}
          typeName={
            types.status === 'success'
              ? types.data.find((type) => type.id === query.data.maintenanceTypeId)?.name
              : undefined
          }
          back={back}
          onChanged={query.reload}
          onContacted={setWaLink}
        />
      )}
    </div>
  );
}

function ReminderView({
  reminder,
  typeName,
  back,
  onChanged,
  onContacted,
}: {
  reminder: ReminderDetail;
  typeName: string | undefined;
  back: { href: string; label: string };
  onChanged: () => void;
  onContacted: (waLink: string) => void;
}) {
  const open = reminder.status === 'PENDING' || reminder.status === 'CONTACTED';

  return (
    <>
      <PageHeader
        title={reminder.plate}
        asPlate
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {reminder.customerName ?? 'Sin cliente'}
            <Badge tone={reminder.status === 'DONE' ? 'success' : 'neutral'}>
              {STATUS_LABELS[reminder.status]}
            </Badge>
          </span>
        }
        back={back}
      />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <Detail label="Mantenimiento">{typeName ?? null}</Detail>
        <Detail label="Aviso">{DUE_RULE_LABELS[reminder.dueRule]}</Detail>
        <Detail label="Próxima fecha">{formatDate(reminder.dueDate)}</Detail>
        <Detail label="Próximo km">{formatKm(reminder.dueKm)}</Detail>
        <Detail label="¿Corresponde avisar?">
          {reminder.due
            ? reminder.reason
              ? `Sí — ${REASON_LABELS[reminder.reason].toLowerCase()}`
              : 'Sí'
            : 'Todavía no'}
        </Detail>
        <Detail label="Vehículo">
          <Link
            href={`/vehiculos/${reminder.vehicleId}`}
            className="font-medium underline underline-offset-4"
          >
            Ver ficha
          </Link>
        </Detail>
      </dl>

      {reminder.status === 'DONE' && (
        <Note>Se cumplió al registrarse otro mantenimiento del mismo tipo para este vehículo.</Note>
      )}
      {reminder.status === 'DISMISSED' && (
        <Note>
          {reminder.reopenBlockedBy === 'SOURCE_VOIDED'
            ? 'Se cerró porque se anuló el mantenimiento que lo originó. No se puede reabrir.'
            : reminder.reopenBlockedBy === 'OPEN_EXISTS'
              ? 'Este recordatorio fue descartado. No se puede reabrir porque ya hay otro abierto para este vehículo y este mantenimiento.'
              : 'Este recordatorio fue descartado. Puedes reabrirlo si todavía corresponde avisar.'}
        </Note>
      )}

      {open && !reminder.hasPhone && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/60 bg-[var(--danger-soft)] p-4 text-sm"
        >
          <p className="flex items-center gap-2 font-medium text-[var(--danger)]">
            <PhoneOff className="size-4" aria-hidden />
            No se puede avisar por WhatsApp
          </p>
          <p>
            El vehículo no tiene cliente con teléfono registrado. Agrega el teléfono en la ficha del
            cliente y vuelve aquí.
          </p>
          <Link
            href={`/vehiculos/${reminder.vehicleId}`}
            className="w-fit font-medium underline underline-offset-4"
          >
            Ir a la ficha del vehículo
          </Link>
        </div>
      )}

      {open && reminder.hasPhone && <MessagePreview message={reminder.previewMessage} />}

      <ReminderActions reminder={reminder} onChanged={onChanged} onContacted={onContacted} />

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">Avisos abiertos en WhatsApp</h3>
        {reminder.contacts.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Todavía no se abrió ningún aviso.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            {reminder.contacts.map((contact) => (
              <li key={contact.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <span className="font-medium">{formatDateTime(contact.openedAt)}</span>
                <span className="whitespace-pre-line text-[var(--muted-foreground)]">
                  {contact.messageSnapshot || 'Sin texto (no había plantilla).'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          Se registra que el aviso se abrió en WhatsApp, no que se envió.
        </p>
      </section>
    </>
  );
}

/** Vista previa con la plantilla actual del negocio (BR-W3, BR-W4). */
function MessagePreview({ message }: { message: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">Mensaje que se abrirá en WhatsApp</h3>
      {message ? (
        <p className="rounded-lg rounded-tl-none bg-[var(--muted)] p-3 text-sm whitespace-pre-line">
          {message}
        </p>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">
          El negocio todavía no tiene plantilla de mensaje: WhatsApp se abrirá sin texto y podrás
          escribirlo ahí.
        </p>
      )}
      <p className="text-xs text-[var(--muted-foreground)]">
        Se usa el teléfono tal como está guardado. Si no incluye el código de país, WhatsApp podría
        no encontrar el número.
      </p>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
      {children}
    </p>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className={children ? '' : 'text-[var(--muted-foreground)]'}>{children ?? '—'}</dd>
    </div>
  );
}
