'use client';

import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';

type Supplier = Schemas['SupplierResponse'];

const SUPPLIER_ERRORS = {
  byCode: {
    SUPPLIER_TAX_ID_TAKEN: 'Ya hay un proveedor con ese RUC o documento.',
    SUPPLIER_NOT_FOUND: 'El proveedor ya no existe.',
  },
};

/**
 * Proveedores (R8, DEC-95): a quién se le compra. Se crean, editan, desactivan
 * y reactivan; nunca se borran (BR-G5). Solo el nombre es obligatorio.
 */
export default function SuppliersPage() {
  const query = useApiQuery('suppliers:all', () =>
    callApi(api.GET('/suppliers', { params: { query: { includeInactive: true } } })),
  );
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(id: string, body: Schemas['UpdateSupplierDto']): Promise<boolean> {
    setBusy(true);
    setFailure(null);
    const result = await callApi(api.PATCH('/suppliers/{id}', { params: { path: { id } }, body }));
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return false;
    }
    query.reload();
    return true;
  }

  const header = <PageHeader title="Proveedores" subtitle="A quién le compras la mercadería" />;

  if (query.status === 'loading') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ListSkeleton label="Cargando proveedores…" />
      </div>
    );
  }
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message={failureMessage(query.failure)} onRetry={query.reload} />
      </div>
    );
  }

  const suppliers = query.data;
  return (
    <div className="flex flex-col gap-5">
      {header}
      {failure && <FormError>{failureMessage(failure, SUPPLIER_ERRORS)}</FormError>}
      <NewSupplierForm onCreated={() => query.reload()} />
      {suppliers.length === 0 ? (
        <EmptyState title="Todavía no hay proveedores" />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {suppliers.map((supplier) => (
            <li key={supplier.id}>
              <SupplierRow supplier={supplier} busy={busy} onPatch={patch} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewSupplierForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setNameError('Escribe el nombre del proveedor.');
      return;
    }
    setNameError(undefined);
    setFailure(null);
    setSaving(true);
    const body: Schemas['CreateSupplierDto'] = { name: name.trim() };
    if (taxId.trim()) body.taxId = taxId.trim();
    if (phone.trim()) body.phone = phone.trim();
    const result = await callApi(api.POST('/suppliers', { body }));
    setSaving(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setName('');
    setTaxId('');
    setPhone('');
    onCreated();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <h2 className="text-base font-semibold">Nuevo proveedor</h2>
      <Field id="supplier-name" label="Nombre" error={nameError}>
        <Input
          id="supplier-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoComplete="off"
          aria-invalid={!!nameError || undefined}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="supplier-tax" label="RUC" optional error={failure?.fieldErrors.taxId}>
          <Input
            id="supplier-tax"
            inputMode="numeric"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
        </Field>
        <Field id="supplier-phone" label="Teléfono" optional>
          <Input
            id="supplier-phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={50}
            autoComplete="off"
          />
        </Field>
      </div>
      {failure && <FormError>{failureMessage(failure, SUPPLIER_ERRORS)}</FormError>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Agregar proveedor'}
      </Button>
    </form>
  );
}

function SupplierRow({
  supplier,
  busy,
  onPatch,
}: {
  supplier: Supplier;
  busy: boolean;
  onPatch: (id: string, body: Schemas['UpdateSupplierDto']) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(supplier.name);
  const [taxId, setTaxId] = useState(supplier.taxId ?? '');
  const [phone, setPhone] = useState(supplier.phone ?? '');
  const [note, setNote] = useState(supplier.note ?? '');

  async function save() {
    const body: Schemas['UpdateSupplierDto'] = {};
    if (name.trim() && name.trim() !== supplier.name) body.name = name.trim();
    if (taxId.trim() !== (supplier.taxId ?? '')) body.taxId = taxId.trim();
    if (phone.trim() !== (supplier.phone ?? '')) body.phone = phone.trim();
    if (note.trim() !== (supplier.note ?? '')) body.note = note.trim();
    if (Object.keys(body).length === 0 || (await onPatch(supplier.id, body))) setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <Field id={`name-${supplier.id}`} label="Nombre">
          <Input
            id={`name-${supplier.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id={`tax-${supplier.id}`} label="RUC" optional>
            <Input
              id={`tax-${supplier.id}`}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              maxLength={20}
              autoComplete="off"
            />
          </Field>
          <Field id={`phone-${supplier.id}`} label="Teléfono" optional>
            <Input
              id={`phone-${supplier.id}`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={50}
              autoComplete="off"
            />
          </Field>
        </div>
        <Field id={`note-${supplier.id}`} label="Nota" optional>
          <Textarea
            id={`note-${supplier.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </Field>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1">
            Guardar
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 font-medium break-words">
          {supplier.name}
          {!supplier.isActive && <Badge>Desactivado</Badge>}
        </span>
        {(supplier.taxId || supplier.phone) && (
          <span className="text-xs text-[var(--muted-foreground)]">
            {[supplier.taxId && `RUC ${supplier.taxId}`, supplier.phone]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="w-11 shrink-0 px-0"
          aria-label={`Editar ${supplier.name}`}
          onClick={() => setEditing(true)}
          disabled={busy}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          onClick={() => onPatch(supplier.id, { isActive: !supplier.isActive })}
          disabled={busy}
          className="flex-1"
        >
          {supplier.isActive ? 'Desactivar' : 'Reactivar'}
        </Button>
      </div>
    </div>
  );
}
