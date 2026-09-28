'use client';

import { CircleAlert, Info, Plus, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatQuantity, parseQuantity, type ProductWithStock } from '@/lib/inventory/format';
import {
  formatKm,
  fromDateInput,
  nowForDateTimeInput,
  parseKm,
  type CreateMaintenanceResult,
  type MaintenanceType,
  effectiveDueRule,
  type NextDueValues,
} from '@/lib/maintenance/format';
import type { Product } from '@/lib/products/format';
import type { PaymentMethod } from '@/lib/sales/format';
import { CHARGE_AMOUNT_ERROR, ChargeFields, parseChargeAmount } from './charge-fields';
import { NextDueFields } from './next-due-fields';
import { ProductPicker, StockHint } from './product-picker';
import { useSubmitLock } from '@/lib/use-submit-lock';

/** Tipo sembrado por defecto (BR-M13): va primero en la lista (07-UI-UX.md §3.3.2). */
const DEFAULT_TYPE_NAME = 'Cambio de aceite';

interface Item {
  product: ProductWithStock;
  quantity: string;
  stockLoading: boolean;
}

type Errors = Partial<
  Record<
    | 'maintenanceTypeId'
    | 'performedAt'
    | 'odometerKm'
    | 'items'
    | 'notes'
    | 'chargeAmount'
    | 'chargeMethod'
    | keyof NextDueValues,
    string
  >
> & { itemQuantity?: Record<string, string> };

export interface SavedMaintenance {
  result: CreateMaintenanceResult;
  /** Productos con control de stock usados, para mostrar su saldo nuevo. */
  stockProducts: ProductWithStock[];
}

/**
 * Registrar un mantenimiento (07-UI-UX.md §3.3): una sola pantalla y una sola
 * petición indivisible (BR-M10), con `Idempotency-Key`. Los avisos previos
 * (BR-M7, BR-P8) no bloquean; lo que la API rechaza (400, 422) sí.
 *
 * R6: `vehicleId` es opcional (DEC-31, DEC-73). Sin vehículo no se muestran
 * ni se envían km ni próximo mantenimiento, y no hay recordatorio. El cobro
 * inmediato (DEC-72) es opcional: método y un único monto total.
 */
