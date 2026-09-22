'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import type { ProductCategory } from '@/lib/products/format';

/**
 * Alta rápida de categoría (`POST /product-categories`, BR-P18: solo alta).
 * El nombre es único por negocio (409 `PRODUCT_CATEGORY_ALREADY_EXISTS`).
 */
export function NewCategoryForm({ onCreated }: { onCreated: (category: ProductCategory) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    const result = await callApi(api.POST('/product-categories', { body: { name: name.trim() } }));
    setSaving(false);
    if (!result.ok) {
      setError(
        failureMessage(result.failure, {
          byCode: { PRODUCT_CATEGORY_ALREADY_EXISTS: 'Ya existe una categoría con ese nombre.' },
        }),
      );
      return;
    }
    onCreated(result.data);
    setOpen(false);
    setName('');
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
