'use client';

import { Banknote, Minus, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { ReceiptProductPicker } from '@/components/inventory/receipt-product-picker';
import { Button } from '@/components/ui/button';
import {
  CHECKOUT_BUTTON_CLASS,
  CHECKOUT_PENDING_CLASS,
  CheckoutBar,
  revealStep,
} from '@/components/ui/checkout-bar';
import { Chip } from '@/components/ui/chip';
import { BucketGauge, hasContainer } from '@/components/products/bucket-gauge';
import { formatQuantity } from '@/lib/inventory/format';
import { shortUnit } from '@/lib/products/container';
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
  formatMoney,
  parsePrice,
  priceInput,
  subtotalCents,
  type PaymentMethod,
} from '@/lib/sales/format';
import { equivalenceLabel, fitsStockDecimals, stockFor, type SaleUnit } from '@/lib/products/units';
import { cn } from '@/lib/utils';
import { useSubmitLock } from '@/lib/use-submit-lock';

export type CreateSaleResult = Schemas['CreateSaleResponse'];

interface Line {
  /** Clave local: un producto con formas puede ir en varias líneas (octavo y galón). */
  key: string;
  product: ProductWithStock;
  /** Forma de venta elegida (DEC-91); null en productos sin formas o mientras no se elige. */
  saleUnit: SaleUnit | null;
  quantity: string;
  price: string;
}

let lineCounter = 0;
function newLineKey(): string {
  lineCounter += 1;
  return `line-${lineCounter}`;
}

