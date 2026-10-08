'use client';

import { CircleCheck, Plus } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { chipClass } from '@/components/ui/chip';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import {
  changedSettings,
  previewTemplate,
  TEMPLATE_FIELDS,
  templatePlaceholder,
  toValues,
  validate,
  type Business,
  type SettingsField,
  type SettingsValues,
} from '@/lib/business/settings';
import { DUE_RULE_LABELS } from '@/lib/maintenance/format';

type FieldErrors = Partial<Record<SettingsField, string>>;

const FIELDS: SettingsField[] = ['whatsappTemplate', 'reminderLeadDays', 'defaultDueRuleWhenBoth'];

/**
 * Configuración del negocio (07-UI-UX.md §3.7) con `PATCH /business/settings`.
 * Solo los ajustes que hoy tienen efecto (ver `SettingsValues`). Solo se
 * envían los campos que cambiaron.
 */
export function SettingsForm({ business: initial }: { business: Business }) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState<SettingsValues>(() => toValues(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const pending = changedSettings(saved, values);
  const dirty = Object.keys(pending).length > 0;

  function update<K extends SettingsField>(field: K, value: SettingsValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setJustSaved(false);
  }

  /** Inserta un dato del aviso donde está el cursor (o al final). */
  function insertField(token: string) {
    const area = templateRef.current;
    const text = values.whatsappTemplate;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
    update('whatsappTemplate', next);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <Section title="WhatsApp">
        <Field
          id="whatsappTemplate"
          label="Mensaje de aviso"
          hint="Se abre ya escrito en WhatsApp; puedes cambiarlo antes de enviarlo."
          error={errors.whatsappTemplate}
        >
          <Textarea
            ref={templateRef}
            id="whatsappTemplate"
            rows={4}
            value={values.whatsappTemplate}
            onChange={(e) => update('whatsappTemplate', e.target.value)}
            maxLength={4000}
            placeholder="Hola, le recordamos que su vehículo…"
            aria-invalid={!!errors.whatsappTemplate || undefined}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span id="template-fields" className="text-sm font-medium">
            Agregar al mensaje
          </span>
          <div role="group" aria-labelledby="template-fields" className="flex flex-wrap gap-2">
            {TEMPLATE_FIELDS.map((field) => (
              // Botón de acción, no un interruptor: estilo de chip sin `aria-pressed`.
              <button
                key={field.label}
                type="button"
                onClick={() => insertField(templatePlaceholder(field))}
                className={chipClass(false)}
              >
                <Plus className="size-3.5" aria-hidden />
                {field.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <span className="text-xs font-medium text-[var(--muted-foreground)]">Así se verá</span>
          <p className="text-sm break-words whitespace-pre-wrap">
            {values.whatsappTemplate.trim()
              ? previewTemplate(values.whatsappTemplate)
              : 'Sin mensaje: WhatsApp se abre con el chat vacío.'}
          </p>
        </div>
      </Section>

      <Section title="Avisos">
        <Field
          id="reminderLeadDays"
          label="Días de anticipación"
          hint="Cuántos días antes de la fecha aparece en Avisar. Vacío: el mismo día."
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

        <Field
          id="defaultDueRuleWhenBoth"
          label="Con próximo km y fecha, avisar"
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
            <option value="">Elegir en cada mantenimiento</option>
            <option value="ANY">{DUE_RULE_LABELS.ANY}</option>
            <option value="ALL">{DUE_RULE_LABELS.ALL}</option>
          </Select>
        </Field>
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
