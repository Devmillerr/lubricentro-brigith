'use client';

import { ArrowUpRight, CircleAlert, Info } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure, type ApiResult } from '@/lib/api/request';
import {
  formatQuantity,
  formatSigned,
  parseQuantity,
  QUANTITY_DECIMALS,
  type InventoryMovement,
  type StockView,
} from '@/lib/inventory/format';
import { cn } from '@/lib/utils';
import { useSubmitLock } from '@/lib/use-submit-lock';

export type StockOperation = 'count' | 'adjustment';

/** El ingreso se registra en Recibir, con este producto ya agregado (R3, 07-UI-UX.md §3.6). */
export function receiveProductHref(productId: string): string {
  return `/inventario/recepciones/nueva?producto=${encodeURIComponent(productId)}`;
}

type Errors = Partial<Record<'quantity' | 'reason' | 'detail' | 'occurredAt', string>>;

/** Motivos de ajuste (BR-P10, DEC-39). Se guardan como texto, sin catálogo cerrado. */
const ADJUSTMENT_REASONS = [
  'Conteo físico distinto',
  'Producto dañado',
  'Consumo interno',
  'Otro',
] as const;
type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/** Largo máximo del motivo en la API. */
const MAX_REASON = 500;

/** Motivo enviado: el chip y, si hay, el detalle. Con "Otro", el detalle es el motivo. */
function adjustmentReason(chip: AdjustmentReason, detail: string): string {
  const text = detail.trim();
  if (!text) return chip;
  return chip === 'Otro' ? text : `${chip}: ${text}`;
}

function roundQuantity(value: number): number {
  const factor = 10 ** QUANTITY_DECIMALS;
  return Math.round(value * factor) / factor;
}

const ERROR_MESSAGES = {
  byCode: {
    IDEMPOTENCY_KEY_IN_PROGRESS:
      'La operación anterior todavía se está procesando. Inténtalo en un momento.',
    IDEMPOTENCY_KEY_REUSED: 'La operación cambió mientras se reintentaba. Vuelve a enviarla.',
    PRODUCT_INACTIVE: 'Este producto está inactivo. Reactívalo para mover su stock.',
    ADJUSTMENT_REQUIRES_COUNT:
      'Este producto no tiene conteo inicial. Regístralo en Contar antes de ajustar.',
    NO_DIFFERENCE:
      'El sistema ya tiene esa cantidad: no hay nada que ajustar. Revisa el saldo actualizado.',
  },
  notFound: 'Este producto ya no existe.',
};

/**
 * Las tres acciones de inventario sobre un producto (07-UI-UX.md §3.6):
 * Contar (BR-P7), Ingreso (BR-P6) y Ajuste (BR-P7b, BR-P10).
 * Ingreso no se registra aquí: lleva a Recibir con el producto ya agregado,
 * para que toda recepción pase por el mismo flujo (R3).
 * En Ajuste se escribe lo que hay en el estante y se elige el motivo; la API
 * calcula la diferencia con el producto bloqueado. Solo en productos activos
 * con conteo (DEC-48, DEC-51); si la cantidad es igual al saldo no hay nada
 * que guardar (DEC-49).
 * Cada envío lleva `Idempotency-Key`; si falla por red y se reintenta sin
 * cambiar los datos, se reusa la clave y no se duplica el movimiento.
 */