function hasSaleUnits(product: ProductWithStock): boolean {
  return product.saleUnits.length > 0;
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
 *
 * Formas de venta (DEC-91): si el producto las tiene (octavo, cuarto, galón,
 * balde…), la línea pide elegir una antes de cobrar. El precio es siempre el
 * de esta venta (`unitPrice` por línea, DEC-29): si la forma tiene un precio
 * configurado se propone, si no se escribe; nunca se toma el de otra forma ni
 * el de ventas anteriores, y el inventario no depende de él (1/4 de galón
 * siempre descuenta 1 L). La línea muestra presentación, cantidad en la
 * unidad de stock y precio de venta. El mismo producto puede ir en varias
 * líneas, una por forma. Los productos sin formas se venden como siempre.
 */
export function SaleForm({ onSaved }: { onSaved: (result: CreateSaleResult) => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();
  const idempotency = useIdempotencyKey();

  // Para el buscador: cuánto se lleva de cada producto (la primera línea).
  const quantities = new Map<string, string>();
  for (const line of lines) {
    if (!quantities.has(line.product.id)) quantities.set(line.product.id, line.quantity);
  }
  const totalCents = lines.reduce((sum, line) => {
    const quantity = parseQuantity(line.quantity);
    const price = parsePrice(line.price);
    return quantity === null || price === null ? sum : sum + subtotalCents(quantity, price);
  }, 0);
  // Stock que descontaría el carrito, por producto (para el balde, DEC-93).
  const consumedByProduct = new Map<string, number>();
  for (const line of lines) {
    const quantity = parseQuantity(line.quantity);
    if (quantity === null) continue;
    const stock = line.saleUnit ? stockFor(quantity, line.saleUnit.factor) : quantity;
    consumedByProduct.set(
      line.product.id,
      Math.round(((consumedByProduct.get(line.product.id) ?? 0) + stock) * 1000) / 1000,
    );
  }
  const allPriced = lines.every(
    (line) => parseQuantity(line.quantity) !== null && parsePrice(line.price) !== null,
  );
  // Qué falta para cobrar: el botón lo dice en vez de esperar al toque.
  const pending =
    lines.length === 0
      ? 'Agrega un producto'
      : lines.some((line) => hasSaleUnits(line.product) && !line.saleUnit)
        ? 'Elige cómo se vende'
        : !allPriced
          ? 'Completa cantidad y precio'
          : !payment
            ? 'Elige Efectivo o Yape'
            : null;

  function clearErrors(key?: string) {
    setFailure(null);
    setFormError(null);
    if (key && lineErrors[key]) {
      const next = { ...lineErrors };
      delete next[key];
      setLineErrors(next);
    }
  }

  /**
   * Tocar un producto suma 1 a su línea. Con formas de venta: si hay una
   * línea sin forma elegida, se suma ahí; si no, se abre otra línea para
   * elegir la forma (p. ej. un octavo y además un galón).
   */
  function addProduct(product: ProductWithStock) {
    setFailure(null);
    setFormError(null);
    setLines((current) => {
      const target = hasSaleUnits(product)
        ? current.find((line) => line.product.id === product.id && line.saleUnit === null)
        : current.find((line) => line.product.id === product.id);
      if (target) {
        return current.map((line) =>
          line.key === target.key ? { ...line, quantity: stepQuantity(line.quantity, 1) } : line,
        );
      }
      return [
        ...current,
        {
          key: newLineKey(),
          product,
          saleUnit: null,
          quantity: '1',
          // Con formas, el precio sale de la forma elegida: no se precarga el del producto.
          price: hasSaleUnits(product) ? '' : priceInput(product.salePrice),
        },
      ];
    });
  }

  function update(key: string, patch: Partial<Pick<Line, 'quantity' | 'price'>>) {
    clearErrors(key);
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  /** Elegir la forma pone su precio (el del catálogo de esa forma, o vacío para escribirlo). */
  function chooseSaleUnit(key: string, saleUnit: SaleUnit) {
    clearErrors(key);
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, saleUnit, price: priceInput(saleUnit.salePrice) } : line,
      ),
    );
  }

  function remove(key: string) {
    clearErrors(key);
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function validate(): { lines: LineErrors; form: string | null } {
    const found: LineErrors = {};
    const seen = new Set<string>();
    for (const { key, product, saleUnit, quantity, price } of lines) {
      const parsedQuantity = parseQuantity(quantity);
      const pairKey = `${product.id}:${saleUnit?.id ?? ''}`;
      if (hasSaleUnits(product) && !saleUnit) {
        found[key] = 'Elige cómo lo vendes (octavo, galón, balde…).';
      } else if (seen.has(pairKey)) {
        found[key] = saleUnit
          ? `Ya hay una línea de «${saleUnit.label}»: suma la cantidad ahí.`
          : 'Producto repetido.';
      } else if (parsedQuantity === null || parsedQuantity <= 0) {
        found[key] = 'Cantidad mayor que 0 (hasta 3 decimales).';
      } else if (saleUnit && !fitsStockDecimals(parsedQuantity, saleUnit.factor)) {
        found[key] = 'Con esta forma, usa una cantidad entera.';
      } else if (price.trim() === '') {
        found[key] = 'Escribe el precio de venta de esta operación.';
      } else if (parsePrice(price) === null) {
        found[key] = 'Precio de 0 o más, con hasta 2 decimales.';
      }
      seen.add(pairKey);
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
    setFailure(null);
    if (pending) {
      // El botón ya dice qué falta: se lleva a la vista ese paso.
      setFormError(null);
      const firstLine = lines.find((line) => found.lines[line.key]);
      revealStep(
        document.getElementById(
          lines.length === 0
            ? 'sale-products'
            : firstLine
              ? `sale-line-${firstLine.key}`
              : 'sale-payment',
        ),
      );
      return;
    }
    setFormError(found.form);
    if (found.form || Object.keys(found.lines).length > 0 || !payment) return;

    const trimmedNote = note.trim();
    const body: Schemas['CreateSaleDto'] = {
      paymentMethod: payment,
      lines: lines.map((line) => ({
        productId: line.product.id,
        ...(line.saleUnit ? { saleUnitId: line.saleUnit.id } : {}),
        quantity: parseQuantity(line.quantity)!,
        unitPrice: parsePrice(line.price)!,
      })),
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };

    if (!lock.acquire()) return;
    setSubmitting(true);
    const result = await callApi(
      api.POST('/sales', {
        params: { header: { 'Idempotency-Key': idempotency.keyFor(body) } },
        body,
      }),
    );
    lock.release();
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
      const line = match ? lines[Number(match[1])] : undefined;
      if (line) marked[line.key] ??= message;
    }
    // 422 INSUFFICIENT_STOCK: el saldo y la cantidad vienen en `errors[lines]` y
    // el producto solo en el texto de `detail`.
    if (result.failure.code === 'INSUFFICIENT_STOCK') {
      const detail =
        result.failure.classified.kind === 'client' ? result.failure.classified.detail : '';
      const line = lines.find((candidate) => detail.includes(candidate.product.id));
      const stockMessage = result.failure.fieldErrors.lines ?? 'Stock insuficiente.';
      if (line) {
        marked[line.key] = `Stock insuficiente. ${stockMessage} ${shortUnit(line.product.unit)}.`;
      }
    }
    setLineErrors(marked);
    setFailure(result.failure);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_24rem] md:grid-rows-[auto_1fr] md:items-start"
    >
      {/* En pantallas anchas ocupa las dos filas: la barra queda bajo Pago, no bajo la lista. */}
      <Section id="sale-products" title="Agregar productos" className="md:row-span-2">
        <ReceiptProductPicker
          quantities={quantities}
          onAdd={addProduct}
          searchLabel="Buscar producto para vender por nombre, marca, código o viscosidad"
          stockDisplay="balance"
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
                  key={line.key}
                  line={line}
                  error={lineErrors[line.key]}
                  onChange={(patch) => update(line.key, patch)}
                  onChooseUnit={(saleUnit) => chooseSaleUnit(line.key, saleUnit)}
                  consumed={consumedByProduct.get(line.product.id) ?? 0}
                  onRemove={() => remove(line.key)}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Pago">
          <div
            id="sale-payment"
            role="group"
            aria-label="Método de pago"
            className="grid scroll-mt-24 grid-cols-2 gap-3"
          >
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
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--muted)]',
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
      </div>

      {/* Hija directa del formulario: `sticky` no sale de su contenedor, y así la
          barra acompaña todo el recorrido, también por la lista de productos. */}
      <CheckoutBar
        className="md:col-start-2"
        error={
          (formError || failure) && (
            <FormError>
              {/* El total lo calcula la API y no tiene campo propio en el formulario. */}
              {formError ??
                failure?.fieldErrors.total ??
                (failure ? failureMessage(failure, ERROR_MESSAGES) : null)}
            </FormError>
          )
        }
      >
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className={cn(CHECKOUT_BUTTON_CLASS, pending && CHECKOUT_PENDING_CLASS)}
        >
          {submitting ? 'Cobrando…' : (pending ?? `Cobrar ${formatCents(totalCents)}`)}
        </Button>
      </CheckoutBar>
    </form>
  );
}

