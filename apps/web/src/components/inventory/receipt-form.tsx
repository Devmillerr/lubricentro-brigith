'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { StockHint } from '@/components/maintenance/product-picker';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatQuantity, parseQuantity, type ProductWithStock } from '@/lib/inventory/format';
import { parsePrice } from '@/lib/sales/format';
import { shortUnit } from '@/lib/products/container';
import {
  MAX_RECEIPT_LINES,
  MAX_RECEIPT_NOTE,
  MAX_RECEIPT_QUANTITY,
  RECEIPT_FUTURE_TOLERANCE_MS,
  laterStockProductsOf,
  localDateInputValue,
  localDateTimeInputValue,
  possibleDuplicateOf,
  productCountLabel,
  receiptDateFormat,
  stepQuantity,
  type InventoryReceipt,
  type LaterStockChoiceDraft,
  type LaterStockProduct,
  type PossibleDuplicate,
} from '@/lib/inventory/receipts';
import { LaterStockChecks } from './later-stock-checks';
import { ReceiptProductPicker } from './receipt-product-picker';
import {
  DEFAULT_TERM_DAYS,
  addDaysTo,
  formatAmount,
  formatDay,
  type Currency,
} from '@/lib/payables/format';
import { useSubmitLock } from '@/lib/use-submit-lock';

interface Line {
  product: ProductWithStock;
  quantity: string;
  /** Monto de la línea (no por unidad), opcional al contado (DEC-90). */
  cost: string;
}

type Errors = Partial<
  Record<
    | 'lines'
    | 'occurredAt'
    | 'note'
    | 'supplierId'
    | 'documentRef'
    | 'purchaseDate'
    | 'currency'
    | 'purchaseExchangeRate'
    | 'dueDate'
    | 'dueDateReason',
    string
  >
> & {
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
    SUPPLIER_INACTIVE: 'El proveedor está desactivado. Elige otro o reactívalo. No se guardó nada.',
    SUPPLIER_NOT_FOUND: 'El proveedor ya no existe. Elige otro. No se guardó nada.',
    DUPLICATE_DOCUMENT: 'Ese comprobante de este proveedor ya está registrado. No se guardó nada.',
    CREDIT_LINE_COST_REQUIRED:
      'En una compra al crédito cada producto lleva su monto: la deuda es la suma. No se guardó nada.',
    CREDIT_TOTAL_MUST_BE_POSITIVE:
      'Una compra al crédito debe tener un total mayor que 0. Si no hay nada que pagar, regístrala al contado.',
    PAYABLE_ALREADY_EXISTS: 'Esta recepción ya tiene una deuda.',
    LATER_STOCK_CHECKS_MISMATCH:
      'Mientras decidías, cambió la lista de productos con conteos posteriores. Revísala y vuelve a guardar. No se guardó nada.',
  },
  notFound: 'Uno de los productos ya no existe. Quítalo y vuelve a guardar. No se guardó nada.',
};

