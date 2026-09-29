'use client';

import { CircleCheck, Info } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import {
  changedSettings,
  STOCK_POLICY_LABELS,
  TEMPLATE_VARIABLES,
  toValues,
  validate,
  type Business,
  type SettingsField,
  type SettingsValues,
  type StockPolicy,
} from '@/lib/business/settings';
import { DUE_RULE_LABELS } from '@/lib/maintenance/format';

type FieldErrors = Partial<Record<SettingsField, string>>;

const FIELDS: SettingsField[] = [
  'whatsappTemplate',
  'reminderLeadDays',
  'defaultDueRuleWhenBoth',
  'insufficientStockPolicy',
  'currency',
  'defaultCountryCode',
];

/**
 * Configuración del negocio (07-UI-UX.md §3.7) con `PATCH /business/settings`.
 * Todos los valores abiertos pueden quedar sin definir (`null`); cada campo
 * explica qué hace el sistema mientras tanto. Solo se envían los campos que
 * cambiaron.
 */
export function SettingsForm({ business: initial }: { business: Business }) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState<SettingsValues>(() => toValues(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const pending = changedSettings(saved, values);
  const dirty = Object.keys(pending).length > 0;

  function update<K extends SettingsField>(field: K, value: SettingsValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setJustSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate(values);
    setErrors(found);
    setFailure(null);
    setJustSaved(false);
    if (Object.values(found).some(Boolean) || !dirty) return;
    setSubmitting(true);

    const result = await callApi(api.PATCH('/business/settings', { body: pending }));
    setSubmitting(false);
    if (result.ok) {
      setSaved(result.data);
      setValues(toValues(result.data));
      setJustSaved(true);
      return;
    }

    const apiErrors = result.failure.fieldErrors;
    const byField: FieldErrors = {};
    for (const field of FIELDS) byField[field] = apiErrors[field];
    setErrors(byField);
    // Un 400 con errores por campo ya se muestra junto a cada campo.
    const shownByField = FIELDS.some((field) => apiErrors[field]);
    if (!shownByField) setFailure(result.failure);
  }

  const days = values.reminderLeadDays.trim();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <Section title="WhatsApp">
        <Field
          id="whatsappTemplate"
          label="Plantilla del mensaje"
          optional
          hint={`Puedes usar ${TEMPLATE_VARIABLES.join(', ')}; se reemplazan con los datos de cada aviso. La vista previa con datos reales aparece en el detalle de cada aviso.`}
          error={errors.whatsappTemplate}
        >
          <Textarea
            id="whatsappTemplate"
            rows={5}
            value={values.whatsappTemplate}
            onChange={(e) => update('whatsappTemplate', e.target.value)}
            maxLength={4000}
            aria-invalid={!!errors.whatsappTemplate || undefined}
          />
        </Field>
        {!values.whatsappTemplate.trim() && (
          <Unset>El enlace de WhatsApp abre el chat sin mensaje; el texto lo escribes tú.</Unset>
        )}

        <Field
          id="defaultCountryCode"
          label="Código de país"
          optional
          error={errors.defaultCountryCode}
          hint="Todavía no se usa: la forma de convertir los teléfonos a formato internacional está pendiente de definir."
        >
          <Input
            id="defaultCountryCode"
            inputMode="tel"
            value={values.defaultCountryCode}
            onChange={(e) => update('defaultCountryCode', e.target.value)}
            maxLength={10}
            autoComplete="off"
            aria-invalid={!!errors.defaultCountryCode || undefined}
          />
        </Field>
        {!values.defaultCountryCode.trim() && (
          <Unset>El enlace usa el teléfono tal como está guardado, sin código de país.</Unset>
        )}
      </Section>

      <Section title="Avisos y mantenimiento">
        <Field
          id="reminderLeadDays"
          label="Días de anticipación"
          optional
          hint="Cuántos días antes de la próxima fecha aparece el aviso en «Avisar»."
          error={errors.reminderLeadDays}
        >
          <Input
            id="reminderLeadDays"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={values.reminderLeadDays}
            onChange={(e) => update('reminderLeadDays', e.target.value)}
            aria-invalid={!!errors.reminderLeadDays || undefined}
          />
        </Field>
        {!days && <Unset>Corresponde avisar desde la fecha exacta, sin anticipación.</Unset>}

        <Field
          id="defaultDueRuleWhenBoth"
          label="Regla cuando hay próximo km y fecha"
          optional
          hint="Se preselecciona al registrar un mantenimiento; se puede cambiar en cada uno."
          error={errors.defaultDueRuleWhenBoth}
        >
          <Select
            id="defaultDueRuleWhenBoth"
            value={values.defaultDueRuleWhenBoth}
            onChange={(e) =>
              update(
                'defaultDueRuleWhenBoth',
                e.target.value as SettingsValues['defaultDueRuleWhenBoth'],
              )
            }
            aria-invalid={!!errors.defaultDueRuleWhenBoth || undefined}
          >
            <option value="">Sin definir</option>
            <option value="ANY">{DUE_RULE_LABELS.ANY}</option>
            <option value="ALL">{DUE_RULE_LABELS.ALL}</option>
          </Select>
        </Field>
        {!values.defaultDueRuleWhenBoth && (
          <Unset>No se preselecciona nada: eliges la regla en cada mantenimiento.</Unset>
        )}
      </Section>

      <Section title="Inventario">
        <Field
          id="insufficientStockPolicy"
          label="Si un mantenimiento deja stock negativo"
          hint="Valor provisional hasta que se decida (el sistema empieza con «Guardar y avisar»)."
          error={errors.insufficientStockPolicy}
        >
          <Select
            id="insufficientStockPolicy"
            value={values.insufficientStockPolicy}
            onChange={(e) => update('insufficientStockPolicy', e.target.value as StockPolicy)}
            aria-invalid={!!errors.insufficientStockPolicy || undefined}
          >
            {(Object.keys(STOCK_POLICY_LABELS) as StockPolicy[]).map((policy) => (
              <option key={policy} value={policy}>
                {STOCK_POLICY_LABELS[policy]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="currency"
          label="Moneda"
          optional
          hint="Todavía no se usa en ninguna pantalla."
          error={errors.currency}
        >
          <Input
            id="currency"
            value={values.currency}
            onChange={(e) => update('currency', e.target.value)}
            maxLength={10}
            autoComplete="off"
            aria-invalid={!!errors.currency || undefined}
          />
        </Field>
        {!values.currency.trim() && <Unset>Sin moneda definida.</Unset>}
      </Section>

      {failure && (
        <FormError>
          {failureMessage(failure, {
            notFound: 'No se encontró el negocio de tu sesión. Vuelve a iniciar sesión.',
          })}
        </FormError>
      )}
      {justSaved && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-[var(--success)]/40 bg-[var(--success-soft)] px-3 py-2.5 text-sm font-medium"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
          Cambios guardados.
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting || !dirty}>
        {submitting ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}
      </Button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

/** Aviso de campo sin definir (`null`) y qué hace el sistema mientras tanto. */
function Unset({ children }: { children: ReactNode }) {
  return (
    <p className="-mt-1 flex items-start gap-2 text-xs text-[var(--muted-foreground)]">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium text-[var(--foreground)]">Sin definir.</span> {children}
      </span>
    </p>
  );
}
