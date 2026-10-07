'use client';

import { Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { parseQuantity } from '@/lib/inventory/format';
import type { Product } from '@/lib/products/format';
import { rememberProducts } from '@/lib/products/product-lookup';
import {
  equivalenceLabel,
  isValidUnit,
  saleUnitPresets,
  type SaleUnit,
} from '@/lib/products/units';
import { formatMoney, parsePrice, priceInput } from '@/lib/sales/format';

interface Row {
  key: string;
  id?: string;
  label: string;
  factor: string;
  price: string;
}

type RowErrors = Record<string, Partial<Record<'label' | 'factor' | 'price', string>>>;

const MAX_UNITS = 20;

let rowCounter = 0;
function newKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

function toRows(units: SaleUnit[]): Row[] {
  return units.map((unit) => ({
    key: unit.id,
    id: unit.id,
    label: unit.label,
    factor: String(Number(unit.factor)),
    price: priceInput(unit.salePrice),
  }));
}

/**
 * Formas de venta del producto (DEC-91), en su ficha: cómo se vende (octavo,
 * cuarto, galón, balde…) y a qué precio cada una. El stock se sigue contando
 * en la unidad del producto; cada forma dice cuánto de esa unidad descuenta
 * (un octavo = 0.125 galón; un balde, su capacidad). Opcional: sin formas, el
 * producto se vende en su propia unidad, como siempre. Se guarda todo junto
 * con `PUT /products/{id}/sale-units`; quitar una forma la desactiva, sin
 * tocar las ventas pasadas.
 */
export function SaleUnitsSection({
  product,
  onSaved,
}: {
  product: Product;
  onSaved: (product: Product) => void;
}) {
  const [editing, setEditing] = useState(false);
  const units = product.saleUnits;
  const unitIsValid = isValidUnit(product.unit);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="sale-units-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="sale-units-title" className="text-lg font-bold">
          Formas de venta
        </h3>
        {!editing && unitIsValid && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {units.length ? (
              <Pencil className="mr-1 size-4" aria-hidden />
            ) : (
              <Plus className="mr-1 size-4" aria-hidden />
            )}
            {units.length ? 'Editar' : 'Configurar'}
          </Button>
        )}
      </div>

      {!unitIsValid ? (
        <p className="rounded-md border border-[var(--accent)]/60 bg-[var(--accent-soft)] px-3 py-2 text-sm">
          Para venderlo por octavo, cuarto, galón o balde, primero elige su unidad de stock (la
          registrada es «{product.unit}»).{' '}
          <Link href={`/productos/${product.id}/editar`} className="font-semibold underline">
            Editar producto
          </Link>
        </p>
      ) : editing ? (
        <SaleUnitsEditor
          product={product}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            onSaved(saved);
          }}
        />
      ) : units.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--muted-foreground)]">
          Se vende por {product.unit}, al precio de venta del producto. Si también lo vendes por
          partes o por balde (octavo, cuarto, galón…), configúralo aquí con el precio de cada uno.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {units.map((unit) => (
            <li key={unit.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <Scale className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold break-words">{unit.label}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  Descuenta {equivalenceLabel(unit.factor, product.unit)}
                </span>
              </span>
              <span
                className={
                  unit.salePrice ? 'font-semibold' : 'text-sm text-[var(--muted-foreground)]'
                }
              >
                {unit.salePrice ? `Sugerido ${formatMoney(unit.salePrice)}` : 'Precio al vender'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SaleUnitsEditor({
  product,
  onCancel,
  onSaved,
}: {
  product: Product;
  onCancel: () => void;
  onSaved: (product: Product) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(product.saleUnits));
  const [errors, setErrors] = useState<RowErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const presets = saleUnitPresets(product.unit);
  const usedLabels = new Set(rows.map((row) => row.label.trim().toLocaleLowerCase('es')));

  function addRow(label = '', factor = '') {
    setRows((current) => [...current, { key: newKey(), label, factor, price: '' }]);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setErrors((current) => ({ ...current, [key]: {} }));
  }

  function validate(): RowErrors {
    const found: RowErrors = {};
    const seen = new Set<string>();
    for (const row of rows) {
      const rowErrors: RowErrors[string] = {};
      const label = row.label.trim();
      const key = label.toLocaleLowerCase('es');
      if (!label) rowErrors.label = 'Escribe el nombre.';
      else if (seen.has(key)) rowErrors.label = 'Nombre repetido.';
      seen.add(key);
      const factor = parseQuantity(row.factor);
      if (factor === null || factor <= 0) {
        rowErrors.factor = `¿Cuántos ${product.unit} descuenta? Mayor que 0, hasta 3 decimales.`;
      }
      if (row.price.trim() && parsePrice(row.price) === null) {
        rowErrors.price = 'Precio de 0 o más, con hasta 2 decimales.';
      }
      if (Object.keys(rowErrors).length) found[row.key] = rowErrors;
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    const result = await callApi(
      api.PUT('/products/{id}/sale-units', {
        params: { path: { id: product.id } },
        body: {
          units: rows.map((row) => ({
            ...(row.id ? { id: row.id } : {}),
            label: row.label.trim(),
            factor: parseQuantity(row.factor)!,
            salePrice: row.price.trim() ? parsePrice(row.price)! : null,
          })),
        },
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setFailure(
        failureMessage(result.failure, {
          notFound: 'Este producto ya no existe.',
          byCode: {
            SALE_UNIT_ALREADY_EXISTS: 'Hay dos formas con el mismo nombre.',
            PRODUCT_UNIT_INVALID: 'Primero elige la unidad de stock del producto.',
          },
        }),
      );
      return;
    }
    rememberProducts([result.data]);
    onSaved(result.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        El stock se cuenta en <strong className="font-semibold">{product.unit}</strong>. Para cada
        forma, indica cuánto descuenta. El precio se escribe en cada venta; si pones uno aquí, solo
        se propone y se puede cambiar.
      </p>

      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-4 text-center text-sm text-[var(--muted-foreground)]">
          Sin formas de venta: se vende solo por {product.unit}.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const rowErrors = errors[row.key] ?? {};
          const isBucket = row.label.trim().toLocaleLowerCase('es') === 'balde';
          return (
            <li
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs text-[var(--muted-foreground)]">Forma</span>
                  <Input
                    value={row.label}
                    onChange={(e) => updateRow(row.key, { label: e.target.value })}
                    maxLength={50}
                    placeholder="Ej.: Octavo"
                    autoComplete="off"
                    aria-invalid={!!rowErrors.label || undefined}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12 shrink-0 px-0"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  aria-label={`Quitar ${row.label || 'forma'}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {isBucket ? `Capacidad (${product.unit})` : `Descuenta (${product.unit})`}
                  </span>
                  <Input
                    inputMode="decimal"
                    value={row.factor}
                    onChange={(e) => updateRow(row.key, { factor: e.target.value })}
                    placeholder={isBucket ? 'Ej.: 5' : 'Ej.: 0.125'}
                    autoComplete="off"
                    aria-invalid={!!rowErrors.factor || undefined}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Precio sugerido (opcional)
                  </span>
                  <Input
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) => updateRow(row.key, { price: e.target.value })}
                    placeholder="Sin precio"
                    autoComplete="off"
                    aria-invalid={!!rowErrors.price || undefined}
                  />
                </label>
              </div>
              {(rowErrors.label || rowErrors.factor || rowErrors.price) && (
                <p role="alert" className="text-sm font-medium text-[var(--danger)]">
                  {rowErrors.label ?? rowErrors.factor ?? rowErrors.price}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length < MAX_UNITS && (
        <div className="flex flex-wrap gap-2">
          {presets
            .filter((preset) => !usedLabels.has(preset.label.toLocaleLowerCase('es')))
            .map((preset) => (
              <Chip key={preset.label} onClick={() => addRow(preset.label, preset.factor)}>
                <Plus className="size-4" aria-hidden />
                {preset.label}
              </Chip>
            ))}
          <Chip onClick={() => addRow()}>
            <Plus className="size-4" aria-hidden />
            Otra forma
          </Chip>
        </div>
      )}

      {failure && <FormError>{failure}</FormError>}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar formas de venta'}
        </Button>
        <button
          type="button"
          className={buttonVariants({ variant: 'outline' })}
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