export function MaintenanceForm({
  vehicleId,
  lastKnownKm,
  onSaved,
}: {
  vehicleId: string | null;
  lastKnownKm: number | null;
  onSaved: (saved: SavedMaintenance) => void;
}) {
  const hasVehicle = vehicleId !== null;
  const types = useApiQuery('maintenance-types', () => callApi(api.GET('/maintenance-types')));
  const business = useApiQuery('business', () => callApi(api.GET('/business')));
  const businessDefault =
    business.status === 'success' ? business.data.defaultDueRuleWhenBoth : null;
  const blockPolicy =
    business.status === 'success' && business.data.insufficientStockPolicy === 'BLOCK';

  const [typeId, setTypeId] = useState<string | null>(null);
  const [createdTypes, setCreatedTypes] = useState<MaintenanceType[]>([]);
  const [performedAt, setPerformedAt] = useState(nowForDateTimeInput);
  const [odometer, setOdometer] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [nextDue, setNextDue] = useState<NextDueValues>({
    nextDueKm: '',
    nextDueDate: '',
    dueRule: '',
  });
  const [notes, setNotes] = useState('');
  const [chargeNow, setChargeNow] = useState(false);
  const [chargeMethod, setChargeMethod] = useState<PaymentMethod | null>(null);
  const [chargeAmount, setChargeAmount] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();
  const idempotency = useIdempotencyKey();

  const typeList = [
    ...(types.status === 'success' ? types.data : []),
    ...createdTypes.filter(
      (created) => types.status !== 'success' || !types.data.some((t) => t.id === created.id),
    ),
  ].sort((a, b) =>
    a.name === DEFAULT_TYPE_NAME
      ? -1
      : b.name === DEFAULT_TYPE_NAME
        ? 1
        : a.name.localeCompare(b.name, 'es'),
  );
  // Sin elección explícita, se propone "Cambio de aceite" si existe.
  const selectedTypeId =
    typeId ?? typeList.find((type) => type.name === DEFAULT_TYPE_NAME)?.id ?? '';

  async function addProduct(product: Product | ProductWithStock) {
    if (items.some((item) => item.product.id === product.id)) return;
    const withStock = product as ProductWithStock;
    const needsStock = product.tracksStock && !withStock.stock;
    setItems((current) => [
      ...current,
      { product: withStock, quantity: '', stockLoading: needsStock },
    ]);
    if (!needsStock) return;
    const stock = await callApi(
      api.GET('/inventory/stock', { params: { query: { productId: product.id } } }),
    );
    setItems((current) =>
      current.map((item) =>
        item.product.id === product.id
          ? {
              ...item,
              stockLoading: false,
              product: stock.ok ? { ...item.product, stock: stock.data } : item.product,
            }
          : item,
      ),
    );
  }

  function updateQuantity(productId: string, quantity: string) {
    setItems((current) =>
      current.map((item) => (item.product.id === productId ? { ...item, quantity } : item)),
    );
  }

  function removeItem(productId: string) {
    setItems((current) => current.filter((item) => item.product.id !== productId));
  }

  // Avisos previos, que no bloquean (BR-M7). La API los vuelve a informar al guardar.
  // Sin vehículo no hay km ni próximo mantenimiento (DEC-73): no se leen ni se envían.
  const odometerKm = hasVehicle ? parseKm(odometer) : null;
  const nextKm = hasVehicle ? parseKm(nextDue.nextDueKm) : null;
  const nextDueDate = hasVehicle ? nextDue.nextDueDate : '';
  const chargeTotal = chargeNow ? parseChargeAmount(chargeAmount) : null;
  const hints: string[] = [];
  if (odometerKm !== null && lastKnownKm !== null && odometerKm < lastKnownKm) {
    hints.push(`El km ingresado es menor al último conocido (${formatKm(lastKnownKm)}).`);
  }
  if (nextKm !== null && odometerKm !== null && nextKm <= odometerKm) {
    hints.push('El próximo km no supera al km actual.');
  }
  if (nextDueDate && performedAt && nextDueDate < performedAt.slice(0, 10)) {
    hints.push('La próxima fecha es anterior a la del mantenimiento.');
  }

  function validate(): Errors {
    const found: Errors = {};
    if (!selectedTypeId) found.maintenanceTypeId = 'Elige el tipo de mantenimiento.';
    if (!performedAt || Number.isNaN(new Date(performedAt).getTime())) {
      found.performedAt = 'Ingresa la fecha del mantenimiento.';
    }
    if (hasVehicle && odometer.trim() && odometerKm === null) {
      found.odometerKm = 'Ingresa el km sin decimales.';
    }
    if (hasVehicle && nextDue.nextDueKm.trim() && nextKm === null) {
      found.nextDueKm = 'Ingresa el km sin decimales.';
    }
    const itemQuantity: Record<string, string> = {};
    for (const item of items) {
      const quantity = parseQuantity(item.quantity);
      if (quantity === null || quantity <= 0) {
        itemQuantity[item.product.id] = 'Cantidad mayor que 0 (hasta 3 decimales).';
      }
    }
    if (Object.keys(itemQuantity).length) found.itemQuantity = itemQuantity;
    if (
      hasVehicle &&
      nextDue.nextDueKm.trim() &&
      nextDue.nextDueDate &&
      !effectiveDueRule(nextDue, businessDefault)
    ) {
      found.dueRule = 'Elige cuándo avisar.';
    }
    if (chargeNow) {
      if (!chargeMethod) found.chargeMethod = 'Elige Efectivo o Yape.';
      if (chargeTotal === null) found.chargeAmount = CHARGE_AMOUNT_ERROR;
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    if (!lock.acquire()) return;
    setSubmitting(true);

    const rule = effectiveDueRule(nextDue, businessDefault);
    const body: Schemas['CreateMaintenanceDto'] = {
      maintenanceTypeId: selectedTypeId,
      performedAt: new Date(performedAt).toISOString(),
      items: items.map((item) => ({
        productId: item.product.id,
        quantity: parseQuantity(item.quantity)!,
      })),
    };
    if (vehicleId) body.vehicleId = vehicleId;
    if (odometerKm !== null) body.odometerKm = odometerKm;
    if (nextKm !== null) body.nextDueKm = nextKm;
    if (nextDueDate) body.nextDueDate = fromDateInput(nextDueDate);
    if (nextKm !== null && nextDueDate && rule) body.dueRule = rule;
    if (notes.trim()) body.notes = notes.trim();
    if (chargeNow && chargeMethod && chargeTotal !== null) {
      body.charge = { paymentMethod: chargeMethod, totalAmount: chargeTotal };
    }

    const result = await callApi(
      api.POST('/maintenances', {
        params: { header: { 'Idempotency-Key': idempotency.keyFor(body) } },
        body,
      }),
    );
    lock.release();
    setSubmitting(false);

    if (result.ok) {
      idempotency.reset();
      onSaved({
        result: result.data,
        stockProducts: items.map((item) => item.product).filter((product) => product.tracksStock),
      });
      return;
    }
    const apiErrors = result.failure.fieldErrors;
    const code = result.failure.code;
    setErrors({
      performedAt: apiErrors.performedAt,
      odometerKm: apiErrors.odometerKm,
      nextDueKm: apiErrors.nextDueKm,
      nextDueDate: apiErrors.nextDueDate,
      notes: apiErrors.notes,
      chargeAmount: apiErrors['charge.totalAmount'],
      chargeMethod: apiErrors['charge.paymentMethod'],
      dueRule:
        code === 'DUE_RULE_REQUIRED'
          ? 'Elige cuándo avisar.'
          : code === 'INCOHERENT_DUE_RULE'
            ? 'La regla no coincide con el km y la fecha ingresados.'
            : apiErrors.dueRule,
    });
    setFailure(result.failure);
  }

  const blockedProductId =
    failure?.code === 'INSUFFICIENT_STOCK'
      ? failure.classified.kind === 'client'
        ? failure.classified.detail.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0]
        : undefined
      : undefined;
  const blockedItem = items.find((item) => item.product.id === blockedProductId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {failure?.code === 'INSUFFICIENT_STOCK' ? (
        <BlockedByStock
          productName={blockedItem?.product.name}
          productId={blockedProductId}
          detail={failure.fieldErrors.items}
        />
      ) : (
        failure &&
        !['DUE_RULE_REQUIRED', 'INCOHERENT_DUE_RULE'].includes(failure.code ?? '') && (
          <FormError>
            {failureMessage(failure, {
              byCode: {
                INVALID_REFERENCE: 'El vehículo, el tipo o algún producto ya no existe.',
                IDEMPOTENCY_KEY_IN_PROGRESS:
                  'El registro anterior todavía se está procesando. Inténtalo en un momento.',
                IDEMPOTENCY_KEY_REUSED:
                  'Los datos cambiaron mientras se reintentaba. Vuelve a guardar.',
              },
            })}
          </FormError>
        )
      )}

      <Section title="Tipo">
        <Field id="maintenance-type" label="Tipo de mantenimiento" error={errors.maintenanceTypeId}>
          <Select
            id="maintenance-type"
            value={selectedTypeId}
            onChange={(e) => setTypeId(e.target.value)}
            disabled={types.status !== 'success'}
            aria-invalid={!!errors.maintenanceTypeId || undefined}
          >
            {types.status === 'loading' && <option value="">Cargando tipos…</option>}
            {types.status === 'error' && <option value="">No se pudieron cargar los tipos</option>}
            {types.status === 'success' && !selectedTypeId && (
              <option value="">Elige un tipo</option>
            )}
            {typeList.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>
        {types.status === 'error' && (
          <Button type="button" variant="outline" onClick={types.reload}>
            Reintentar cargar tipos
          </Button>
        )}
        {types.status === 'success' && (
          <NewTypeForm
            onCreated={(type) => {
              setCreatedTypes((current) => [...current, type]);
              setTypeId(type.id);
            }}
          />
        )}
      </Section>

      {!hasVehicle && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Mantenimiento sin vehículo: se registra sin km ni próximo mantenimiento, y no genera
          recordatorio.
        </p>
      )}

      <Section title={hasVehicle ? 'Fecha y km' : 'Fecha'}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            id="performed-at"
            label="Fecha del mantenimiento"
            hint="Puede ser anterior a hoy."
            error={errors.performedAt}
          >
            <Input
              id="performed-at"
              type="datetime-local"
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
              aria-invalid={!!errors.performedAt || undefined}
            />
          </Field>
          {hasVehicle && (
            <Field
              id="odometer"
              label="Km actual"
              optional
              hint={lastKnownKm !== null ? `Último conocido: ${formatKm(lastKnownKm)}` : undefined}
              error={errors.odometerKm}
            >
              <Input
                id="odometer"
                inputMode="numeric"
                autoComplete="off"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                aria-invalid={!!errors.odometerKm || undefined}
              />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Productos usados">
        {items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <ItemRow
                key={item.product.id}
                item={item}
                error={errors.itemQuantity?.[item.product.id]}
                blockPolicy={blockPolicy}
                onQuantity={(value) => updateQuantity(item.product.id, value)}
                onRemove={() => removeItem(item.product.id)}
              />
            ))}
          </ul>
        )}
        {errors.items && <p className="text-sm text-[var(--danger)]">{errors.items}</p>}
        <ProductPicker
          vehicleId={vehicleId}
          excludedIds={new Set(items.map((item) => item.product.id))}
          onAdd={addProduct}
        />
        {items.length === 0 && (
          <p className="text-xs text-[var(--muted-foreground)]">Puede guardarse sin productos.</p>
        )}
      </Section>

      {hasVehicle && (
        <Section>
          <NextDueFields
            values={nextDue}
            onChange={setNextDue}
            errors={errors}
            businessDefault={businessDefault}
          />
        </Section>
      )}

      <Section title="Cobro">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={chargeNow}
            onChange={(e) => setChargeNow(e.target.checked)}
            className="size-5"
          />
          Cobrar ahora
        </label>
        {chargeNow ? (
          <>
            {errors.chargeMethod && (
              <p className="text-sm text-[var(--danger)]">{errors.chargeMethod}</p>
            )}
            <ChargeFields
              idPrefix="charge-now"
              method={chargeMethod}
              onMethod={setChargeMethod}
              amount={chargeAmount}
              onAmount={setChargeAmount}
              amountError={errors.chargeAmount}
            />
          </>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">
            Puede guardarse sin cobro y cobrarse después desde el mantenimiento.
          </p>
        )}
      </Section>

      <Section title="Notas">
        <Field id="maintenance-notes" label="Notas" optional error={errors.notes}>
          <Textarea
            id="maintenance-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>
      </Section>

      {hints.length > 0 && <Hints hints={hints} />}

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Guardando…' : 'Guardar mantenimiento'}
      </Button>
    </form>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {children}
    </section>
  );
}

