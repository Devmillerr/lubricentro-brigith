'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import {
  fromDateInput,
  parseKm,
  toDateInput,
  type MaintenanceWithItems,
  effectiveDueRule,
  type NextDueValues,
} from '@/lib/maintenance/format';
import { NextDueFields } from './next-due-fields';
import { useSubmitLock } from '@/lib/use-submit-lock';

type Errors = Partial<Record<'odometerKm' | 'notes' | keyof NextDueValues, string>>;

/**
 * Corrige un mantenimiento (BR-M11): solo notas, km, próximo km/fecha y regla.
 * Productos y cantidades no se editan: se anula y se registra otro. El km
 * registrado no se puede quitar (la API no acepta null), solo corregir.
 */
export function MaintenanceEditForm({ maintenance }: { maintenance: MaintenanceWithItems }) {
  const router = useRouter();
  const business = useApiQuery('business', () => callApi(api.GET('/business')));
  const businessDefault =
    business.status === 'success' ? business.data.defaultDueRuleWhenBoth : null;

  const initialDate = toDateInput(maintenance.nextDueDate);
  const [odometer, setOdometer] = useState(
    maintenance.odometerKm !== null ? String(maintenance.odometerKm) : '',
  );
  const [nextDue, setNextDue] = useState<NextDueValues>({
    nextDueKm: maintenance.nextDueKm !== null ? String(maintenance.nextDueKm) : '',
    nextDueDate: initialDate,
    dueRule:
      maintenance.dueRule === 'ANY' || maintenance.dueRule === 'ALL' ? maintenance.dueRule : '',
  });
  const [notes, setNotes] = useState(maintenance.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useSubmitLock();

  const detailHref = `/mantenimientos/${maintenance.id}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found: Errors = {};
    const odometerKm = parseKm(odometer);
    if (odometer.trim() && odometerKm === null) found.odometerKm = 'Ingresa el km sin decimales.';
    if (!odometer.trim() && maintenance.odometerKm !== null) {
      found.odometerKm = 'El km registrado no se puede quitar, solo corregir.';
    }
    const nextKm = parseKm(nextDue.nextDueKm);
    if (nextDue.nextDueKm.trim() && nextKm === null) {
      found.nextDueKm = 'Ingresa el km sin decimales.';
    }
    const rule = effectiveDueRule(nextDue, businessDefault);
    const both = nextDue.nextDueKm.trim() !== '' && nextDue.nextDueDate !== '';
    if (both && !rule) found.dueRule = 'Elige cuándo avisar.';
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;

    const body: Schemas['UpdateMaintenanceDto'] = {};
    if (odometerKm !== null && odometerKm !== maintenance.odometerKm) body.odometerKm = odometerKm;
    if (nextKm !== maintenance.nextDueKm) body.nextDueKm = nextKm;
    if (nextDue.nextDueDate !== initialDate) {
      body.nextDueDate = nextDue.nextDueDate ? fromDateInput(nextDue.nextDueDate) : null;
    }
    // Con km y fecha se envía la regla elegida; con uno solo, la API la infiere (BR-M4).
    if (
      both &&
      rule &&
      (rule !== maintenance.dueRule || 'nextDueKm' in body || 'nextDueDate' in body)
    ) {
      body.dueRule = rule;
    }
    if (notes.trim() !== (maintenance.notes ?? '').trim()) body.notes = notes.trim();

    if (Object.keys(body).length === 0) {
      router.push(detailHref);
      return;
    }

    if (!lock.acquire()) return;
    setSubmitting(true);
    const result = await callApi(
      api.PATCH('/maintenances/{id}', { params: { path: { id: maintenance.id } }, body }),
    );
    if (result.ok) {
      router.push(detailHref);
      return;
    }
    lock.release();
    setSubmitting(false);
    const apiErrors = result.failure.fieldErrors;
    const code = result.failure.code;
    setErrors({
      odometerKm: apiErrors.odometerKm,
      nextDueKm: apiErrors.nextDueKm,
      nextDueDate: apiErrors.nextDueDate,
      notes: apiErrors.notes,
      dueRule:
        code === 'DUE_RULE_REQUIRED'
          ? 'Elige cuándo avisar.'
          : code === 'INCOHERENT_DUE_RULE'
            ? 'La regla no coincide con el km y la fecha ingresados.'
            : apiErrors.dueRule,
    });
    setFailure(result.failure);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {failure && !['DUE_RULE_REQUIRED', 'INCOHERENT_DUE_RULE'].includes(failure.code ?? '') && (
        <FormError>
          {failureMessage(failure, {
            notFound: 'Este mantenimiento ya no existe.',
            byCode: { MAINTENANCE_VOIDED: 'Un mantenimiento anulado no se puede corregir.' },
          })}
        </FormError>
      )}

      <Field
        id="edit-odometer"
        label="Km actual"
        optional={maintenance.odometerKm === null}
        error={errors.odometerKm}
      >
        <Input
          id="edit-odometer"
          inputMode="numeric"
          autoComplete="off"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          aria-invalid={!!errors.odometerKm || undefined}
        />
      </Field>

      <NextDueFields
        values={nextDue}
        onChange={setNextDue}
        errors={errors}
        businessDefault={businessDefault}
      />
      <p className="-mt-2 text-xs text-[var(--muted-foreground)]">
        Si cambias el próximo km o la fecha, el recordatorio abierto se actualiza; si quitas ambos,
        se descarta.
      </p>

      <Field id="edit-notes" label="Notas" optional error={errors.notes}>
        <Textarea
          id="edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
      </Field>

      <p className="text-xs text-[var(--muted-foreground)]">
        Los productos y cantidades no se editan: para corregirlos, anula este mantenimiento y
        registra uno nuevo.
      </p>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </form>
  );
}
