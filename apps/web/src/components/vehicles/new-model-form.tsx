'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import type { VehicleModel } from '@/lib/customers/format';

/** Alta rápida de un modelo (`POST /vehicle-models`): marca y modelo son lo único obligatorio. */
export function NewModelForm({ onCreated }: { onCreated: (model: VehicleModel) => void }) {
  const [open, setOpen] = useState(false);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
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
        Agregar un modelo que no está en la lista
      </button>
    );
  }

  async function save() {
    if (!make.trim() || !model.trim()) {
      setError('Ingresa la marca y el modelo.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await callApi(
      api.POST('/vehicle-models', { body: { make: make.trim(), model: model.trim() } }),
    );
    setSaving(false);
    if (!result.ok) {
      setError(failureMessage(result.failure));
      return;
    }
    onCreated(result.data);
    setOpen(false);
    setMake('');
    setModel('');
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3">
      <p className="text-sm font-medium">Nuevo modelo</p>
      <div className="grid grid-cols-2 gap-3">
        <Field id="new-model-make" label="Marca">
          <Input
            id="new-model-make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field id="new-model-model" label="Modelo">
          <Input
            id="new-model-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={saving} className="flex-1">
          {saving ? 'Guardando…' : 'Agregar modelo'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
