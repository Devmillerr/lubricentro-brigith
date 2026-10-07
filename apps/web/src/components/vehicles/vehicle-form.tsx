'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NewModelForm } from './new-model-form';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import {
  present,
  vehicleModelLabel,
  type Vehicle,
  type VehicleModel,
} from '@/lib/customers/format';
import { useSubmitLock } from '@/lib/use-submit-lock';

type Values = { plate: string; vehicleModelId: string; year: string; color: string; notes: string };
type FieldErrors = Partial<Record<keyof Values, string>>;

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * Alta y edición de vehículo (BR-C4, BR-C5): la placa es obligatoria; cliente,
 * modelo, año, color y notas son opcionales. La API normaliza la placa y la
 * exige única por negocio (BR-C6, 409 `PLATE_ALREADY_EXISTS`). Al editar, el
 * modelo y el año no se pueden quitar (la API no acepta null en esos campos),
 * solo cambiar. Un vehículo creado sin cliente (desde la búsqueda por placa)
 * lleva a su ficha. Con `thenMaintenance` (al registrarlo desde "Nuevo
 * mantenimiento"), lleva directo al mantenimiento de ese vehículo.
 */
export function VehicleForm(
  props:
    | {
        mode: 'create';
        customerId: string | null;
        initialPlate?: string;
        thenMaintenance?: boolean;
      }
    | { mode: 'edit'; vehicle: Vehicle },
) {
  const router = useRouter();
  const vehicle = props.mode === 'edit' ? props.vehicle : null;
  const customerId = props.mode === 'create' ? props.customerId : props.vehicle.customerId;
  const backHref = customerId ? `/clientes/${customerId}` : '/clientes';

  const [values, setValues] = useState<Values>({
    plate: vehicle?.plate ?? (props.mode === 'create' ? (props.initialPlate ?? '') : ''),
    vehicleModelId: vehicle?.vehicleModelId ?? '',
    year: vehicle?.year != null ? String(vehicle.year) : '',
    color: vehicle?.color ?? '',
    notes: vehicle?.notes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();
  const [createdModels, setCreatedModels] = useState<VehicleModel[]>([]);

  const modelsQuery = useApiQuery('vehicle-models', () => callApi(api.GET('/vehicle-models')));
  const models = [
    ...(modelsQuery.status === 'success' ? modelsQuery.data : []),
    ...createdModels.filter(
      (created) =>
        modelsQuery.status !== 'success' || !modelsQuery.data.some((m) => m.id === created.id),
    ),
  ];

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!values.plate.trim()) found.plate = 'Ingresa la placa.';
    const year = values.year.trim();
    if (year) {
      const parsed = Number(year);
      if (!Number.isInteger(parsed) || parsed < MIN_YEAR || parsed > MAX_YEAR) {
        found.year = `Ingresa un año entre ${MIN_YEAR} y ${MAX_YEAR}.`;
      }
    } else if (vehicle?.year != null) {
      found.year = 'El año registrado no se puede borrar, solo corregir.';
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

    const year = values.year.trim() ? Number(values.year.trim()) : undefined;
    let result;
    if (vehicle) {
      const body: Schemas['UpdateVehicleDto'] = {};
      const plate = values.plate.trim();
      if (plate !== vehicle.plate) body.plate = plate;
      if (values.vehicleModelId && values.vehicleModelId !== vehicle.vehicleModelId) {
        body.vehicleModelId = values.vehicleModelId;
      }
      if (year !== undefined && year !== vehicle.year) body.year = year;
      if (values.color.trim() !== (vehicle.color ?? '').trim()) body.color = values.color.trim();
      if (values.notes.trim() !== (vehicle.notes ?? '').trim()) body.notes = values.notes.trim();
      if (Object.keys(body).length === 0) {
        router.push(backHref);
        return;
      }
      result = await callApi(
        api.PATCH('/vehicles/{id}', { params: { path: { id: vehicle.id } }, body }),
      );
    } else {
      const body: Schemas['CreateVehicleDto'] = { plate: values.plate.trim() };
      if (customerId) body.customerId = customerId;
      if (values.vehicleModelId) body.vehicleModelId = values.vehicleModelId;
      if (year !== undefined) body.year = year;
      const color = present(values.color);
      if (color) body.color = color;
      const notes = present(values.notes);
      if (notes) body.notes = notes;
      result = await callApi(api.POST('/vehicles', { body }));
    }

    if (result.ok) {
      if (!vehicle && props.mode === 'create' && props.thenMaintenance) {
        router.push(`/vehiculos/${result.data.id}/mantenimientos/nuevo`);
      } else {
        router.push(!vehicle && !customerId ? `/vehiculos/${result.data.id}` : backHref);
      }
      return;
    }
    const apiErrors = result.failure.fieldErrors;
    setErrors({
      plate:
        result.failure.code === 'PLATE_ALREADY_EXISTS'
          ? 'Ya hay un vehículo registrado con esta placa.'
          : apiErrors.plate,
      vehicleModelId: apiErrors.vehicleModelId,
      year: apiErrors.year,
      color: apiErrors.color,
      notes: apiErrors.notes,
    });
    if (result.failure.code !== 'PLATE_ALREADY_EXISTS') setFailure(result.failure);
    lock.release();
    setSubmitting(false);
  }

  const noModelAllowed = !vehicle?.vehicleModelId;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {failure && (
        <FormError>
          {failureMessage(failure, {
            notFound: 'Este vehículo ya no existe.',
            byCode: { INVALID_REFERENCE: 'El cliente o el modelo elegido ya no existe.' },
          })}
        </FormError>
      )}

      <Field
        id="plate"
        label="Placa"
        hint="Como aparece en el vehículo; se compara sin espacios ni guiones."
        error={errors.plate}
      >
        <Input
          id="plate"
          value={values.plate}
          onChange={(e) => update('plate', e.target.value)}
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={!!errors.plate || undefined}
          className="font-medium tracking-wide"
        />
      </Field>

      <Field
        id="vehicleModelId"
        label="Modelo"
        optional={noModelAllowed}
        error={
          errors.vehicleModelId ??
          (modelsQuery.status === 'error' ? 'No se pudieron cargar los modelos.' : undefined)
        }
      >
        <Select
          id="vehicleModelId"
          value={values.vehicleModelId}
          onChange={(e) => update('vehicleModelId', e.target.value)}
          disabled={modelsQuery.status === 'loading'}
          aria-invalid={!!errors.vehicleModelId || undefined}
        >
          {modelsQuery.status === 'loading' && <option value="">Cargando modelos…</option>}
          {modelsQuery.status !== 'loading' && noModelAllowed && (
            <option value="">Sin modelo</option>
          )}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {vehicleModelLabel(model)}
            </option>
          ))}
        </Select>
      </Field>
      {modelsQuery.status === 'error' && (
        <Button type="button" variant="outline" onClick={modelsQuery.reload}>
          Reintentar cargar modelos
        </Button>
      )}
      {modelsQuery.status === 'success' && (
        <NewModelForm
          onCreated={(model) => {
            setCreatedModels((current) => [...current, model]);
            update('vehicleModelId', model.id);
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field id="year" label="Año" optional={vehicle?.year == null} error={errors.year}>
          <Input
            id="year"
            type="number"
            inputMode="numeric"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={values.year}
            onChange={(e) => update('year', e.target.value)}
            aria-invalid={!!errors.year || undefined}
          />
        </Field>
        <Field id="color" label="Color" optional error={errors.color}>
          <Input
            id="color"
            value={values.color}
            onChange={(e) => update('color', e.target.value)}
            maxLength={50}
            autoComplete="off"
            aria-invalid={!!errors.color || undefined}
          />
        </Field>
      </div>

      <Field id="vehicle-notes" label="Notas" optional error={errors.notes}>
        <Textarea
          id="vehicle-notes"
          value={values.notes}
          onChange={(e) => update('notes', e.target.value)}
          maxLength={2000}
          aria-invalid={!!errors.notes || undefined}
        />
      </Field>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Guardando…' : vehicle ? 'Guardar cambios' : 'Registrar vehículo'}
      </Button>
    </form>
  );
}
