'use client';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatQuantity } from '@/lib/inventory/format';
import {
  receiptDateFormat,
  type LaterStockChoiceDraft,
  type LaterStockProduct,
} from '@/lib/inventory/receipts';

const CHECK_LABEL = { COUNT: 'Conteo', ADJUSTMENT: 'Ajuste' } as const;

/**
 * Recepción atrasada con conteos o ajustes posteriores (R8, DEC-96): por cada
 * producto, el usuario decide si la mercadería ya estaba en ese conteo. Nada
 * se guarda hasta que elige; si fija la cantidad del estante, la escribe él.
 */
export function LaterStockChecks({
  products,
  received,
  choices,
  errors,
  onChange,
}: {
  products: LaterStockProduct[];
  /** Cantidad que trae esta recepción por producto (texto del formulario). */
  received: Map<string, string>;
  choices: Record<string, LaterStockChoiceDraft>;
  errors: Record<string, string>;
  onChange: (productId: string, choice: LaterStockChoiceDraft) => void;
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3"
      aria-labelledby="later-stock-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="later-stock-title" className="font-sans text-base font-semibold">
          Hubo conteos después de esta fecha
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Después de la fecha de esta recepción se contó o ajustó el stock de estos productos.
          Indica, para cada uno, si la mercadería ya estaba en ese conteo. Todavía no se guardó
          nada.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {products.map((product) => {
          const choice = choices[product.productId] ?? { resolution: null, physical: '' };
          const name = `later-${product.productId}`;
          const qty = received.get(product.productId) ?? '';
          return (
            <li
              key={product.productId}
              className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium break-words">{product.name}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  Stock actual: {formatQuantity(product.balance)} {product.unit}
                </span>
                {product.checks.map((check) => (
                  <span key={check.movementId} className="text-xs text-[var(--muted-foreground)]">
                    {CHECK_LABEL[check.type]} del{' '}
                    {receiptDateFormat.format(new Date(check.occurredAt))}
                    {check.countedQuantity !== null &&
                      `: ${formatQuantity(check.countedQuantity)} ${product.unit}`}
                  </span>
                ))}
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Qué hacer con {product.name}</legend>
                <label className="flex min-h-11 items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={name}
                    className="mt-1 size-4"
                    checked={choice.resolution === 'ADD_TO_STOCK'}
                    onChange={() =>
                      onChange(product.productId, { resolution: 'ADD_TO_STOCK', physical: '' })
                    }
                  />
                  <span>
                    No estaba en ese conteo: sumar {qty} {product.unit} al stock
                  </span>
                </label>
                <label className="flex min-h-11 items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={name}
                    className="mt-1 size-4"
                    checked={choice.resolution === 'SET_PHYSICAL'}
                    onChange={() =>
                      onChange(product.productId, {
                        resolution: 'SET_PHYSICAL',
                        physical: choice.physical,
                      })
                    }
                  />
                  <span>Ya estaba contada: dejar el stock en lo que hay hoy en el estante</span>
                </label>
                {choice.resolution === 'SET_PHYSICAL' && (
                  <Field
                    id={`${name}-physical`}
                    label={`Cantidad en el estante (${product.unit})`}
                    error={errors[product.productId]}
                  >
                    <Input
                      id={`${name}-physical`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={choice.physical}
                      onChange={(e) =>
                        onChange(product.productId, {
                          resolution: 'SET_PHYSICAL',
                          physical: e.target.value,
                        })
                      }
                      aria-invalid={!!errors[product.productId] || undefined}
                      className="w-32"
                    />
                  </Field>
                )}
                {choice.resolution !== 'SET_PHYSICAL' && errors[product.productId] && (
                  <p role="alert" className="text-sm text-[var(--danger)]">
                    {errors[product.productId]}
                  </p>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
