'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { formatPrice, type Product, type ProductCategory } from '@/lib/products/format';
import { rememberProducts } from '@/lib/products/product-lookup';
import { NewCategoryForm } from './new-category-form';

type Values = {
  name: string;
  brand: string;
  code: string;
  unit: string;
  categoryId: string;
  salePrice: string;
  tracksStock: boolean;
};
type FieldErrors = Partial<Record<keyof Values, string>>;

/** `salePrice` es Decimal(10,2) en la base. */
const MAX_PRICE = 99_999_999.99;

/**
 * Alta y edición de producto (C2). Nombre y unidad son obligatorios; la
 * unidad es texto libre porque su vocabulario sigue pendiente (DEC-22, P-07).
 * El precio es opcional y no se asume moneda (BR-P17). Por defecto controla
 * stock (BR-P16). El código, si se envía, es único por negocio (409
 * `PRODUCT_CODE_ALREADY_EXISTS`). Al editar, código, categoría y precio no se
 * pueden quitar (la API no acepta null; un código vacío chocaría con otros),
 * solo cambiar.
 */
export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    code: product?.code ?? '',
    unit: product?.unit ?? '',
    categoryId: product?.categoryId ?? '',
    salePrice: formatPrice(product?.salePrice ?? null) ?? '',
    tracksStock: product?.tracksStock ?? true,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdCategories, setCreatedCategories] = useState<ProductCategory[]>([]);

  const categoriesQuery = useApiQuery('product-categories', () =>
    callApi(api.GET('/product-categories')),
  );
  const categories = [
    ...(categoriesQuery.status === 'success' ? categoriesQuery.data : []),
    ...createdCategories.filter(
      (created) =>
        categoriesQuery.status !== 'success' ||
        !categoriesQuery.data.some((category) => category.id === created.id),
    ),
  ];

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!values.name.trim()) found.name = 'Ingresa el nombre del producto.';
    if (!values.unit.trim()) found.unit = 'Ingresa la unidad en la que se cuenta.';
    if (!values.code.trim() && product?.code) {
      found.code = 'El código registrado no se puede quitar, solo cambiar.';
    }
    const price = values.salePrice.trim().replace(',', '.');
    if (price) {
      const parsed = Number(price);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_PRICE) {
        found.salePrice = 'Ingresa un precio válido, mayor o igual a 0.';
      } else if (!/^\d+(\.\d{1,2})?$/.test(price)) {
        found.salePrice = 'Usa como máximo 2 decimales.';
      }
    } else if (product?.salePrice != null) {
      found.salePrice = 'El precio registrado no se puede quitar, solo cambiar.';
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
    setSubmitting(true);

    const price = values.salePrice.trim() ? Number(values.salePrice.replace(',', '.')) : undefined;
    let result;
    if (product) {
      const body: Schemas['UpdateProductDto'] = {};
      if (values.name.trim() !== product.name) body.name = values.name.trim();
      if (values.brand.trim() !== (product.brand ?? '').trim()) body.brand = values.brand.trim();
      if (values.code.trim() && values.code.trim() !== product.code) body.code = values.code.trim();
      if (values.unit.trim() !== product.unit) body.unit = values.unit.trim();
      if (values.categoryId && values.categoryId !== product.categoryId) {
        body.categoryId = values.categoryId;
      }
      if (
        price !== undefined &&
        (product.salePrice === null || price !== Number(product.salePrice))
      ) {
        body.salePrice = price;
      }
      if (values.tracksStock !== product.tracksStock) body.tracksStock = values.tracksStock;
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
      if (values.brand.trim()) body.brand = values.brand.trim();
      if (values.code.trim()) body.code = values.code.trim();
      if (values.categoryId) body.categoryId = values.categoryId;
      if (price !== undefined) body.salePrice = price;
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
      unit: apiErrors.unit,
      categoryId: apiErrors.categoryId,
      salePrice: apiErrors.salePrice,
    });
    if (!codeTaken) setFailure(result.failure);
    setSubmitting(false);
  }

  const noCategoryAllowed = !product?.categoryId;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {failure && (
        <FormError>
          {failureMessage(failure, {
            notFound: 'Este producto ya no existe.',
            byCode: { INVALID_REFERENCE: 'La categoría elegida ya no existe.' },
          })}
        </FormError>
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

      <div className="grid grid-cols-2 gap-3">
        <Field id="brand" label="Marca" optional error={errors.brand}>
          <Input
            id="brand"
            value={values.brand}
            onChange={(e) => update('brand', e.target.value)}
            maxLength={100}
            autoComplete="off"
            aria-invalid={!!errors.brand || undefined}
          />
        </Field>
        <Field id="code" label="Código" optional={!product?.code} error={errors.code}>
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
        id="unit"
        label="Unidad"
        hint="En la que se cuenta y se descuenta del stock."
        error={errors.unit}
      >
        <Input
          id="unit"
          value={values.unit}
          onChange={(e) => update('unit', e.target.value)}
          maxLength={50}
          autoComplete="off"
          required
          aria-invalid={!!errors.unit || undefined}
        />
      </Field>

      <Field
        id="categoryId"
        label="Categoría"
        optional={noCategoryAllowed}
        error={
          errors.categoryId ??
          (categoriesQuery.status === 'error' ? 'No se pudieron cargar las categorías.' : undefined)
        }
      >
        <Select
          id="categoryId"
          value={values.categoryId}
          onChange={(e) => update('categoryId', e.target.value)}
          disabled={categoriesQuery.status === 'loading'}
          aria-invalid={!!errors.categoryId || undefined}
        >
          {categoriesQuery.status === 'loading' && <option value="">Cargando categorías…</option>}
          {categoriesQuery.status !== 'loading' && noCategoryAllowed && (
            <option value="">Sin categoría</option>
          )}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      {categoriesQuery.status === 'error' && (
        <Button type="button" variant="outline" onClick={categoriesQuery.reload}>
          Reintentar cargar categorías
        </Button>
      )}
      {categoriesQuery.status === 'success' && (
        <NewCategoryForm
          onCreated={(category) => {
            setCreatedCategories((current) => [...current, category]);
            update('categoryId', category.id);
          }}
        />
      )}

      <Field
        id="salePrice"
        label="Precio de venta"
        optional={product?.salePrice == null}
        hint="Sin precio si todavía no lo defines."
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
