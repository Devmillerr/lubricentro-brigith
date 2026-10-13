'use client';

import Link from 'next/link';
import { useRouteId } from '@/lib/static-route';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { PayableStatusBadge } from '@/components/payables/payable-status-badge';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { PageSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { receiptDateFormat } from '@/lib/inventory/receipts';
import { formatAmount, formatDay, type PayableDetail } from '@/lib/payables/format';
import { PayablePayments } from '@/components/payables/payable-payments';

const ERRORS = {
  byCode: {
    PAYABLE_NOT_OPEN: 'La deuda ya está pagada o anulada: su vencimiento no se cambia.',
    PAYABLE_ALREADY_VOIDED: 'La deuda ya estaba anulada.',
    PAYABLE_HAS_PAYMENTS: 'La deuda tiene pagos registrados. Primero anula los pagos.',
  },
};

/** Detalle de una deuda con un proveedor (R8, DEC-98 a DEC-100). */
export default function PayablePage() {
  const id = useRouteId(1);
  const query = useApiQuery(`payable:${id}`, () =>
    callApi(api.GET('/payables/{id}', { params: { path: { id } } })),
  );
  const back = { href: '/cuentas-por-pagar', label: 'Cuentas por pagar' };

  if (query.status === 'loading') return <PageSkeleton label="Cargando deuda…" />;
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Deuda" back={back} />
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{
            title: 'Deuda no encontrada',
            href: '/cuentas-por-pagar',
            label: 'Ver deudas',
          }}
        />
      </div>
    );
  }
  const payable = query.data;
  const open = ['PENDING', 'PARTIAL', 'OVERDUE'].includes(payable.status);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={payable.supplier?.name ?? 'Deuda'} back={back} />
      <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <PayableStatusBadge status={payable.status} className="self-start" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">Saldo</span>
          <span className="text-2xl font-bold">
            {formatAmount(payable.balance, payable.currency)}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-[var(--muted-foreground)]">Monto original</dt>
          <dd>{formatAmount(payable.originalAmount, payable.currency)}</dd>
          <dt className="text-[var(--muted-foreground)]">Pagado</dt>
          <dd>{formatAmount(payable.paidAmount, payable.currency)}</dd>
          <dt className="text-[var(--muted-foreground)]">Fecha de compra</dt>
          <dd>
            {formatDay(payable.issueDate)}
            {payable.issueDateReason && ` (${payable.issueDateReason})`}
          </dd>
          <dt className="text-[var(--muted-foreground)]">Vence</dt>
          <dd className="font-medium">{formatDay(payable.dueDate)}</dd>
          {payable.referenceExchangeRate && (
            <>
              <dt className="text-[var(--muted-foreground)]">T. C. de la compra</dt>
              <dd>S/ {payable.referenceExchangeRate} por US$ 1</dd>
            </>
          )}
          <dt className="text-[var(--muted-foreground)]">Recepción</dt>
          <dd>
            <Link
              href={`/inventario/recepciones/${payable.receiptId}`}
              className="underline underline-offset-2"
            >
              {payable.receipt
                ? `${receiptDateFormat.format(new Date(payable.receipt.occurredAt))}${
                    payable.receipt.documentRef ? ` · ${payable.receipt.documentRef}` : ''
                  }`
                : 'Ver recepción'}
            </Link>
          </dd>
        </dl>
        {payable.voidedAt && (
          <p className="break-words text-[var(--danger)]">
            Anulada el {receiptDateFormat.format(new Date(payable.voidedAt))}. Motivo:{' '}
            {payable.voidReason}
          </p>
        )}
      </section>

      <PayablePayments payable={payable} onChanged={query.reload} />

      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Historial del vencimiento</h3>
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm">
          {payable.dueDateChanges.map((change) => (
            <li key={change.id} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="font-medium">
                {change.previousDueDate
                  ? `${formatDay(change.previousDueDate)} → ${formatDay(change.newDueDate)}`
                  : `Vencimiento inicial: ${formatDay(change.newDueDate)}`}
              </span>
              <span className="break-words">{change.reason}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {receiptDateFormat.format(new Date(change.createdAt))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {open && <ChangeDueDate payable={payable} onSaved={query.reload} />}
      {!payable.voidedAt && <VoidPayable payable={payable} onVoided={query.reload} />}
    </div>
  );
}

function ChangeDueDate({ payable, onSaved }: { payable: PayableDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState(payable.dueDate);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!dueDate || dueDate < payable.issueDate) {
      setMessage('El vencimiento no puede ser anterior a la fecha de compra.');
      return;
    }
    if (reason.trim().length < 3) {
      setMessage('Escribe el motivo del cambio (al menos 3 caracteres).');
      return;
    }
    setMessage(null);
    setFailure(null);
    setSaving(true);
    const result = await callApi(
      api.PATCH('/payables/{id}/due-date', {
        params: { path: { id: payable.id } },
        body: { dueDate, reason: reason.trim() },
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setOpen(false);
    setReason('');
    onSaved();
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="self-start">
        Cambiar vencimiento
      </Button>
    );
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h3 className="text-base font-semibold">Cambiar vencimiento</h3>
      <Field id="due-new" label="Nueva fecha de vencimiento">
        <Input
          id="due-new"
          type="date"
          value={dueDate}
          min={payable.issueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>
      <Field id="due-reason" label="Motivo" hint="Queda en el historial.">
        <Input
          id="due-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Ej.: el proveedor dio 10 días más"
        />
      </Field>
      {message && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {message}
        </p>
      )}
      {failure && <FormError>{failureMessage(failure, ERRORS)}</FormError>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? 'Guardando…' : 'Guardar vencimiento'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function VoidPayable({ payable, onVoided }: { payable: PayableDetail; onVoided: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotency = useIdempotencyKey();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (reason.trim().length < 3) {
      setMessage('Escribe el motivo de la anulación (al menos 3 caracteres).');
      return;
    }
    setMessage(null);
    setFailure(null);
    setSaving(true);
    const body = { reason: reason.trim() };
    const result = await callApi(
      api.POST('/payables/{id}/void', {
        params: {
          path: { id: payable.id },
          header: { 'Idempotency-Key': idempotency.keyFor({ id: payable.id, ...body }) },
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
        Anular solo la deuda
      </Button>
    );
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h3 className="text-base font-semibold">Anular la deuda</h3>
      <p className="text-sm text-[var(--muted-foreground)]">
        La recepción y el stock no cambian. Úsalo para corregir el monto, la moneda o la fecha base:
        después puedes registrar la deuda de nuevo desde la recepción.
      </p>
      <Field id="payable-void-reason" label="Motivo">
        <Textarea
          id="payable-void-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </Field>
      {message && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {message}
        </p>
      )}
      {failure && <FormError>{failureMessage(failure, ERRORS)}</FormError>}
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
