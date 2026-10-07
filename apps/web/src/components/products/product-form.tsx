'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatPrice, type Product, type ProductCategory } from '@/lib/products/format';
import { rememberProducts } from '@/lib/products/product-lookup';
import { AttributePicker } from './attribute-picker';
import { CategoryPicker } from './category-picker';
import { NewCategoryForm } from './new-category-form';
import { UnitPicker } from './unit-picker';
import { isValidUnit, UNIT_ERROR, UNIT_SUGGESTIONS } from '@/lib/products/units';
import { parseQuantity } from '@/lib/inventory/format';
import { useSubmitLock } from '@/lib/use-submit-lock';

type Values = {
  name: string;
  brand: string;
  code: string;
  viscosity: string;
  presentation: string;
  unit: string;
  categoryId: string;
  salePrice: string;
  tracksStock: boolean;
  /** Envase abierto (DEC-93): nombre y capacidad, juntos u omitidos. */
  hasContainer: boolean;
  containerLabel: string;
  containerCapacity: string;
};
type FieldErrors = Partial<Record<keyof Values, string>>;

/** Campos opcionales de texto: vacío al editar = `null` (vuelve a quedar pendiente). */
const OPTIONAL_TEXT = ['brand', 'code', 'viscosity', 'presentation'] as const;

/** `salePrice` es Decimal(10,2) en la base. */
const MAX_PRICE = 99_999_999.99;

/**
 * Alta y edición de producto (R2). Solo nombre y unidad son obligatorios; la
 * unidad se elige de una lista (unidad, galón, litro y las que ya usa el
 * catálogo) o se escribe otra, pero nunca es un número (DEC-92). Un producto
 * antiguo con una unidad inválida (p. ej. "0") se puede seguir editando sin
 * corregirla: solo se avisa y no se envía hasta que se elija otra.
 * Categoría, marca, viscosidad y presentación se eligen con chips (valores ya
 * usados y confirmados por el dueño); código y precio son opcionales y, al
 * editar, se pueden borrar para dejarlos pendientes (BR-P19b). No hay imagen
 * todavía (DEC-34). El código, si se envía, es único por negocio (409
 * `PRODUCT_CODE_ALREADY_EXISTS`).
 */
