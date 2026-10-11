'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import type { InventoryReceipt } from '@/lib/inventory/receipts';
import { parsePrice } from '@/lib/sales/format';
import {
  DEFAULT_TERM_DAYS,
  STATUS_CLASSES,
  STATUS_LABELS,
  addDaysTo,
  formatAmount,
  formatDay,
  type Currency,
} from '@/lib/payables/format';

const ERRORS = {
  byCode: {
    PAYABLE_ALREADY_EXISTS: 'Esta recepción ya tiene una deuda. Recarga la página.',
    PURCHASE_INFO_REQUIRED: 'Primero completa el proveedor en los datos de compra.',
    RECEIPT_VOIDED: 'La recepción está anulada.',
  },
};

/**
 * Deuda de la recepción (R8, DEC-98): la activa, con enlace a su detalle; o,
 * si no hay y la recepción tiene proveedor, el formulario para registrarla
 * (D22): monto y moneda escritos, sin tocar el stock.
 */
export function ReceiptPayable({
  receipt,
  onSaved,
}: {
  receipt: InventoryReceipt;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const payable = receipt.payable;

  if (payable) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <h3 className="text-base font-semibold">Deuda con el proveedor</h3>
        <div className="flex items-center justify-between gap-3">
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[payable.status]}`}
          >
            {STATUS_LABELS[payable.status]}
          </span>
          <span className="text-lg font-bold">
            {formatAmount(payable.balance, payable.currency)}
          </span>
        </div>
        <p>Vence el {formatDay(payable.dueDate)}</p>
        <Link
          href={`/cuentas-por-pagar/${payable.id}`}
          className="inline-flex min-h-11 items-center font-medium underline underline-offset-2"
        >
          Ver deuda y pagos
        </Link>
      </section>
    );
  }
  if (receipt.voidedAt) return null;
  if (!receipt.supplierId) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        ¿Esta compra fue al crédito? Completa el proveedor en los datos de compra para registrar la
        deuda.
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="self-start">
        Registrar deuda de esta compra
      </Button>
    );
  }
  return (
    <PayableForm
      receipt={receipt}
      onCancel={() => setOpen(false)}
      onSaved={() => {
        setOpen(false);
        onSaved();
      }}
    />
  );
}

function PayableForm({
  receipt,
  onCancel,
  onSaved,
}: {
  receipt: InventoryReceipt;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const purchaseDate = receipt.purchaseDate ?? receipt.occurredAt.slice(0, 10);
  const [currency, setCurrency] = useState<Currency>(receipt.currency ?? 'PEN');
  // Precarga el total de la recepción, en su propia moneda (D30: se puede cambiar).
  const [amount, setAmount] = useState(receipt.totalCost ?? '');
  const [rate, setRate] = useState('');
  const [agreedDue, setAgreedDue] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [dueReason, setDueReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotency = useIdempotencyKey();
  const defaultDue = addDaysTo(purchaseDate, DEFAULT_TERM_DAYS);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const value = parsePrice(amount);
    if (value === null || value <= 0) {
      setMessage('Escribe el monto de la deuda (mayor que 0, hasta 2 decimales).');
      return;
    }
    if (currency === 'USD' && rate.trim() && !/^\d+(\.\d{1,4})?$/.test(rate.trim())) {
      setMessage('Tipo de cambio: un número con hasta 4 decimales.');
      return;
    }
    if (agreedDue && (!dueDate || dueDate < purchaseDate || dueReason.trim().length < 3)) {
      setMessage('Indica la fecha pactada (no anterior a la compra) y su motivo.');
      return;
    }
    setMessage(null);
    setFailure(null);
    setSaving(true);
    const body: Schemas['CreateReceiptPayableDto'] = { currency, amount: value };
    if (currency === 'USD' && rate.trim()) body.referenceExchangeRate = Number(rate.trim());
    if (agreedDue && dueDate !== defaultDue) {
      body.dueDate = dueDate;
      body.dueDateReason = dueReason.trim();
    }
    const result = await callApi(
      api.POST('/inventory/receipts/{id}/payable', {
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
    onSaved();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h3 className="text-base font-semibold">Registrar deuda de esta compra</h3>
      <p className="text-sm text-[var(--muted-foreground)]">
        Escribe lo que debes al proveedor. No cambia el stock ni los montos de la recepción.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="payable-currency" label="Moneda">
          <Select
            id="payable-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            <option value="PEN">Soles (S/)</option>
            <option value="USD">Dólares (US$)</option>
          </Select>
        </Field>
        <Field id="payable-amount" label="Monto de la deuda">
          <Input
            id="payable-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      {currency === 'USD' && (
        <Field id="payable-rate" label="Tipo de cambio de la compra" optional>
          <Input
            id="payable-rate"
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="Ej.: 3.7520"
            className="w-40"
          />
        </Field>
      )}
      <p className="text-sm">
        Fecha de compra: {formatDay(purchaseDate)} · vence el{' '}
        <strong>{formatDay(agreedDue && dueDate ? dueDate : defaultDue)}</strong>
      </p>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={agreedDue}
          onChange={(e) => setAgreedDue(e.target.checked)}
        />
        El proveedor dio otra fecha de vencimiento
      </label>
      {agreedDue && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="payable-due" label="Vencimiento pactado">
            <Input
              id="payable-due"
              type="date"
              value={dueDate}
              min={purchaseDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field id="payable-due-reason" label="Motivo">
            <Input
              id="payable-due-reason"
              value={dueReason}
              onChange={(e) => setDueReason(e.target.value)}
              maxLength={500}
            />
          </Field>
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {message}
        </p>
      )}
      {failure && <FormError>{failureMessage(failure, ERRORS)}</FormError>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? 'Guardando…' : 'Registrar deuda'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
