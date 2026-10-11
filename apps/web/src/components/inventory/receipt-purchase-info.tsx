'use client';

import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { localDateInputValue, type InventoryReceipt } from '@/lib/inventory/receipts';

const ERRORS = {
  byCode: {
    PURCHASE_INFO_ALREADY_SET:
      'Esos datos ya estaban registrados y no se cambian. Recarga la página para ver los actuales.',
    DUPLICATE_DOCUMENT: 'Ese comprobante de este proveedor ya está registrado en otra recepción.',
    SUPPLIER_INACTIVE: 'El proveedor está desactivado. Elige otro o reactívalo.',
    SUPPLIER_NOT_FOUND: 'El proveedor ya no existe.',
    RECEIPT_VOIDED: 'La recepción está anulada: no se le agregan datos.',
  },
};

const dateOnly = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'UTC' });

/** "15 sept 2026" para una fecha `YYYY-MM-DD` (se lee en UTC: no cambia de día). */
export function formatDateOnly(value: string): string {
  return dateOnly.format(new Date(`${value}T00:00:00.000Z`));
}

/**
 * Datos de compra de una recepción (R8, DEC-95): proveedor, comprobante y fecha
 * de compra. Lo que falta se puede completar una sola vez (BR-K5); completar
 * no cambia el stock. Lo que ya está registrado no se edita.
 */
export function ReceiptPurchaseInfo({
  receipt,
  onSaved,
}: {
  receipt: InventoryReceipt;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const missing = !receipt.supplierId || !receipt.documentRef || !receipt.purchaseDate;
  const canComplete = missing && !receipt.voidedAt;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
      <h3 className="text-base font-semibold">Datos de compra</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-[var(--muted-foreground)]">Proveedor</dt>
        <dd className="break-words">{receipt.supplier?.name ?? 'Sin proveedor'}</dd>
        <dt className="text-[var(--muted-foreground)]">Comprobante</dt>
        <dd className="break-words">{receipt.documentRef ?? 'Sin comprobante'}</dd>
        <dt className="text-[var(--muted-foreground)]">Fecha de compra</dt>
        <dd>
          {receipt.purchaseDate
            ? formatDateOnly(receipt.purchaseDate)
            : 'La de recepción (no se escribió otra)'}
        </dd>
      </dl>
      {canComplete && !editing && (
        <Button variant="outline" onClick={() => setEditing(true)} className="self-start">
          Completar datos de compra
        </Button>
      )}
      {canComplete && editing && (
        <PurchaseInfoForm
          receipt={receipt}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </section>
  );
}

function PurchaseInfoForm({
  receipt,
  onCancel,
  onSaved,
}: {
  receipt: InventoryReceipt;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const suppliers = useApiQuery('suppliers:active', () => callApi(api.GET('/suppliers')));
  const [supplierId, setSupplierId] = useState('');
  const [documentRef, setDocumentRef] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const effectiveSupplier = receipt.supplierId ?? supplierId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const body: Schemas['ReceiptPurchaseInfoDto'] = {};
    if (!receipt.supplierId && supplierId) body.supplierId = supplierId;
    if (!receipt.documentRef && documentRef.trim()) body.documentRef = documentRef.trim();
    if (!receipt.purchaseDate && purchaseDate) body.purchaseDate = purchaseDate;
    if (Object.keys(body).length === 0) {
      setMessage('Completa al menos un dato.');
      return;
    }
    if (body.documentRef && !effectiveSupplier) {
      setMessage('Elige el proveedor del comprobante.');
      return;
    }
    if (body.purchaseDate && body.purchaseDate > localDateInputValue(new Date())) {
      setMessage('La fecha de compra no puede ser futura.');
      return;
    }
    setMessage(null);
    setFailure(null);
    setSaving(true);
    const result = await callApi(
      api.PATCH('/inventory/receipts/{id}/purchase-info', {
        params: { path: { id: receipt.id } },
        body,
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    onSaved();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 border-t border-[var(--border)] pt-3"
    >
      <p className="text-xs text-[var(--muted-foreground)]">
        Cada dato se completa una sola vez y después no se cambia. No modifica el stock.
      </p>
      {!receipt.supplierId && (
        <Field id="info-supplier" label="Proveedor" optional>
          <Select
            id="info-supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Sin proveedor</option>
            {suppliers.status === 'success' &&
              suppliers.data.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      {!receipt.documentRef && effectiveSupplier && (
        <Field id="info-document" label="N.º de comprobante" optional>
          <Input
            id="info-document"
            value={documentRef}
            onChange={(e) => setDocumentRef(e.target.value)}
            maxLength={40}
            autoComplete="off"
          />
        </Field>
      )}
      {!receipt.purchaseDate && (
        <Field id="info-date" label="Fecha de compra" optional>
          <Input
            id="info-date"
            type="date"
            value={purchaseDate}
            max={localDateInputValue(new Date())}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </Field>
      )}
      {message && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {message}
        </p>
      )}
      {failure && <FormError>{failureMessage(failure, ERRORS)}</FormError>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? 'Guardando…' : 'Guardar datos'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
