'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import type { ProductCategory } from '@/lib/products/format';

/**
 * Alta rápida de categoría o subcategoría (`POST /product-categories`,
 * máximo 2 niveles, BR-P18). El nombre es único por negocio (409
 * `PRODUCT_CATEGORY_ALREADY_EXISTS`). Renombrar, mover u ordenar se hace en
 * Configuración → Categorías.
 */
export function NewCategoryForm({
  categories,
  onCreated,
}: {
  categories: ProductCategory[];
  onCreated: (category: ProductCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parents = categories.filter((category) => !category.parentId);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mt-2 inline-flex w-fit items-center gap-1 py-1 text-sm font-medium underline-offset-4 hover:underline"
      >
        <Plus className="size-4" aria-hidden />
        Agregar una categoría
      </button>
    );
  }

  async function save() {
    if (!name.trim()) {
      setError('Ingresa el nombre de la categoría.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await callApi(
      api.POST('/product-categories', {
        body: { name: name.trim(), ...(parentId ? { parentId } : {}) },
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setError(
        failureMessage(result.failure, {
          byCode: {
            PRODUCT_CATEGORY_ALREADY_EXISTS: 'Ya existe una categoría con ese nombre.',
            INVALID_REFERENCE: 'La categoría elegida como principal ya no está disponible.',
          },
        }),
      );
      return;
    }
    onCreated(result.data);
    setOpen(false);
    setName('');
    setParentId('');
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3">
      <Field id="new-category-name" label="Nueva categoría" error={error ?? undefined}>
        <Input
          id="new-category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="off"
          aria-invalid={!!error || undefined}
        />
      </Field>
      <Field id="new-category-parent" label="Dentro de" optional>
        <Select
          id="new-category-parent"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">Ninguna (categoría principal)</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={saving} className="flex-1">
          {saving ? 'Guardando…' : 'Agregar categoría'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
