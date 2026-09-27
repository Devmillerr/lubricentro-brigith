'use client';

import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatMoney } from '@/lib/sales/format';
import {
  WASH_ERRORS,
  amountInput,
  parseAmount,
  type WashPriceOption,
  type WashType,
} from '@/lib/washes/format';

const MAX_TEXT = 100;
const AMOUNT_HINT = 'Mayor que 0, hasta 2 decimales (por ejemplo 15 o 12,50).';

type Patch = (
  request: Promise<{ data?: unknown; error?: unknown; response: Response }>,
) => Promise<boolean>;

/**
 * Configuración → Tipos de lavado (07-UI-UX.md §3.9, DEC-56, B-148). Muestra
 * todos los tipos, también los inactivos y los que no tienen precio (Minibán,
 * Combi, Moto carguera), para que el dueño les agregue precio cuando lo
 * defina. Crear, renombrar, ordenar y desactivar tipos; agregar, editar y
 * desactivar precios. Nada se borra (DEC-17).
 */
export default function WashTypesSettingsPage() {
  const query = useApiQuery('wash-types:all', () =>
    callApi(api.GET('/wash-types', { params: { query: { includeInactive: true } } })),
  );
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  /** Corre una escritura; si sale bien, recarga la lista. */
  const run: Patch = async (request) => {
    setBusy(true);
    setFailure(null);
    const result = await callApi(request);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return false;
    }
    query.reload();
    return true;
  };

  /** Reordena los tipos: guarda la posición nueva solo de los que cambian. */
  async function move(types: WashType[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= types.length) return;
    const reordered = [...types];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    setBusy(true);
    setFailure(null);
    for (const [position, type] of reordered.entries()) {
      if (type.sortOrder === position) continue;
      const result = await callApi(
        api.PATCH('/wash-types/{id}', {
          params: { path: { id: type.id } },
          body: { sortOrder: position },
        }),
      );
      if (!result.ok) {
        setFailure(result.failure);
        break;
      }
    }
    setBusy(false);
    query.reload();
  }

  const header = (
    <PageHeader
      title="Tipos de lavado"
      subtitle="Vehículos y sus precios. Sin precio activo, un tipo no aparece al cobrar."
      back={{ href: '/configuracion', label: 'Configuración' }}
    />
  );

  if (query.status === 'loading') return <LoadingState label="Cargando tipos de lavado…" />;
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message={failureMessage(query.failure)} onRetry={query.reload} />
      </div>
    );
  }

  const types = query.data;

  return (
    <div className="flex flex-col gap-5">
      {header}
      {failure && <FormError>{failureMessage(failure, { byCode: WASH_ERRORS })}</FormError>}

      <NewWashTypeForm
        nextSortOrder={types.reduce((max, type) => Math.max(max, type.sortOrder + 1), 0)}
        onCreated={() => query.reload()}
      />

      {types.length === 0 ? (
        <EmptyState title="Todavía no hay tipos de lavado" />
      ) : (
        <ul className="flex flex-col gap-3">
          {types.map((type, index) => (
            <li key={type.id} className="rounded-lg border border-[var(--border)]">
              <WashTypeCard
                type={type}
                busy={busy}
                run={run}
                onMove={(delta) => move(types, index, delta)}
                first={index === 0}
                last={index === types.length - 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewWashTypeForm({
  nextSortOrder,
  onCreated,
}: {
  nextSortOrder: number;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Escribe el nombre del tipo de lavado.');
      return;
    }
    setSaving(true);
    setError(null);
    // Al final de la lista: un tipo nuevo no se cuela arriba de los existentes.
    const result = await callApi(
      api.POST('/wash-types', { body: { name: trimmed, sortOrder: nextSortOrder } }),
    );
    setSaving(false);
    if (!result.ok) {
      setError(
        result.failure.fieldErrors.name ?? failureMessage(result.failure, { byCode: WASH_ERRORS }),
      );
      return;
    }
    setName('');
    onCreated();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <Field id="new-wash-type" label="Nuevo tipo de lavado" error={error ?? undefined}>
        <div className="flex gap-2">
          <Input
            id="new-wash-type"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_TEXT}
            autoComplete="off"
            placeholder="Por ejemplo: Minibán"
            aria-invalid={error ? true : undefined}
          />
          <Button type="submit" disabled={saving} className="shrink-0">
            <Plus className="mr-1 size-4" aria-hidden />
            Agregar
          </Button>
        </div>
      </Field>
    </form>
  );
}

function WashTypeCard({
  type,
  busy,
  run,
  onMove,
  first,
  last,
}: {
  type: WashType;
  busy: boolean;
  run: Patch;
  onMove: (delta: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(type.name);
  const [adding, setAdding] = useState(false);
  const activePrices = type.prices.filter((price) => price.isActive).length;
  const patchType = (body: Schemas['UpdateWashTypeDto']) =>
    run(api.PATCH('/wash-types/{id}', { params: { path: { id: type.id } }, body }));

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === type.name || (await patchType({ name: trimmed }))) {
      setEditing(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 px-3 py-3">
        {editing ? (
          <div className="flex flex-col gap-2">
            <Field id={`wash-type-name-${type.id}`} label="Nombre">
              <Input
                id={`wash-type-name-${type.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_TEXT}
                autoComplete="off"
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={saveName} disabled={busy} className="flex-1">
                Guardar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setName(type.name);
                  setEditing(false);
                }}
                disabled={busy}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold break-words">{type.name}</span>
            {!type.isActive && <Badge>Inactivo</Badge>}
            {type.isActive && activePrices === 0 && <Badge>Sin precio: no se cobra</Badge>}
          </span>
        )}
        {!editing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-11 shrink-0 px-0"
              aria-label={`Subir ${type.name}`}
              onClick={() => onMove(-1)}
              disabled={busy || first}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              className="w-11 shrink-0 px-0"
              aria-label={`Bajar ${type.name}`}
              onClick={() => onMove(1)}
              disabled={busy || last}
            >
              <ArrowDown className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              className="w-11 shrink-0 px-0"
              aria-label={`Renombrar ${type.name}`}
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              onClick={() => patchType({ isActive: !type.isActive })}
              disabled={busy}
              className="flex-1"
            >
              {type.isActive ? 'Desactivar' : 'Reactivar'}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col border-t border-[var(--border)]">
        {type.prices.length === 0 && (
          <p className="px-3 py-3 text-sm text-[var(--muted-foreground)]">Sin precio todavía.</p>
        )}
        {type.prices.length > 0 && (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {type.prices.map((price) => (
              <li key={price.id}>
                <PriceRow typeId={type.id} price={price} busy={busy} run={run} />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-[var(--border)] px-3 py-3">
          {adding ? (
            <PriceForm
              id={`new-price-${type.id}`}
              busy={busy}
              submitLabel="Agregar precio"
              onCancel={() => setAdding(false)}
              onSubmit={async ({ amount, label }) => {
                const ok = await run(
                  api.POST('/wash-types/{id}/prices', {
                    params: { path: { id: type.id } },
                    body: {
                      amount,
                      ...(label ? { label } : {}),
                      sortOrder: type.prices.reduce(
                        (max, option) => Math.max(max, option.sortOrder + 1),
                        0,
                      ),
                    },
                  }),
                );
                if (ok) setAdding(false);
                return ok;
              }}
            />
          ) : (
            <Button
              variant="outline"
              onClick={() => setAdding(true)}
              disabled={busy}
              className="w-full"
            >
              <Plus className="mr-1 size-4" aria-hidden />
              Agregar precio
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceRow({
  typeId,
  price,
  busy,
  run,
}: {
  typeId: string;
  price: WashPriceOption;
  busy: boolean;
  run: Patch;
}) {
  const [editing, setEditing] = useState(false);
  const patchPrice = (body: Schemas['UpdateWashPriceOptionDto']) =>
    run(
      api.PATCH('/wash-types/{id}/prices/{priceId}', {
        params: { path: { id: typeId, priceId: price.id } },
        body,
      }),
    );

  if (editing) {
    return (
      <div className="px-3 py-3">
        <PriceForm
          id={`price-${price.id}`}
          busy={busy}
          initial={{ amount: amountInput(price.amount), label: price.label ?? '' }}
          submitLabel="Guardar"
          onCancel={() => setEditing(false)}
          onSubmit={async ({ amount, label }) => {
            // Etiqueta vacía = `null`: la quita (DEC-63).
            const ok = await patchPrice({ amount, label: label || null });
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className={price.isActive ? 'font-medium' : 'font-medium line-through'}>
          {formatMoney(price.amount)}
        </span>
        {price.label && <span className="text-sm">{price.label}</span>}
        {!price.isActive && <Badge>Inactivo</Badge>}
      </span>
      <Button
        variant="outline"
        className="w-11 shrink-0 px-0"
        aria-label={`Editar precio ${formatMoney(price.amount)}`}
        onClick={() => setEditing(true)}
        disabled={busy}
      >
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button
        variant="outline"
        onClick={() => patchPrice({ isActive: !price.isActive })}
        disabled={busy}
        className="shrink-0"
      >
        {price.isActive ? 'Desactivar' : 'Reactivar'}
      </Button>
    </div>
  );
}

/** Monto y etiqueta opcional de un precio. Valida el monto antes de enviar (DEC-66). */
function PriceForm({
  id,
  busy,
  initial = { amount: '', label: '' },
  submitLabel,
  onSubmit,
  onCancel,
}: {
  id: string;
  busy: boolean;
  initial?: { amount: string; label: string };
  submitLabel: string;
  onSubmit: (values: { amount: number; label: string }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(initial.amount);
  const [label, setLabel] = useState(initial.label);
  const [amountError, setAmountError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (parsed === null) {
      setAmountError(AMOUNT_HINT);
      return;
    }
    setAmountError(null);
    await onSubmit({ amount: parsed, label: label.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-2 gap-2">
        <Field id={`${id}-amount`} label="Monto (S/)" error={amountError ?? undefined}>
          <Input
            id={`${id}-amount`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={amountError ? true : undefined}
          />
        </Field>
        <Field id={`${id}-label`} label="Etiqueta" optional>
          <Input
            id={`${id}-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={MAX_TEXT}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
