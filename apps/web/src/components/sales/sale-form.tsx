'use client';

import { Banknote, Minus, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { ReceiptProductPicker } from '@/components/inventory/receipt-product-picker';
import { StockHint } from '@/components/maintenance/product-picker';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { parseQuantity, type ProductWithStock } from '@/lib/inventory/format';
import { stepQuantity } from '@/lib/inventory/receipts';
import {
  MAX_SALE_LINES,
  MAX_SALE_TEXT,
  PAYMENT_LABELS,
  formatCents,
  parsePrice,
  priceInput,
  subtotalCents,
  type PaymentMethod,
} from '@/lib/sales/format';
import { cn } from '@/lib/utils';

export type CreateSaleResult = Schemas['CreateSaleResponse'];

interface Line {
  product: ProductWithStock;
  quantity: string;
  price: string;
}

type LineErrors = Record<string, string>;

const ERROR_MESSAGES = {
  byCode: {
    INSUFFICIENT_STOCK:
      'Stock insuficiente: corrige la cantidad o quita el producto. No se cobró nada.',
    PRODUCT_INACTIVE: 'Un producto se desactivó: quítalo para cobrar. No se cobró nada.',
    PRODUCT_NOT_FOUND: 'Un producto ya no existe: quítalo para cobrar. No se cobró nada.',
    DUPLICATE_PRODUCT_LINE: 'Hay un producto repetido. No se cobró nada.',
    IDEMPOTENCY_KEY_IN_PROGRESS: 'El cobro todavía se está procesando. Espera un momento.',
    IDEMPOTENCY_KEY_REUSED: 'La venta cambió mientras se reintentaba. Vuelve a cobrar.',
  },
  notFound: 'Un producto ya no existe: quítalo para cobrar. No se cobró nada.',
};

/**
 * Vender (R4, B-134; `10-OPERACION-REAL.md` §2.5): venta de mostrador sin
 * cliente ni placa (DEC-44). Productos activos del catálogo (cada toque suma
 * 1), cantidad con −/+ o teclado (decimales en la unidad del producto),
 * precio aplicado editable (DEC-29; si el producto no tiene precio, se
 * escribe), un solo pago Efectivo o Yape (DEC-30) y nota opcional.
 *
 * El total que se ve es una vista previa con el mismo redondeo que la API;
 * el cobrado es el que devuelve `POST /sales`. Lleva `Idempotency-Key`:
 * reintentar sin cambios no cobra dos veces. Stock insuficiente es un 422
 * (`BLOCK`, DEC-26): no se guarda nada y se marca la línea para corregirla.
 */
export function SaleForm({ onSaved }: { onSaved: (result: CreateSaleResult) => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotency = useIdempotencyKey();

  const quantities = new Map(lines.map((line) => [line.product.id, line.quantity]));
  const totalCents = lines.reduce((sum, line) => {
    const quantity = parseQuantity(line.quantity);
    const price = parsePrice(line.price);
    return quantity === null || price === null ? sum : sum + subtotalCents(quantity, price);
  }, 0);
  const allPriced = lines.every(
    (line) => parseQuantity(line.quantity) !== null && parsePrice(line.price) !== null,
  );

  function clearErrors(productId?: string) {
    setFailure(null);
    setFormError(null);
    if (productId && lineErrors[productId]) {
      const next = { ...lineErrors };
      delete next[productId];
      setLineErrors(next);
    }
  }

  function addProduct(product: ProductWithStock) {
    clearErrors(product.id);
    setLines((current) => {
      if (current.some((line) => line.product.id === product.id)) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: stepQuantity(line.quantity, 1) }
            : line,
        );
      }
      return [...current, { product, quantity: '1', price: priceInput(product.salePrice) }];
    });
  }

  function update(productId: string, patch: Partial<Pick<Line, 'quantity' | 'price'>>) {
    clearErrors(productId);
    setLines((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)),
    );
  }

  function remove(productId: string) {
    clearErrors(productId);
    setLines((current) => current.filter((line) => line.product.id !== productId));
  }

  function validate(): { lines: LineErrors; form: string | null } {
    const found: LineErrors = {};
    for (const { product, quantity, price } of lines) {
      const parsedQuantity = parseQuantity(quantity);
      if (parsedQuantity === null || parsedQuantity <= 0) {
        found[product.id] = 'Cantidad mayor que 0 (hasta 3 decimales).';
      } else if (price.trim() === '') {
        found[product.id] = 'Escribe el precio que cobras en esta venta.';
      } else if (parsePrice(price) === null) {
        found[product.id] = 'Precio de 0 o más, con hasta 2 decimales.';
      }
    }
    let form: string | null = null;
    if (lines.length === 0) form = 'Agrega al menos un producto.';
    else if (lines.length > MAX_SALE_LINES) {
      form = `Una venta admite hasta ${MAX_SALE_LINES} productos.`;
    } else if (!payment) form = 'Elige Efectivo o Yape.';
    return { lines: found, form };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setLineErrors(found.lines);
    setFormError(found.form);
    setFailure(null);
    if (found.form || Object.keys(found.lines).length > 0 || !payment) return;

    const trimmedNote = note.trim();
    const body: Schemas['CreateSaleDto'] = {
      paymentMethod: payment,
      lines: lines.map((line) => ({
        productId: line.product.id,
        quantity: parseQuantity(line.quantity)!,
        unitPrice: parsePrice(line.price)!,
      })),
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };

    setSubmitting(true);
    const result = await callApi(
      api.POST('/sales', {
        params: { header: { 'Idempotency-Key': idempotency.keyFor(body) } },
        body,
      }),
    );
    setSubmitting(false);

    if (result.ok) {
      idempotency.reset();
      onSaved(result.data);
      return;
    }

    // `lines.3.productId`, `lines.3.quantity`…: se marca la línea por su posición.
    const marked: LineErrors = {};
    for (const [field, message] of Object.entries(result.failure.fieldErrors)) {
      const match = /^lines\.(\d+)\./.exec(field);
      const product = match ? lines[Number(match[1])]?.product : undefined;
      if (product) marked[product.id] ??= message;
    }
    // 422 INSUFFICIENT_STOCK: el saldo y la cantidad vienen en `errors[lines]` y
    // el producto solo en el texto de `detail`.
    if (result.failure.code === 'INSUFFICIENT_STOCK') {
      const detail =
        result.failure.classified.kind === 'client' ? result.failure.classified.detail : '';
      const product = lines.find((line) => detail.includes(line.product.id))?.product;
      const stockMessage = result.failure.fieldErrors.lines ?? 'Stock insuficiente.';
      if (product) marked[product.id] = `Stock insuficiente. ${stockMessage}.`;
    }
    setLineErrors(marked);
    setFailure(result.failure);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_24rem] md:items-start"
    >
      <Section title="Agregar productos">
        <ReceiptProductPicker
          quantities={quantities}
          onAdd={addProduct}
          searchLabel="Buscar producto para vender por nombre, marca, código o viscosidad"
        />
      </Section>

      <div className="flex flex-col gap-6">
        <Section title={lines.length ? `Venta · ${countLabel(lines.length)}` : 'Venta'}>
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
                  error={lineErrors[line.product.id]}
                  onChange={(patch) => update(line.product.id, patch)}
                  onRemove={() => remove(line.product.id)}
                />
              ))}
            </ul>
          )}
          {lines.length > 0 && (
            <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)] pt-3">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-semibold">
                {allPriced ? formatCents(totalCents) : '—'}
              </span>
            </div>
          )}
        </Section>

        <Section title="Pago">
          <div role="group" aria-label="Método de pago" className="grid grid-cols-2 gap-3">
            {(['CASH', 'YAPE'] as const).map((method) => {
              const Icon = method === 'CASH' ? Banknote : Smartphone;
              const selected = payment === method;
              return (
                <button
                  key={method}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setPayment(method);
                    setFormError(null);
                  }}
                  className={cn(
                    'flex min-h-14 items-center justify-center gap-2 rounded-lg border px-3 text-base font-semibold',
                    selected
                      ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {PAYMENT_LABELS[method]}
                </button>
              );
            })}
          </div>
          <Field id="sale-note" label="Nota" optional>
            <Textarea
              id="sale-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={MAX_SALE_TEXT}
              rows={2}
            />
          </Field>
        </Section>

        {formError && <FormError>{formError}</FormError>}
        {failure && (
          <FormError>
            {/* El total lo calcula la API y no tiene campo propio en el formulario. */}
            {failure.fieldErrors.total ?? failureMessage(failure, ERROR_MESSAGES)}
          </FormError>
        )}

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting
            ? 'Cobrando…'
            : lines.length > 0 && allPriced
              ? `Cobrar ${formatCents(totalCents)}`
              : 'Cobrar'}
        </Button>
      </div>
    </form>
  );
}

