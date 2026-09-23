'use client';

import { CircleAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import {
  formatQuantity,
  formatSigned,
  parseQuantity,
  type InventoryMovement,
  type StockView,
} from '@/lib/inventory/format';
import { cn } from '@/lib/utils';

export type StockOperation = 'count' | 'receipt' | 'adjustment';

const OPERATIONS: { value: StockOperation; label: string }[] = [
  { value: 'count', label: 'Contar' },
  { value: 'receipt', label: 'Ingreso' },
  { value: 'adjustment', label: 'Ajuste' },
];

type Errors = Partial<Record<'quantity' | 'reason' | 'occurredAt', string>>;

const ERROR_MESSAGES = {
  byCode: {
    IDEMPOTENCY_KEY_IN_PROGRESS:
      'La operación anterior todavía se está procesando. Inténtalo en un momento.',
    IDEMPOTENCY_KEY_REUSED: 'La operación cambió mientras se reintentaba. Vuelve a enviarla.',
  },
  notFound: 'Este producto ya no existe.',
};

/**
 * Las tres acciones de inventario sobre un producto (07-UI-UX.md §3.6):
 * Contar (BR-P7), Ingreso (BR-P6) y Ajuste con motivo obligatorio (BR-P10).
 * Cada envío lleva `Idempotency-Key`; si falla por red y se reintenta sin
 * cambiar los datos, se reusa la clave y no se duplica el movimiento.
 */
export function StockOperationForm({
  productId,
  stock,
  initialOperation = 'count',
  onRegistered,
}: {
  productId: string;
  stock: StockView;
  initialOperation?: StockOperation;
  onRegistered: (movement: InventoryMovement) => void;
}) {
  const [operation, setOperation] = useState<StockOperation>(initialOperation);
  const [quantity, setQuantity] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [reason, setReason] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotency = useIdempotencyKey();

  const parsed = parseQuantity(quantity);
  const delta =
    parsed === null
      ? null
      : operation === 'count'
        ? parsed - stock.balance
        : operation === 'receipt'
          ? parsed
          : direction === 'in'
            ? parsed
            : -parsed;
  const resulting = delta === null ? null : stock.balance + delta;

  function switchOperation(next: StockOperation) {
    setOperation(next);
    setErrors({});
    setFailure(null);
  }

  function validate(): Errors {
    const found: Errors = {};
    if (parsed === null) {
      found.quantity = 'Ingresa una cantidad válida (hasta 3 decimales).';
    } else if (operation !== 'count' && parsed <= 0) {
      found.quantity = 'La cantidad debe ser mayor que 0.';
    }
    if (operation === 'adjustment' && !reason.trim()) {
      found.reason = 'El motivo del ajuste es obligatorio.';
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (Object.values(found).some(Boolean) || parsed === null) return;
    setSubmitting(true);

    const date = occurredAt ? new Date(occurredAt).toISOString() : undefined;
    let result;
    if (operation === 'count') {
      const body = { productId, countedQuantity: parsed, ...(date ? { occurredAt: date } : {}) };
      result = await callApi(
        api.POST('/inventory/counts', {
          params: { header: { 'Idempotency-Key': idempotency.keyFor(['count', body]) } },
          body,
        }),
      );
    } else if (operation === 'receipt') {
      const body = { productId, quantity: parsed, ...(date ? { occurredAt: date } : {}) };
      result = await callApi(
        api.POST('/inventory/receipts', {
          params: { header: { 'Idempotency-Key': idempotency.keyFor(['receipt', body]) } },
          body,
        }),
      );
    } else {
      const body = {
        productId,
        quantityDelta: direction === 'in' ? parsed : -parsed,
        reason: reason.trim(),
      };
      result = await callApi(
        api.POST('/inventory/adjustments', {
          params: { header: { 'Idempotency-Key': idempotency.keyFor(['adjustment', body]) } },
          body,
        }),
      );
    }

    setSubmitting(false);
    if (result.ok) {
      idempotency.reset();
      setQuantity('');
      setReason('');
      setOccurredAt('');
      onRegistered(result.data);
      return;
    }
    const apiErrors = result.failure.fieldErrors;
    setErrors({
      quantity: apiErrors.countedQuantity ?? apiErrors.quantity ?? apiErrors.quantityDelta,
      reason: apiErrors.reason,
      occurredAt: apiErrors.occurredAt,
    });
    setFailure(result.failure);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-[var(--border)] p-4"
      noValidate
    >
      <div
        role="tablist"
        aria-label="Tipo de movimiento"
        className="grid grid-cols-3 gap-1 rounded-md bg-[var(--muted)] p-1"
      >
        {OPERATIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={operation === option.value}
            onClick={() => switchOperation(option.value)}
            className={cn(
              'h-10 rounded text-sm font-medium',
              operation === option.value
                ? 'bg-[var(--background)] shadow-sm'
                : 'text-[var(--muted-foreground)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {failure && <FormError>{failureMessage(failure, ERROR_MESSAGES)}</FormError>}

      {operation === 'adjustment' && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sentido del ajuste">
          {(['in', 'out'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              onClick={() => setDirection(value)}
              className={cn(
                'h-11 rounded-md border text-sm font-medium',
                direction === value
                  ? 'border-[var(--foreground)] bg-[var(--muted)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)]',
              )}
            >
              {value === 'in' ? 'Entra (+)' : 'Sale (−)'}
            </button>
          ))}
        </div>
      )}

      <Field
        id="stock-quantity"
        label={operation === 'count' ? 'Cantidad contada' : 'Cantidad'}
        hint={operation === 'count' ? 'Lo que hay en el estante, tal como lo contaste.' : undefined}
        error={errors.quantity}
      >
        <Input
          id="stock-quantity"
          inputMode="decimal"
          autoComplete="off"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          aria-invalid={!!errors.quantity || undefined}
          className="text-lg"
        />
      </Field>

      {operation === 'adjustment' ? (
        <Field id="stock-reason" label="Motivo" error={errors.reason}>
          <Textarea
            id="stock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            aria-invalid={!!errors.reason || undefined}
          />
        </Field>
      ) : (
        <Field
          id="stock-date"
          label="Fecha"
          optional
          hint="Si la dejas vacía, se registra con la fecha y hora actuales."
          error={errors.occurredAt}
        >
          <Input
            id="stock-date"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            aria-invalid={!!errors.occurredAt || undefined}
          />
        </Field>
      )}

      <Preview>
        <PreviewRow label="Saldo del sistema">{formatQuantity(stock.balance)}</PreviewRow>
        {operation === 'count' && !stock.isCounted && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Este será el conteo inicial del producto.
          </p>
        )}
        {delta !== null && (
          <>
            {operation === 'count' && (
              <PreviewRow label="Diferencia">{formatSigned(delta)}</PreviewRow>
            )}
            <PreviewRow label="Stock resultante" strong>
              {formatQuantity(resulting!)}
            </PreviewRow>
            {resulting! < 0 && (
              <p className="flex items-start gap-1.5 text-xs text-[var(--danger)]">
                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                El saldo quedará negativo.
              </p>
            )}
          </>
        )}
      </Preview>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting
          ? 'Registrando…'
          : operation === 'count'
            ? 'Registrar conteo'
            : operation === 'receipt'
              ? 'Registrar ingreso'
              : 'Registrar ajuste'}
      </Button>
    </form>
  );
}

function Preview({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 rounded-md bg-[var(--muted)] p-3">{children}</div>;
}

function PreviewRow({
  label,
  strong = false,
  children,
}: {
  label: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className={strong ? 'text-base font-semibold' : ''}>{children}</span>
    </div>
  );
}
