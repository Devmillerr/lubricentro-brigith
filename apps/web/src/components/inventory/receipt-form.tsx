'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { StockHint } from '@/components/maintenance/product-picker';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { parseQuantity, type ProductWithStock } from '@/lib/inventory/format';
import {
  MAX_RECEIPT_LINES,
  MAX_RECEIPT_NOTE,
  MAX_RECEIPT_QUANTITY,
  productCountLabel,
  stepQuantity,
  type InventoryReceipt,
} from '@/lib/inventory/receipts';
import { ReceiptProductPicker } from './receipt-product-picker';
import { useSubmitLock } from '@/lib/use-submit-lock';

interface Line {
  product: ProductWithStock;
  quantity: string;
}

type Errors = Partial<Record<'lines' | 'occurredAt' | 'note', string>> & {
  line?: Record<string, string>;
};

const ERROR_MESSAGES = {
  byCode: {
    IDEMPOTENCY_KEY_IN_PROGRESS:
      'La recepción anterior todavía se está procesando. Inténtalo en un momento.',
    IDEMPOTENCY_KEY_REUSED: 'La recepción cambió mientras se reintentaba. Vuelve a guardarla.',
    PRODUCT_INACTIVE:
      'Uno de los productos se desactivó. Quítalo o reactívalo y vuelve a guardar. No se guardó nada.',
    PRODUCT_NOT_FOUND:
      'Uno de los productos ya no existe. Quítalo y vuelve a guardar. No se guardó nada.',
    DUPLICATE_PRODUCT_LINE: 'Hay un producto repetido. No se guardó nada.',
  },
  notFound: 'Uno de los productos ya no existe. Quítalo y vuelve a guardar. No se guardó nada.',
};

/**
 * Recibir (07-UI-UX.md §3.6, cambios de R3; BR-P6): varios productos en una
 * sola operación. `POST /inventory/receipts` guarda la cabecera y un
 * `PURCHASE_IN` por línea en una transacción: todo o nada. Los errores se
 * validan antes de enviar (líneas vacías, cantidades ≤ 0, repetidos). Lleva
 * `Idempotency-Key`: si falla la red y se reintenta sin cambios, no se duplica.
 */