function ItemRow({
  item,
  error,
  blockPolicy,
  onQuantity,
  onRemove,
}: {
  item: Item;
  error?: string;
  blockPolicy: boolean;
  onQuantity: (value: string) => void;
  onRemove: () => void;
}) {
  const quantity = parseQuantity(item.quantity);
  const stock = item.product.stock;
  const wouldGoNegative =
    item.product.tracksStock &&
    stock?.isCounted &&
    quantity !== null &&
    stock.balance - quantity < 0;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium break-words">{item.product.name}</span>
          {item.stockLoading ? (
            <span className="text-xs text-[var(--muted-foreground)]">Cargando saldo…</span>
          ) : (
            <StockHint product={item.product} />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-10 shrink-0 px-0"
          onClick={onRemove}
          aria-label={`Quitar ${item.product.name}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="Cantidad"
          aria-label={`Cantidad de ${item.product.name}`}
          value={item.quantity}
          onChange={(e) => onQuantity(e.target.value)}
          aria-invalid={!!error || undefined}
          className="w-32"
        />
        <span className="text-sm text-[var(--muted-foreground)]">{item.product.unit}</span>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {wouldGoNegative && stock && (
        <p className="flex items-start gap-1.5 text-xs text-[var(--danger)]">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          Quedaría con saldo negativo (saldo {formatQuantity(stock.balance)}).
          {blockPolicy ? ' El negocio no permite guardar con stock insuficiente.' : ''}
        </p>
      )}
    </li>
  );
}

function Hints({ hints }: { hints: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
      <span className="font-medium">Revisa antes de guardar (no impide guardar)</span>
      {hints.map((hint) => (
        <p key={hint} className="flex items-start gap-1.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {hint}
        </p>
      ))}
    </div>
  );
}

/** 422 con política BLOCK (BR-P11): no se guardó nada; se ofrece "Contar" (07-UI-UX.md §3.3). */
function BlockedByStock({
  productName,
  productId,
  detail,
}: {
  productName?: string;
  productId?: string;
  detail?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-[var(--danger)] p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-medium text-[var(--danger)]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        No se guardó: stock insuficiente{productName ? ` de ${productName}` : ''}.
      </p>
      {detail && <p>{detail}.</p>}
      <p className="text-[var(--muted-foreground)]">
        El negocio no permite guardar con stock insuficiente. Si el estante tiene más, registra un
        conteo y vuelve a guardar.
      </p>
      {productId && (
        <Link
          href={`/inventario/${productId}`}
          className="font-medium underline underline-offset-4"
        >
          Contar {productName ?? 'el producto'}
        </Link>
      )}
    </div>
  );
}

/** Alta rápida de tipo (`POST /maintenance-types`; BR-M13: otros tipos se agregan desde la app). */
function NewTypeForm({ onCreated }: { onCreated: (type: MaintenanceType) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1 py-1 text-sm font-medium underline-offset-4 hover:underline"
      >
        <Plus className="size-4" aria-hidden />
        Agregar un tipo
      </button>
    );
  }

  async function save() {
    if (!name.trim()) {
      setError('Ingresa el nombre del tipo.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await callApi(api.POST('/maintenance-types', { body: { name: name.trim() } }));
    setSaving(false);
    if (!result.ok) {
      setError(
        failureMessage(result.failure, {
          byCode: { MAINTENANCE_TYPE_ALREADY_EXISTS: 'Ya existe un tipo con ese nombre.' },
        }),
      );
      return;
    }
    onCreated(result.data);
    setOpen(false);
    setName('');
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3">
      <Field id="new-type-name" label="Nuevo tipo" error={error ?? undefined}>
        <Input
          id="new-type-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="off"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={saving} className="flex-1">
          {saving ? 'Guardando…' : 'Agregar tipo'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