export function StockOperationForm({
  productId,
  productActive,
  stock,
  initialOperation = 'count',
  onRegistered,
}: {
  productId: string;
  /** Un producto inactivo no se ajusta (BR-P21). */
  productActive: boolean;
  stock: StockView;
  initialOperation?: StockOperation;
  onRegistered: (movement: InventoryMovement) => void;
}) {
  const [operation, setOperation] = useState<StockOperation>(initialOperation);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<AdjustmentReason | null>(null);
  const [detail, setDetail] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();
  const idempotency = useIdempotencyKey();

  // Contar y Ajuste reciben lo mismo: la cantidad que hay en el estante.
  const parsed = parseQuantity(quantity);
  const delta = parsed === null ? null : roundQuantity(parsed - stock.balance);
  const adjusting = operation === 'adjustment';
  const adjustmentBlocked = adjusting && (!productActive || !stock.isCounted);

  function switchOperation(next: StockOperation) {
    setOperation(next);
    setErrors({});
    setFailure(null);
  }

  function validate(): Errors {
    const found: Errors = {};
    if (parsed === null) {
      found.quantity = 'Ingresa una cantidad válida (0 o más, hasta 3 decimales).';
    }
    if (!adjusting) return found;
    if (delta === 0) {
      found.quantity = 'Es lo mismo que dice el sistema: no hay nada que ajustar.';
    }
    if (!reason) {
      found.reason = 'Elige el motivo del ajuste.';
    } else if (reason === 'Otro' && !detail.trim()) {
      found.detail = 'Cuenta brevemente qué pasó.';
    } else if (adjustmentReason(reason, detail).length > MAX_REASON) {
      found.detail = `El motivo admite hasta ${MAX_REASON} caracteres.`;
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || adjustmentBlocked) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (Object.values(found).some(Boolean) || parsed === null) return;
    if (!lock.acquire()) return;
    setSubmitting(true);

    let result: ApiResult<InventoryMovement>;
    if (operation === 'count') {
      const date = occurredAt ? new Date(occurredAt).toISOString() : undefined;
      const body = { productId, countedQuantity: parsed, ...(date ? { occurredAt: date } : {}) };
      result = await callApi(
        api.POST('/inventory/counts', {
          params: { header: { 'Idempotency-Key': idempotency.keyFor(['count', body]) } },
          body,
        }),
      );
    } else {
      // La diferencia la calcula el servidor contra el saldo con el producto
      // bloqueado (BR-P7b): la que se ve aquí es solo una vista previa.
      const body = {
        productId,
        physicalQuantity: parsed,
        reason: adjustmentReason(reason!, detail),
      };
      result = await callApi(
        api.POST('/inventory/adjustments', {
          params: { header: { 'Idempotency-Key': idempotency.keyFor(['adjustment', body]) } },
          body,
        }),
      );
    }

    lock.release();
    setSubmitting(false);
    if (result.ok) {
      idempotency.reset();
      setQuantity('');
      setReason(null);
      setDetail('');
      setOccurredAt('');
      onRegistered(result.data);
      return;
    }
    const apiErrors = result.failure.fieldErrors;
    setErrors({
      quantity: apiErrors.countedQuantity ?? apiErrors.physicalQuantity,
      detail: apiErrors.reason,
      occurredAt: apiErrors.occurredAt,
    });
    setFailure(result.failure);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      noValidate
    >
      <div
        role="group"
        aria-label="Tipo de movimiento"
        className="grid grid-cols-3 gap-1 rounded-md bg-[var(--muted)] p-1"
      >
        <OperationButton selected={operation === 'count'} onClick={() => switchOperation('count')}>
          Contar
        </OperationButton>
        {/* Ingreso ya no registra una sola línea: lleva a Recibir con el producto. */}
        <Link
          href={receiveProductHref(productId)}
          aria-label="Ingreso: abre Recibir con este producto"
          className={cn(
            OPERATION_CLASS,
            'text-[var(--muted-foreground)] hover:bg-[var(--surface)]/60',
          )}
        >
          Ingreso
          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
        <OperationButton
          selected={operation === 'adjustment'}
          onClick={() => switchOperation('adjustment')}
        >
          Ajuste
        </OperationButton>
      </div>

      {failure && <FormError>{failureMessage(failure, ERROR_MESSAGES)}</FormError>}

      {adjustmentBlocked ? (
        <AdjustmentUnavailable
          productActive={productActive}
          onCount={() => switchOperation('count')}
        />
      ) : (
        <>
          {adjusting && (
            <p className="flex items-baseline justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2">
              <span className="text-sm text-[var(--muted-foreground)]">El sistema dice</span>
              <span className="text-lg font-semibold">{formatQuantity(stock.balance)}</span>
            </p>
          )}

          <Field
            id="stock-quantity"
            label={adjusting ? 'Lo que hay en el estante' : 'Cantidad contada'}
            hint={
              adjusting
                ? 'Escribe el total que hay, no la diferencia.'
                : 'Lo que hay en el estante, tal como lo contaste.'
            }
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

          {adjusting ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span id="stock-reason-label" className="text-sm font-medium">
                  Motivo
                </span>
                <div
                  role="group"
                  aria-labelledby="stock-reason-label"
                  className="flex flex-wrap gap-2"
                >
                  {ADJUSTMENT_REASONS.map((option) => (
                    <Chip
                      key={option}
                      selected={reason === option}
                      onClick={() => {
                        setReason(option);
                        setErrors({ ...errors, reason: undefined, detail: undefined });
                      }}
                    >
                      {option}
                    </Chip>
                  ))}
                </div>
                {errors.reason && (
                  <p role="alert" className="text-sm text-[var(--danger)]">
                    {errors.reason}
                  </p>
                )}
              </div>
              <Field
                id="stock-detail"
                label="Detalle"
                optional={reason !== 'Otro'}
                error={errors.detail}
              >
                <Textarea
                  id="stock-detail"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  maxLength={MAX_REASON}
                  placeholder={reason === 'Otro' ? 'Qué pasó' : 'Ej.: se rompió una botella'}
                  aria-invalid={!!errors.detail || undefined}
                />
              </Field>
            </>
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
            {!adjusting && (
              <PreviewRow label="Saldo del sistema">{formatQuantity(stock.balance)}</PreviewRow>
            )}
            {!adjusting && !stock.isCounted && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Este será el conteo inicial del producto.
              </p>
            )}
            {delta === null ? (
              adjusting && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Escribe lo que hay en el estante para ver la diferencia.
                </p>
              )
            ) : (
              <>
                <PreviewRow label="Diferencia" strong={adjusting}>
                  <span className={cn(delta < 0 && 'text-[var(--danger)]')}>
                    {formatSigned(delta)}
                  </span>
                </PreviewRow>
                <PreviewRow label="Stock resultante" strong={!adjusting}>
                  {formatQuantity(parsed!)}
                </PreviewRow>
                {adjusting && delta === 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-[var(--muted-foreground)]">
                    <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                    Coincide con el sistema: no hay nada que ajustar.
                  </p>
                )}
              </>
            )}
          </Preview>

          <Button type="submit" size="lg" disabled={submitting || (adjusting && delta === 0)}>
            {submitting ? 'Registrando…' : adjusting ? 'Registrar ajuste' : 'Registrar conteo'}
          </Button>
        </>
      )}
    </form>
  );
}

/** Ajuste no disponible: producto inactivo (BR-P21) o sin conteo inicial (DEC-48). */
function AdjustmentUnavailable({
  productActive,
  onCount,
}: {
  productActive: boolean;
  onCount: () => void;
}) {
  if (!productActive) {
    return (
      <p className="flex items-start gap-2 rounded-md bg-[var(--muted)] p-3 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Este producto está inactivo: no se puede ajustar. Reactívalo desde su ficha para mover su
        stock.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md bg-[var(--muted)] p-3 text-sm">
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Este producto todavía no tiene conteo inicial, así que su saldo no es confiable. Cuenta lo
        que hay en el estante: ese conteo deja el saldo correcto.
      </p>
      <Button type="button" onClick={onCount}>
        Contar
      </Button>
    </div>
  );
}

const OPERATION_CLASS = 'flex h-11 items-center justify-center gap-1 rounded text-sm font-medium';

function OperationButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        OPERATION_CLASS,
        selected ? 'bg-[var(--segment-selected)] shadow-sm' : 'text-[var(--muted-foreground)]',
      )}
    >
      {children}
    </button>
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