function countLabel(count: number): string {
  return count === 1 ? '1 producto' : `${count} productos`;
}

function Section({
  id,
  title,
  className,
  children,
}: {
  id?: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn('flex scroll-mt-24 flex-col gap-3', className)}>
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function LineRow({
  line,
  error,
  onChange,
  onChooseUnit,
  consumed,
  onRemove,
}: {
  line: Line;
  error?: string;
  onChange: (patch: Partial<Pick<Line, 'quantity' | 'price'>>) => void;
  onChooseUnit: (saleUnit: SaleUnit) => void;
  /** Lo que descuenta todo el carrito de este producto, en su unidad de stock. */
  consumed: number;
  onRemove: () => void;
}) {
  const { product, saleUnit } = line;
  const quantity = parseQuantity(line.quantity);
  const price = parsePrice(line.price);
  const quantityId = `sale-qty-${line.key}`;
  const priceId = `sale-price-${line.key}`;
  const errorId = `sale-line-${line.key}-error`;
  const withUnits = hasSaleUnits(product);
  const stockUnit = shortUnit(product.unit);
  const quantityLabel = saleUnit ? `unidades de ${saleUnit.label}` : stockUnit;
  const priceRef = useRef<HTMLInputElement>(null);

  // Al elegir una presentación sin precio, el foco va al precio de esta venta.
  const saleUnitId = saleUnit?.id;
  useEffect(() => {
    if (saleUnitId && priceRef.current && priceRef.current.value === '') {
      priceRef.current.focus();
    }
  }, [saleUnitId]);

  return (
    <li
      id={`sale-line-${line.key}`}
      className="flex scroll-mt-24 flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium break-words">{product.name}</span>
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
      {withUnits && (
        <div className="flex flex-col gap-1.5">
          <span id={`${line.key}-units`} className="text-xs text-[var(--muted-foreground)]">
            ¿Cómo lo vendes?
          </span>
          <div role="group" aria-labelledby={`${line.key}-units`} className="flex flex-wrap gap-2">
            {product.saleUnits.map((unit) => (
              <Chip
                key={unit.id}
                selected={saleUnit?.id === unit.id}
                onClick={() => onChooseUnit(unit)}
                className="flex-col items-start gap-0 rounded-lg px-3 py-1 leading-tight"
              >
                <span>{unit.label}</span>
                <span className="text-xs font-normal opacity-80">
                  {formatQuantity(unit.factor)} {stockUnit}
                  {unit.salePrice ? ` · sugerido ${formatMoney(unit.salePrice)}` : ''}
                </span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      {saleUnit && (
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-md bg-[var(--muted)] px-3 py-2.5 text-sm">
          <dt className="font-semibold">Presentación:</dt>
          <dd>{saleUnit.label}</dd>
          <dt className="font-semibold">Cantidad:</dt>
          <dd>
            {quantity !== null
              ? `${formatQuantity(stockFor(quantity, saleUnit.factor))} ${stockUnit}`
              : '—'}
          </dd>
          <dt className="font-semibold">
            <label htmlFor={priceId}>
              Precio de venta{quantity !== null && quantity !== 1 ? ' (c/u)' : ''}:
            </label>
          </dt>
          <dd className="flex items-center gap-1.5">
            <span className="text-[var(--muted-foreground)]">S/</span>
            <Input
              ref={priceRef}
              id={priceId}
              inputMode="decimal"
              autoComplete="off"
              value={line.price}
              placeholder="0.00"
              onChange={(event) => onChange({ price: event.target.value })}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-11 w-28 text-right text-lg"
            />
          </dd>
        </dl>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={quantityId} className="text-xs text-[var(--muted-foreground)]">
            {saleUnit ? `Cuántas (${quantityLabel})` : `Cantidad (${quantityLabel})`}
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
        {!saleUnit && (
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
        )}
        {quantity !== null && quantity !== 1 && price !== null && (
          <div className="ml-auto flex flex-col items-end gap-1">
            <span className="text-xs text-[var(--muted-foreground)]">Subtotal</span>
            <span className="flex h-11 items-center font-semibold">
              {formatCents(subtotalCents(quantity, price))}
            </span>
          </div>
        )}
      </div>
      {hasContainer(product) && product.tracksStock && product.stock?.isCounted && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted-foreground)]">
            Quedaría en el {(product.containerLabel ?? 'envase').toLocaleLowerCase('es')}
          </span>
          <BucketGauge
            product={product}
            balance={Math.round((product.stock.balance - consumed) * 1000) / 1000}
            size="sm"
          />
        </div>
      )}
      {saleUnit && quantity !== null && product.tracksStock && !hasContainer(product) && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Descuenta {equivalenceLabel(stockFor(quantity, saleUnit.factor), product.unit)} del stock
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </li>
  );
}