function countLabel(count: number): string {
  return count === 1 ? '1 producto' : `${count} productos`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function LineRow({
  line,
  error,
  onChange,
  onRemove,
}: {
  line: Line;
  error?: string;
  onChange: (patch: Partial<Pick<Line, 'quantity' | 'price'>>) => void;
  onRemove: () => void;
}) {
  const { product } = line;
  const quantity = parseQuantity(line.quantity);
  const price = parsePrice(line.price);
  const quantityId = `sale-qty-${product.id}`;
  const priceId = `sale-price-${product.id}`;
  const errorId = `sale-line-${product.id}-error`;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium break-words">{product.name}</span>
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
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={quantityId} className="text-xs text-[var(--muted-foreground)]">
            Cantidad ({product.unit})
          </label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-11 shrink-0 px-0"
              onClick={() => onChange({ quantity: stepQuantity(line.quantity, -1) })}
              disabled={quantity === null || quantity <= 1}
              aria-label={`Restar 1 a ${product.name}`}
            >
              <Minus className="size-4" aria-hidden />
            </Button>
            <Input
              id={quantityId}
              inputMode="decimal"
              autoComplete="off"
              value={line.quantity}
              onChange={(event) => onChange({ quantity: event.target.value })}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? errorId : undefined}
              className="w-20 text-center text-lg"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 w-11 shrink-0 px-0"
              onClick={() => onChange({ quantity: stepQuantity(line.quantity, 1) })}
              aria-label={`Sumar 1 a ${product.name}`}
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={priceId} className="text-xs text-[var(--muted-foreground)]">
            Precio (S/)
          </label>
          <Input
            id={priceId}
            inputMode="decimal"
            autoComplete="off"
            value={line.price}
            placeholder="0.00"
            onChange={(event) => onChange({ price: event.target.value })}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
            className="w-24 text-right"
          />
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="text-xs text-[var(--muted-foreground)]">Subtotal</span>
          <span className="flex h-11 items-center font-semibold">
            {quantity !== null && price !== null
              ? formatCents(subtotalCents(quantity, price))
              : '—'}
          </span>
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </li>
  );
}
