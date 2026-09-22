'use client';

import { Car, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { NewModelForm } from '@/components/vehicles/new-model-form';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { vehicleModelLabel, type VehicleModel } from '@/lib/customers/format';

/**
 * Compatibilidad explícita producto ↔ modelo de vehículo (BR-F1): solo se
 * crea con esta acción del usuario, nunca desde un mantenimiento (BR-F2).
 *
 * Quitar necesita el id de la compatibilidad (`DELETE /compatibilities/{id}`),
 * y `GET /products/{id}/compatible-models` solo devuelve los modelos. Por eso
 * solo se pueden quitar las agregadas en esta sesión, cuyo id devolvió
 * `POST /compatibilities`.
 */
export function CompatibilitiesSection({ productId }: { productId: string }) {
  const compatible = useApiQuery(`compatible-models:${productId}`, () =>
    callApi(api.GET('/products/{id}/compatible-models', { params: { path: { id: productId } } })),
  );
  const allModels = useApiQuery('vehicle-models', () => callApi(api.GET('/vehicle-models')));

  /** vehicleModelId → id de la compatibilidad creada en esta sesión. */
  const [createdIds, setCreatedIds] = useState<Record<string, string>>({});
  const [createdModels, setCreatedModels] = useState<VehicleModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const compatibleIds = new Set(
    compatible.status === 'success' ? compatible.data.map((model) => model.id) : [],
  );
  const candidates = [
    ...(allModels.status === 'success' ? allModels.data : []),
    ...createdModels.filter(
      (created) =>
        allModels.status !== 'success' || !allModels.data.some((m) => m.id === created.id),
    ),
  ].filter((model) => !compatibleIds.has(model.id));

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModelId || adding) return;
    setAdding(true);
    setActionError(null);
    const result = await callApi(
      api.POST('/compatibilities', {
        body: {
          productId,
          vehicleModelId: selectedModelId,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    );
    setAdding(false);
    if (!result.ok) {
      setActionError(
        failureMessage(result.failure, {
          byCode: {
            COMPATIBILITY_ALREADY_EXISTS: 'Ese modelo ya está marcado como compatible.',
            INVALID_REFERENCE: 'El producto o el modelo ya no existe.',
          },
        }),
      );
      if (result.failure.code === 'COMPATIBILITY_ALREADY_EXISTS') compatible.reload();
      return;
    }
    setCreatedIds((current) => ({ ...current, [result.data.vehicleModelId]: result.data.id }));
    setSelectedModelId('');
    setNote('');
    compatible.reload();
  }

  async function handleRemove(vehicleModelId: string) {
    const compatibilityId = createdIds[vehicleModelId];
    if (!compatibilityId || removingId) return;
    setRemovingId(compatibilityId);
    setActionError(null);
    const result = await callApi(
      api.DELETE('/compatibilities/{id}', { params: { path: { id: compatibilityId } } }),
    );
    setRemovingId(null);
    if (!result.ok && result.failure.status !== 404) {
      setActionError(failureMessage(result.failure));
      return;
    }
    // 404: ya no existía; en ambos casos se refresca la lista.
    setCreatedIds((current) => {
      const next = { ...current };
      delete next[vehicleModelId];
      return next;
    });
    compatible.reload();
  }

  const hasUnremovable =
    compatible.status === 'success' && compatible.data.some((model) => !createdIds[model.id]);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Modelos compatibles</h3>

      {actionError && <FormError>{actionError}</FormError>}

      {compatible.status === 'loading' && <LoadingState label="Cargando compatibilidades…" />}
      {compatible.status === 'error' && (
        <ErrorState message={failureMessage(compatible.failure)} onRetry={compatible.reload} />
      )}
      {compatible.status === 'success' && compatible.data.length === 0 && (
        <EmptyState
          title="Sin modelos compatibles"
          description="Marca con qué modelos de vehículo se usa este producto."
        />
      )}
      {compatible.status === 'success' && compatible.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {compatible.data.map((model) => {
            const compatibilityId = createdIds[model.id];
            return (
              <li key={model.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <Car className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{vehicleModelLabel(model)}</span>
                {compatibilityId && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-3"
                    onClick={() => handleRemove(model.id)}
                    disabled={removingId !== null}
                    aria-label={`Quitar compatibilidad con ${vehicleModelLabel(model)}`}
                  >
                    <X className="mr-1 size-4" aria-hidden />
                    {removingId === compatibilityId ? 'Quitando…' : 'Quitar'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasUnremovable && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Por ahora solo se pueden quitar las compatibilidades agregadas en esta sesión.
        </p>
      )}

      {compatible.status === 'success' && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4"
        >
          <p className="text-sm font-medium">Agregar modelo compatible</p>
          {allModels.status === 'error' ? (
            <ErrorState
              title="No se pudieron cargar los modelos"
              message={failureMessage(allModels.failure)}
              onRetry={allModels.reload}
              className="py-4"
            />
          ) : (
            <>
              <Field id="compat-model" label="Modelo">
                <Select
                  id="compat-model"
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  disabled={allModels.status === 'loading'}
                >
                  <option value="">
                    {allModels.status === 'loading'
                      ? 'Cargando modelos…'
                      : candidates.length === 0
                        ? 'No hay más modelos registrados'
                        : 'Elige un modelo'}
                  </option>
                  {candidates.map((model) => (
                    <option key={model.id} value={model.id}>
                      {vehicleModelLabel(model)}
                    </option>
                  ))}
                </Select>
              </Field>
              {allModels.status === 'success' && (
                <NewModelForm
                  onCreated={(model) => {
                    setCreatedModels((current) => [...current, model]);
                    setSelectedModelId(model.id);
                  }}
                />
              )}
              <Field id="compat-note" label="Nota" optional>
                <Input
                  id="compat-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  autoComplete="off"
                />
              </Field>
              <Button type="submit" disabled={!selectedModelId || adding}>
                {adding ? 'Guardando…' : 'Marcar como compatible'}
              </Button>
            </>
          )}
        </form>
      )}
    </section>
  );
}