export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    code: product?.code ?? '',
    viscosity: product?.viscosity ?? '',
    presentation: product?.presentation ?? '',
    unit: product?.unit ?? '',
    categoryId: product?.categoryId ?? '',
    salePrice: formatPrice(product?.salePrice ?? null) ?? '',
    tracksStock: product?.tracksStock ?? true,
    hasContainer: Boolean(product?.containerCapacity),
    containerLabel: product?.containerLabel ?? '',
    containerCapacity: product?.containerCapacity ? String(Number(product.containerCapacity)) : '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();
  const [createdCategories, setCreatedCategories] = useState<ProductCategory[]>([]);

  const categoriesQuery = useApiQuery('product-categories', () =>
    callApi(api.GET('/product-categories')),
  );
  const categories: ProductCategory[] = [
    ...(categoriesQuery.status === 'success' ? categoriesQuery.data : []),
    ...createdCategories.filter(
      (created) =>
        categoriesQuery.status !== 'success' ||
        !categoriesQuery.data.some((category) => category.id === created.id),
    ),
  ];

  // Sugerencias de la categoría de primer nivel elegida (o de todo el catálogo).
  const selectedCategory = categories.find((category) => category.id === values.categoryId);
  const facetCategoryId = selectedCategory?.parentId ?? selectedCategory?.id ?? '';
  const facets = useApiQuery(`product-facets:${facetCategoryId}`, () =>
    callApi(
      api.GET('/products/facets', {
        params: { query: facetCategoryId ? { categoryId: facetCategoryId } : {} },
      }),
    ),
  );

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!values.name.trim()) found.name = 'Ingresa el nombre del producto.';
    const unitUnchanged = product !== undefined && values.unit.trim() === product.unit;
    if (!values.unit.trim()) found.unit = 'Elige la unidad en la que se cuenta.';
    else if (!unitUnchanged && !isValidUnit(values.unit)) found.unit = UNIT_ERROR;
    const price = values.salePrice.trim().replace(',', '.');
    if (price) {
      const parsed = Number(price);
      if (!Number.isFinite(parsed) || parsed < 0) {
        found.salePrice = 'Ingresa un precio válido, mayor o igual a 0.';
      } else if (parsed > MAX_PRICE) {
        found.salePrice = 'El precio máximo es S/ 99,999,999.99.';
      } else if (!/^\d+(\.\d{1,2})?$/.test(price)) {
        found.salePrice = 'Usa como máximo 2 decimales.';
      }
    }
    if (values.hasContainer) {
      if (!values.containerLabel.trim()) found.containerLabel = 'Escribe el nombre del envase.';
      const capacity = parseQuantity(values.containerCapacity);
      if (capacity === null || capacity <= 0) {
        found.containerCapacity = 'Capacidad mayor que 0, con hasta 3 decimales.';
      }
      if (!isValidUnit(values.unit)) found.unit = UNIT_ERROR;
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (Object.values(found).some(Boolean)) return;
    if (!lock.acquire()) return;
    setSubmitting(true);

    const price = values.salePrice.trim() ? Number(values.salePrice.replace(',', '.')) : null;
    const containerCapacity = values.hasContainer ? parseQuantity(values.containerCapacity) : null;
    const containerLabel = values.hasContainer ? values.containerLabel.trim() : null;
    let result;
    if (product) {
      const body: Schemas['UpdateProductDto'] = {};
      if (values.name.trim() !== product.name) body.name = values.name.trim();
      if (values.unit.trim() !== product.unit) body.unit = values.unit.trim();
      for (const field of OPTIONAL_TEXT) {
        const next = values[field].trim() || null;
        if (next !== (product[field] ?? null)) body[field] = next;
      }
      if ((values.categoryId || null) !== product.categoryId) {
        body.categoryId = values.categoryId || null;
      }
      if (price !== (product.salePrice === null ? null : Number(product.salePrice))) {
        body.salePrice = price;
      }
      if (values.tracksStock !== product.tracksStock) body.tracksStock = values.tracksStock;
      const currentCapacity =
        product.containerCapacity === null ? null : Number(product.containerCapacity);
      if (
        containerCapacity !== currentCapacity ||
        containerLabel !== (product.containerLabel ?? null)
      ) {
        body.containerCapacity = containerCapacity;
        body.containerLabel = containerLabel;
      }
      if (Object.keys(body).length === 0) {
        router.push(`/productos/${product.id}`);
        return;
      }
      result = await callApi(
        api.PATCH('/products/{id}', { params: { path: { id: product.id } }, body }),
      );
    } else {
      const body: Schemas['CreateProductDto'] = {
        name: values.name.trim(),
        unit: values.unit.trim(),
        tracksStock: values.tracksStock,
      };
      for (const field of OPTIONAL_TEXT) {
        if (values[field].trim()) body[field] = values[field].trim();
      }
      if (values.categoryId) body.categoryId = values.categoryId;
      if (price !== null) body.salePrice = price;
      if (containerCapacity !== null && containerLabel) {
        body.containerCapacity = containerCapacity;
        body.containerLabel = containerLabel;
      }
      result = await callApi(api.POST('/products', { body }));
    }

    if (result.ok) {
      rememberProducts([result.data]);
      router.push(`/productos/${result.data.id}`);
      return;
    }
    const apiErrors = result.failure.fieldErrors;
    const codeTaken = result.failure.code === 'PRODUCT_CODE_ALREADY_EXISTS';
    setErrors({
      name: apiErrors.name,
      brand: apiErrors.brand,
      code: codeTaken ? 'Ya hay un producto con este código.' : apiErrors.code,
      viscosity: apiErrors.viscosity,
      presentation: apiErrors.presentation,
      unit: apiErrors.unit,
      categoryId: apiErrors.categoryId,
      salePrice: apiErrors.salePrice,
      containerLabel: apiErrors.containerLabel,
      containerCapacity: apiErrors.containerCapacity,
    });
    if (!codeTaken) setFailure(result.failure);
    lock.release();
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {failure && (
        <FormError>
          {failureMessage(failure, {
            notFound: 'Este producto ya no existe.',
            byCode: { INVALID_REFERENCE: 'La categoría elegida ya no existe o está desactivada.' },
          })}
        </FormError>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">
          Categoría
          <span className="ml-1 font-normal text-[var(--muted-foreground)]">(opcional)</span>
        </p>
        {categoriesQuery.status === 'loading' && (
          <p className="text-sm text-[var(--muted-foreground)]">Cargando categorías…</p>
        )}
        {categoriesQuery.status === 'error' && (
          <Button type="button" variant="outline" onClick={categoriesQuery.reload}>
            Reintentar cargar categorías
          </Button>
        )}
        {categoriesQuery.status === 'success' && (
          <CategoryPicker
            categories={categories}
            value={values.categoryId}
            onChange={(categoryId) => update('categoryId', categoryId)}
          />
        )}
        {errors.categoryId && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {errors.categoryId}
          </p>
        )}
      </div>
      {categoriesQuery.status === 'success' && (
        <NewCategoryForm
          categories={categories}
          onCreated={(category) => {
            setCreatedCategories((current) => [...current, category]);
            update('categoryId', category.id);
          }}
        />
      )}

      <Field id="name" label="Nombre" error={errors.name}>
        <Input
          id="name"
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          maxLength={200}
          autoComplete="off"
          required
          aria-invalid={!!errors.name || undefined}
        />
      </Field>

      {facets.status === 'success' ? (
        // `key`: si cambia la categoría, los chips se rearman con sus valores.
        <div key={facetCategoryId} className="flex flex-col gap-4">
          <AttributePicker
            id="brand"
            label="Marca"
            value={values.brand}
            options={facets.data.brands}
            maxLength={100}
            onChange={(value) => update('brand', value)}
          />
          <AttributePicker
            id="viscosity"
            label="Viscosidad"
            value={values.viscosity}
            options={facets.data.viscosities}
            maxLength={50}
            onChange={(value) => update('viscosity', value)}
          />
          <AttributePicker
            id="presentation"
            label="Presentación"
            value={values.presentation}
            options={facets.data.presentations}
            maxLength={50}
            onChange={(value) => update('presentation', value)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Sin sugerencias (cargando o error): se puede escribir igual. */}
          <Field id="brand" label="Marca" optional error={errors.brand}>
            <Input
              id="brand"
              value={values.brand}
              onChange={(e) => update('brand', e.target.value)}
              maxLength={100}
              autoComplete="off"
            />
          </Field>
          <Field id="viscosity" label="Viscosidad" optional error={errors.viscosity}>
            <Input
              id="viscosity"
              value={values.viscosity}
              onChange={(e) => update('viscosity', e.target.value)}
              maxLength={50}
              autoComplete="off"
            />
          </Field>
          <Field id="presentation" label="Presentación" optional error={errors.presentation}>
            <Input
              id="presentation"
              value={values.presentation}
              onChange={(e) => update('presentation', e.target.value)}
              maxLength={50}
              autoComplete="off"
            />
          </Field>
        </div>
      )}

      <UnitPicker
        value={values.unit}
        options={
          facets.status === 'success'
            ? facets.data.units.map((option) => option.value)
            : UNIT_SUGGESTIONS
        }
        error={errors.unit}
        storedInvalid={product && !isValidUnit(product.unit) ? product.unit : null}
        onChange={(value) => update('unit', value)}
      />

      <div className="flex flex-col gap-3">
        <Field id="code" label="Código" optional error={errors.code}>
          <Input
            id="code"
            value={values.code}
            onChange={(e) => update('code', e.target.value)}
            maxLength={50}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!errors.code || undefined}
          />
        </Field>
      </div>

      <Field
        id="salePrice"
        label="Precio de venta"
        optional
        hint="Déjalo vacío si todavía no lo defines: queda como pendiente."
        error={errors.salePrice}
      >
        <Input
          id="salePrice"
          type="text"
          inputMode="decimal"
          value={values.salePrice}
          onChange={(e) => update('salePrice', e.target.value)}
          autoComplete="off"
          aria-invalid={!!errors.salePrice || undefined}
        />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-[var(--border)] p-3">
        <legend className="sr-only">Envase abierto</legend>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={values.hasContainer}
            onChange={(e) => update('hasContainer', e.target.checked)}
            className="mt-0.5 size-5 shrink-0"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Se vende de un envase abierto</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              Por ejemplo, un balde del que se vende por partes. Se muestra cuánto queda.
            </span>
          </span>
        </label>
        {values.hasContainer && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="containerLabel" label="Envase" error={errors.containerLabel}>
              <Input
                id="containerLabel"
                value={values.containerLabel}
                onChange={(e) => update('containerLabel', e.target.value)}
                maxLength={30}
                placeholder="Ej.: Balde"
                autoComplete="off"
                aria-invalid={!!errors.containerLabel || undefined}
              />
            </Field>
            <Field
              id="containerCapacity"
              label={`Capacidad (${values.unit.trim() || 'unidad'})`}
              error={errors.containerCapacity}
            >
              <Input
                id="containerCapacity"
                inputMode="decimal"
                value={values.containerCapacity}
                onChange={(e) => update('containerCapacity', e.target.value)}
                placeholder="Ej.: 20"
                autoComplete="off"
                aria-invalid={!!errors.containerCapacity || undefined}
              />
            </Field>
          </div>
        )}
      </fieldset>

      <label className="flex min-h-11 items-start gap-3 rounded-md border border-[var(--border)] p-3">
        <input
          type="checkbox"
          checked={values.tracksStock}
          onChange={(e) => update('tracksStock', e.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Controlar stock</span>
          <span className="text-xs text-[var(--muted-foreground)]">
            Si está marcado, cada uso en un mantenimiento descuenta del inventario.
          </span>
        </span>
      </label>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
      </Button>
    </form>
  );
}