export function ReceiptForm({
  initialProducts = [],
  onSaved,
}: {
  /** Productos que arrancan agregados con cantidad 1 (p. ej. desde "Ingreso"). */
  initialProducts?: ProductWithStock[];
  onSaved: (receipt: InventoryReceipt, products: ProductWithStock[]) => void;
}) {
  const [lines, setLines] = useState<Line[]>(() =>
    initialProducts.map((product) => ({ product, quantity: '1' })),
  );
  const [occurredAt, setOccurredAt] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();
  const idempotency = useIdempotencyKey();

  const quantities = new Map(lines.map((line) => [line.product.id, line.quantity]));

  function clearLineError(productId: string) {
    if (!errors.line?.[productId] && !errors.lines) return;
    const line = { ...errors.line };
    delete line[productId];
    setErrors({ ...errors, lines: undefined, line });
  }

  function addProduct(product: ProductWithStock) {
    clearLineError(product.id);
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: stepQuantity(line.quantity, 1) }
            : line,
        );
      }
      return [...current, { product, quantity: '1' }];
    });
  }

  function updateQuantity(productId: string, quantity: string) {
    clearLineError(productId);
    setLines((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, quantity } : line)),
    );
  }

  function removeLine(productId: string) {
    clearLineError(productId);
    setLines((current) => current.filter((line) => line.product.id !== productId));
  }

  function validate(): Errors {
    const found: Errors = {};
    if (lines.length === 0) found.lines = 'Agrega al menos un producto.';
    if (lines.length > MAX_RECEIPT_LINES) {
      found.lines = `Una recepción admite hasta ${MAX_RECEIPT_LINES} productos.`;
    }
    const line: Record<string, string> = {};
    const seen = new Set<string>();
    for (const { product, quantity } of lines) {
      const parsed = parseQuantity(quantity);
      if (parsed === null || parsed <= 0) {
        line[product.id] = 'Cantidad mayor que 0 (hasta 3 decimales).';
      } else if (parsed > MAX_RECEIPT_QUANTITY) {
        line[product.id] = 'La cantidad es demasiado grande.';
      }
      if (seen.has(product.id)) line[product.id] = 'Producto repetido.';
      seen.add(product.id);
    }
    if (Object.keys(line).length) found.line = line;
    if (occurredAt && Number.isNaN(new Date(occurredAt).getTime())) {
      found.occurredAt = 'Ingresa una fecha válida.';
    }
    if (note.trim().length > MAX_RECEIPT_NOTE) {
      found.note = `La nota admite hasta ${MAX_RECEIPT_NOTE} caracteres.`;
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (found.lines || found.line || found.occurredAt || found.note) return;
    if (!lock.acquire()) return;
    setSubmitting(true);

    const body: Schemas['CreateReceiptDto'] = {
      lines: lines.map((line) => ({
        productId: line.product.id,
        quantity: parseQuantity(line.quantity)!,
      })),
    };
    if (occurredAt) body.occurredAt = new Date(occurredAt).toISOString();
    if (note.trim()) body.note = note.trim();

    const result = await callApi(
      api.POST('/inventory/receipts', {
        params: { header: { 'Idempotency-Key': idempotency.keyFor(body) } },
        body,
      }),
    );
    lock.release();
    setSubmitting(false);

    if (result.ok) {
      idempotency.reset();
      onSaved(
        result.data,
        lines.map((line) => line.product),
      );
      return;
    }

    // `lines.3.quantity`, `lines.3.productId`: se marca la línea por su posición.
    const apiErrors = result.failure.fieldErrors;
    const line: Record<string, string> = {};
    for (const [field, message] of Object.entries(apiErrors)) {
      const match = /^lines\.(\d+)\./.exec(field);
      const product = match ? lines[Number(match[1])]?.product : undefined;
      if (product) line[product.id] ??= message;
    }
    setErrors({
      lines: apiErrors.lines,
      occurredAt: apiErrors.occurredAt,
      note: apiErrors.note,
      ...(Object.keys(line).length ? { line } : {}),
    });
    setFailure(result.failure);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start"
    >
      <Section title="Agregar productos">
        <ReceiptProductPicker quantities={quantities} onAdd={addProduct} />
      </Section>

      <div className="flex flex-col gap-6">
        <Section
          title={lines.length ? `Recibido · ${productCountLabel(lines.length)}` : 'Recibido'}
        >
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
              Todavía no agregaste productos.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <LineRow
                  key={line.product.id}
                  line={line}
                  error={errors.line?.[line.product.id]}
                  onQuantity={(value) => updateQuantity(line.product.id, value)}
                  onRemove={() => removeLine(line.product.id)}
                />
              ))}
            </ul>
          )}
          {errors.lines && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {errors.lines}
            </p>
          )}
        </Section>

        <Section title="Datos de la recepción">
          <Field
            id="receipt-date"
            label="Fecha"
            optional
            hint="Si la dejas vacía, se registra con la fecha y hora actuales."
            error={errors.occurredAt}
          >
            <Input
              id="receipt-date"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              aria-invalid={!!errors.occurredAt || undefined}
            />
          </Field>
          <Field id="receipt-note" label="Nota" optional error={errors.note}>
            <Textarea
              id="receipt-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_RECEIPT_NOTE}
              placeholder="Ej.: pedido semanal de aceites"
              aria-invalid={!!errors.note || undefined}
            />
          </Field>
        </Section>

        {failure && <FormError>{failureMessage(failure, ERROR_MESSAGES)}</FormError>}

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar recepción'}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function LineRow({
  line,
  error,
  onQuantity,
  onRemove,
}: {
  line: Line;
  error?: string;
  onQuantity: (value: string) => void;
  onRemove: () => void;
}) {
  const { product } = line;
  const parsed = parseQuantity(line.quantity);
  const inputId = `receipt-line-${product.id}`;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={inputId} className="font-medium break-words">
            {product.name}
          </label>
          <StockHint product={product} />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-10 shrink-0 px-0"
          onClick={onRemove}
          aria-label={`Quitar ${product.name}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 px-0"
          onClick={() => onQuantity(stepQuantity(line.quantity, -1))}
          disabled={parsed === null || parsed <= 1}
          aria-label={`Restar 1 a ${product.name}`}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <Input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          value={line.quantity}
          onChange={(e) => onQuantity(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="w-24 text-center text-lg"
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 px-0"
          onClick={() => onQuantity(stepQuantity(line.quantity, 1))}
          aria-label={`Sumar 1 a ${product.name}`}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
        <span className="truncate text-sm text-[var(--muted-foreground)]">{product.unit}</span>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </li>
  );
}