/**
 * Recibir (07-UI-UX.md §3.6, cambios de R3; BR-P6): varios productos en una
 * sola operación. `POST /inventory/receipts` guarda la cabecera y un
 * `PURCHASE_IN` por línea en una transacción: todo o nada. Los errores se
 * validan antes de enviar (líneas vacías, cantidades ≤ 0, repetidos). Lleva
 * `Idempotency-Key`: si falla la red y se reintenta sin cambios, no se duplica.
 *
 * Cada línea admite, opcional, su monto (DEC-90): con eso se
 * conoce cuánto se invirtió en la compra. Sin monto, se registra igual.
 *
 * Compras atrasadas (R8, DEC-96): no se acepta una fecha futura. Si después de
 * la fecha elegida hubo conteos o ajustes de algún producto, la API no guarda
 * nada y devuelve la lista; el usuario decide por producto y vuelve a guardar.
 * Si la recepción se parece mucho a otra reciente, se pide confirmarla.
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
    initialProducts.map((product) => ({ product, quantity: '1', cost: '' })),
  );
  const [occurredAt, setOccurredAt] = useState('');
  const [note, setNote] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [documentRef, setDocumentRef] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'CASH' | 'CREDIT'>('CASH');
  const [currency, setCurrency] = useState<Currency>('PEN');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [agreedDue, setAgreedDue] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [dueReason, setDueReason] = useState('');
  const credit = paymentTerms === 'CREDIT';
  // Fecha base del plazo: la de compra o, sin ella, la de recepción (hoy si no se eligió).
  const baseDate =
    purchaseDate || (occurredAt ? occurredAt.slice(0, 10) : localDateInputValue(new Date()));
  const defaultDue = addDaysTo(baseDate, DEFAULT_TERM_DAYS);
  const suppliers = useApiQuery('suppliers:active', () => callApi(api.GET('/suppliers')));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [laterProducts, setLaterProducts] = useState<LaterStockProduct[] | null>(null);
  const [choices, setChoices] = useState<Record<string, LaterStockChoiceDraft>>({});
  const [choiceErrors, setChoiceErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<PossibleDuplicate | null>(null);
  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = useState(false);
  const lock = useSubmitLock();
  const idempotency = useIdempotencyKey();

  /** La lista de conteos posteriores depende de los productos y de la fecha. */
  function resetLaterChecks() {
    setLaterProducts(null);
    setChoices({});
    setChoiceErrors({});
  }

  /** La similitud con otra recepción depende de productos, cantidades y fecha. */
  function resetDuplicate() {
    setDuplicate(null);
    setAcknowledgeDuplicate(false);
  }

  const quantities = new Map(lines.map((line) => [line.product.id, line.quantity]));

  function clearLineError(productId: string) {
    if (!errors.line?.[productId] && !errors.lines) return;
    const line = { ...errors.line };
    delete line[productId];
    setErrors({ ...errors, lines: undefined, line });
  }

  function addProduct(product: ProductWithStock) {
    clearLineError(product.id);
    resetLaterChecks();
    resetDuplicate();
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: stepQuantity(line.quantity, 1) }
            : line,
        );
      }
      return [...current, { product, quantity: '1', cost: '' }];
    });
  }

  function updateLine(productId: string, patch: Partial<Pick<Line, 'quantity' | 'cost'>>) {
    clearLineError(productId);
    if (patch.quantity !== undefined) resetDuplicate();
    setLines((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)),
    );
  }

  // Total de la compra: suma de las líneas con monto válido (vista previa; la API lo recalcula).
  const costCents = lines.reduce((sum, line) => {
    const cost = parsePrice(line.cost);
    return cost === null ? sum : sum + Math.round(cost * 100);
  }, 0);
  const linesWithCost = lines.filter((line) => parsePrice(line.cost) !== null).length;

  function removeLine(productId: string) {
    clearLineError(productId);
    resetLaterChecks();
    resetDuplicate();
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
    for (const { product, quantity, cost } of lines) {
      const parsed = parseQuantity(quantity);
      if (parsed === null || parsed <= 0) {
        line[product.id] = 'Cantidad mayor que 0 (hasta 3 decimales).';
      } else if (parsed > MAX_RECEIPT_QUANTITY) {
        line[product.id] = 'La cantidad es demasiado grande.';
      } else if (cost.trim() && parsePrice(cost) === null) {
        line[product.id] = 'Monto: 0 o más, con hasta 2 decimales.';
      }
      if (seen.has(product.id)) line[product.id] = 'Producto repetido.';
      seen.add(product.id);
    }
    if (Object.keys(line).length) found.line = line;
    if (occurredAt && Number.isNaN(new Date(occurredAt).getTime())) {
      found.occurredAt = 'Ingresa una fecha válida.';
    } else if (
      occurredAt &&
      new Date(occurredAt).getTime() > Date.now() + RECEIPT_FUTURE_TOLERANCE_MS
    ) {
      found.occurredAt = 'La fecha de recepción no puede ser futura.';
    }
    if (note.trim().length > MAX_RECEIPT_NOTE) {
      found.note = `La nota admite hasta ${MAX_RECEIPT_NOTE} caracteres.`;
    }
    if (documentRef.trim() && !supplierId) {
      found.documentRef = 'Elige el proveedor del comprobante.';
    }
    if (purchaseDate && purchaseDate > localDateInputValue(new Date())) {
      found.purchaseDate = 'La fecha de compra no puede ser futura.';
    }
    if (
      currency === 'USD' &&
      purchaseRate.trim() &&
      !/^\d+(\.\d{1,4})?$/.test(purchaseRate.trim())
    ) {
      found.purchaseExchangeRate = 'Tipo de cambio: un número con hasta 4 decimales (ej.: 3.7520).';
    } else if (currency === 'USD' && purchaseRate.trim() && Number(purchaseRate) <= 0) {
      found.purchaseExchangeRate = 'El tipo de cambio debe ser mayor que 0.';
    }
    if (credit) {
      if (!supplierId) found.supplierId = 'Elige el proveedor: la deuda es con él.';
      const missing = lines.filter((line) => parsePrice(line.cost) === null);
      if (missing.length > 0) {
        found.lines = 'En una compra al crédito escribe el monto de cada producto.';
      } else if (costCents <= 0) {
        found.lines = 'El total de una compra al crédito debe ser mayor que 0.';
      }
      if (agreedDue) {
        if (!dueDate) found.dueDate = 'Elige la fecha de vencimiento pactada.';
        else if (dueDate < baseDate)
          found.dueDate = 'El vencimiento no puede ser anterior a la fecha de compra.';
        if (dueReason.trim().length < 3)
          found.dueDateReason = 'Escribe por qué (por ejemplo, "45 días").';
      }
    }
    return found;
  }

  /** Una opción por producto listado; la cantidad del estante, válida y escrita por el usuario. */
  function validateChoices(): Record<string, string> {
    const found: Record<string, string> = {};
    for (const product of laterProducts ?? []) {
      const choice = choices[product.productId];
      if (!choice?.resolution) {
        found[product.productId] = 'Elige una opción para este producto.';
      } else if (choice.resolution === 'SET_PHYSICAL') {
        const parsed = parseQuantity(choice.physical);
        if (parsed === null || parsed < 0) {
          found[product.productId] =
            'Escribe la cantidad del estante (0 o más, hasta 3 decimales).';
        } else if (parsed > MAX_RECEIPT_QUANTITY) {
          found[product.productId] = 'La cantidad es demasiado grande.';
        }
      }
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    const foundChoices = validateChoices();
    setErrors(found);
    setChoiceErrors(foundChoices);
    setFailure(null);
    if (
      found.lines ||
      found.line ||
      found.occurredAt ||
      found.note ||
      found.documentRef ||
      found.purchaseDate ||
      found.supplierId ||
      found.purchaseExchangeRate ||
      found.dueDate ||
      found.dueDateReason
    ) {
      return;
    }
    if (Object.keys(foundChoices).length > 0) return;
    if (!lock.acquire()) return;
    setSubmitting(true);

    const body: Schemas['CreateReceiptDto'] = {
      lines: lines.map((line) => {
        const cost = parsePrice(line.cost);
        return {
          productId: line.product.id,
          quantity: parseQuantity(line.quantity)!,
          ...(cost !== null ? { purchaseCost: cost } : {}),
        };
      }),
    };
    if (occurredAt) body.occurredAt = new Date(occurredAt).toISOString();
    if (note.trim()) body.note = note.trim();
    if (supplierId) body.supplierId = supplierId;
    if (supplierId && documentRef.trim()) body.documentRef = documentRef.trim();
    if (purchaseDate) body.purchaseDate = purchaseDate;
    if (credit || currency === 'USD') body.currency = currency;
    if (currency === 'USD' && purchaseRate.trim())
      body.purchaseExchangeRate = Number(purchaseRate.trim());
    if (credit) {
      body.paymentTerms = 'CREDIT';
      if (agreedDue && dueDate && dueDate !== defaultDue) {
        body.dueDate = dueDate;
        body.dueDateReason = dueReason.trim();
      }
    }
    if (laterProducts) {
      body.laterStockChecks = laterProducts.map(({ productId }) => {
        const choice = choices[productId]!;
        return choice.resolution === 'SET_PHYSICAL'
          ? {
              productId,
              resolution: 'SET_PHYSICAL',
              physicalQuantity: parseQuantity(choice.physical)!,
            }
          : { productId, resolution: 'ADD_TO_STOCK' };
      });
    }
    if (duplicate && acknowledgeDuplicate) body.acknowledgePossibleDuplicate = true;

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

    const code = result.failure.code;
    if (code === 'LATER_STOCK_CHECKS_FOUND' || code === 'LATER_STOCK_CHECKS_MISMATCH') {
      const products = laterStockProductsOf(result.failure.data);
      if (products) {
        setLaterProducts(products);
        // Se conservan las elecciones de los productos que siguen en la lista.
        setChoices((current) =>
          Object.fromEntries(
            products
              .filter((p) => current[p.productId])
              .map((p) => [p.productId, current[p.productId]!]),
          ),
        );
        if (code === 'LATER_STOCK_CHECKS_FOUND') return;
      }
    }
    if (code === 'POSSIBLE_DUPLICATE_RECEIPT') {
      const found = possibleDuplicateOf(result.failure.data);
      if (found) {
        setDuplicate(found);
        setAcknowledgeDuplicate(false);
        return;
      }
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
      supplierId: apiErrors.supplierId,
      documentRef: apiErrors.documentRef,
      purchaseDate: apiErrors.purchaseDate,
      currency: apiErrors.currency,
      purchaseExchangeRate: apiErrors.purchaseExchangeRate,
      dueDate: apiErrors.dueDate,
      dueDateReason: apiErrors.dueDateReason,
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
                  currency={currency}
                  line={line}
                  error={errors.line?.[line.product.id]}
                  onChange={(patch) => updateLine(line.product.id, patch)}
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
          {lines.length > 0 && (
            <div className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  {credit ? 'Total de la compra' : 'Total pagado'}
                </span>
                <span className="text-xl font-semibold">
                  {linesWithCost > 0 ? formatAmount(costCents / 100, currency) : '—'}
                </span>
              </div>
              {linesWithCost < lines.length && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {linesWithCost === 0
                    ? credit
                      ? 'Escribe el monto de cada producto: la deuda es la suma.'
                      : 'Opcional: escribe cuánto pagaste por cada producto para saber cuánto invertiste.'
                    : `${lines.length - linesWithCost} sin monto: no se suman al total.`}
                </p>
              )}
            </div>
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
              max={localDateTimeInputValue(new Date())}
              onChange={(e) => {
                setOccurredAt(e.target.value);
                resetLaterChecks();
                resetDuplicate();
              }}
              aria-invalid={!!errors.occurredAt || undefined}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Condición de pago</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['CASH', 'CREDIT'] as const).map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm has-[:checked]:border-[var(--primary)]"
                >
                  <input
                    type="radio"
                    name="payment-terms"
                    className="size-4"
                    checked={paymentTerms === value}
                    onChange={() => setPaymentTerms(value)}
                  />
                  {value === 'CASH' ? 'Al contado' : 'Al crédito'}
                </label>
              ))}
            </div>
            {credit && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Se registra la deuda con el proveedor por el total de esta compra.
              </p>
            )}
          </fieldset>
          <Field id="receipt-currency" label="Moneda" error={errors.currency}>
            <Select
              id="receipt-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="PEN">Soles (S/)</option>
              <option value="USD">Dólares (US$)</option>
            </Select>
          </Field>
          {currency === 'USD' && (
            <Field
              id="receipt-rate"
              label="Tipo de cambio de la compra"
              optional
              hint="Soles por 1 dólar el día de la compra. Sirve para comparar con lo que pagues después."
              error={errors.purchaseExchangeRate}
            >
              <Input
                id="receipt-rate"
                inputMode="decimal"
                autoComplete="off"
                value={purchaseRate}
                onChange={(e) => setPurchaseRate(e.target.value)}
                placeholder="Ej.: 3.7520"
                className="w-40"
                aria-invalid={!!errors.purchaseExchangeRate || undefined}
              />
            </Field>
          )}
          <Field
            id="receipt-supplier"
            label="Proveedor"
            optional
            hint="Para saber a quién le compraste y, si es al crédito, cuánto le debes."
            error={errors.supplierId}
          >
            <Select
              id="receipt-supplier"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                if (!e.target.value) setDocumentRef('');
                resetDuplicate();
              }}
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
          {suppliers.status === 'success' && suppliers.data.length === 0 && (
            <p className="text-xs text-[var(--muted-foreground)]">
              No hay proveedores todavía.{' '}
              <Link href="/proveedores" className="font-medium underline underline-offset-2">
                Agregar proveedores
              </Link>
            </p>
          )}
          {supplierId && (
            <Field
              id="receipt-document"
              label="N.º de comprobante"
              optional
              hint="Factura, boleta o guía. Evita registrar la misma compra dos veces."
              error={errors.documentRef}
            >
              <Input
                id="receipt-document"
                value={documentRef}
                onChange={(e) => {
                  setDocumentRef(e.target.value);
                  resetDuplicate();
                }}
                maxLength={40}
                autoComplete="off"
                placeholder="Ej.: F001-000123"
                aria-invalid={!!errors.documentRef || undefined}
              />
            </Field>
          )}
          <Field
            id="receipt-purchase-date"
            label="Fecha de compra"
            optional
            hint="La del comprobante. Si la dejas vacía, vale la fecha de recepción."
            error={errors.purchaseDate}
          >
            <Input
              id="receipt-purchase-date"
              type="date"
              value={purchaseDate}
              max={localDateInputValue(new Date())}
              onChange={(e) => setPurchaseDate(e.target.value)}
              aria-invalid={!!errors.purchaseDate || undefined}
            />
          </Field>
          {credit && (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
              <p>
                Vence el <strong>{formatDay(agreedDue && dueDate ? dueDate : defaultDue)}</strong>
                {!agreedDue && ` (${DEFAULT_TERM_DAYS} días desde la fecha de compra)`}
              </p>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={agreedDue}
                  onChange={(e) => setAgreedDue(e.target.checked)}
                />
                El proveedor dio otra fecha de vencimiento
              </label>
              {agreedDue && (
                <>
                  <Field
                    id="receipt-due"
                    label="Fecha de vencimiento pactada"
                    error={errors.dueDate}
                  >
                    <Input
                      id="receipt-due"
                      type="date"
                      value={dueDate}
                      min={baseDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      aria-invalid={!!errors.dueDate || undefined}
                    />
                  </Field>
                  <Field id="receipt-due-reason" label="Motivo" error={errors.dueDateReason}>
                    <Input
                      id="receipt-due-reason"
                      value={dueReason}
                      onChange={(e) => setDueReason(e.target.value)}
                      maxLength={500}
                      placeholder="Ej.: 45 días de crédito"
                      aria-invalid={!!errors.dueDateReason || undefined}
                    />
                  </Field>
                </>
              )}
            </div>
          )}
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

        {laterProducts && (
          <LaterStockChecks
            products={laterProducts}
            received={quantities}
            choices={choices}
            errors={choiceErrors}
            onChange={(productId, choice) => {
              setChoices((current) => ({ ...current, [productId]: choice }));
              setChoiceErrors((current) => {
                const next = { ...current };
                delete next[productId];
                return next;
              });
            }}
          />
        )}

        {duplicate && (
          <section
            className="flex flex-col gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3"
            aria-labelledby="duplicate-title"
          >
            <h3 id="duplicate-title" className="text-base font-semibold">
              ¿Ya registraste esta compra?
            </h3>
            <p className="text-sm">
              Hay otra recepción con los mismos productos y cantidades del{' '}
              {receiptDateFormat.format(new Date(duplicate.occurredAt))}. Todavía no se guardó nada.
            </p>
            <Link
              href={`/inventario/recepciones/${duplicate.receiptId}`}
              target="_blank"
              rel="noopener"
              className="text-sm font-medium underline underline-offset-2"
            >
              Ver esa recepción (se abre en otra pestaña)
            </Link>
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={acknowledgeDuplicate}
                onChange={(e) => setAcknowledgeDuplicate(e.target.checked)}
              />
              <span>Es otra compra distinta: registrarla igual</span>
            </label>
          </section>
        )}

        {failure && <FormError>{failureMessage(failure, ERROR_MESSAGES)}</FormError>}

        <Button
          type="submit"
          size="lg"
          disabled={submitting || (!!duplicate && !acknowledgeDuplicate)}
        >
          {submitting
            ? 'Guardando…'
            : laterProducts
              ? 'Guardar con estas indicaciones'
              : 'Guardar recepción'}
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
  currency,
  error,
  onChange,
  onRemove,
}: {
  line: Line;
  currency: Currency;
  error?: string;
  onChange: (patch: Partial<Pick<Line, 'quantity' | 'cost'>>) => void;
  onRemove: () => void;
}) {
  const { product } = line;
  const parsed = parseQuantity(line.quantity);
  const inputId = `receipt-line-${product.id}`;
  const costId = `receipt-cost-${product.id}`;
  const onQuantity = (quantity: string) => onChange({ quantity });
  // Atajos para recibir por envase o forma (p. ej. +1 Balde = +20 litros): la
  // cantidad va en la unidad de stock. Con envase (DEC-93) se usa su capacidad.
  const bigUnits = product.containerCapacity
    ? [
        {
          id: 'container',
          label: product.containerLabel ?? 'Envase',
          factor: product.containerCapacity,
        },
      ]
    : product.saleUnits.filter((unit) => Number(unit.factor) > 1);

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
      {bigUnits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {bigUnits.map((unit) => (
            <Button
              key={unit.id}
              type="button"
              variant="outline"
              className="h-10 px-3 text-sm"
              onClick={() => {
                const current = parsed ?? 0;
                // Si solo está el 1 inicial, el primer balde reemplaza ese 1.
                const base = line.quantity === '1' ? 0 : current;
                onQuantity(String(Math.round((base + Number(unit.factor)) * 1000) / 1000));
              }}
            >
              <Plus className="mr-1 size-4" aria-hidden />1 {unit.label} (
              {formatQuantity(unit.factor)} {shortUnit(product.unit)})
            </Button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={costId} className="text-sm text-[var(--muted-foreground)]">
          {currency === 'USD' ? 'Total US$' : 'Total S/'}
        </label>
        <Input
          id={costId}
          inputMode="decimal"
          autoComplete="off"
          value={line.cost}
          placeholder="Opcional"
          onChange={(e) => onChange({ cost: e.target.value })}
          className="w-32 text-right"
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </li>
  );
}
