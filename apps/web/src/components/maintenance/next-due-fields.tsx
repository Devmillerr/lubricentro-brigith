'use client';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  DUE_RULE_LABELS,
  effectiveDueRule,
  type DueRule,
  type NextDueErrors,
  type NextDueValues,
} from '@/lib/maintenance/format';

import { cn } from '@/lib/utils';

/**
 * Próximo mantenimiento (07-UI-UX.md §3.3.5): próximo km y próxima fecha,
 * ambos opcionales y sin valores precargados (BR-M1, BR-M3). Sin ninguno no
 * hay recordatorio (BR-M6).
 */
export function NextDueFields({
  values,
  onChange,
  errors,
  businessDefault,
}: {
  values: NextDueValues;
  onChange: (next: NextDueValues) => void;
  errors: NextDueErrors;
  businessDefault: DueRule | null;
}) {
  const hasKm = values.nextDueKm.trim() !== '';
  const hasDate = values.nextDueDate !== '';
  const selected = effectiveDueRule(values, businessDefault);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">Próximo mantenimiento</legend>
      <div className="grid grid-cols-2 gap-3">
        <Field id="next-km" label="Próximo km" optional error={errors.nextDueKm}>
          <Input
            id="next-km"
            inputMode="numeric"
            autoComplete="off"
            value={values.nextDueKm}
            onChange={(e) => onChange({ ...values, nextDueKm: e.target.value })}
            aria-invalid={!!errors.nextDueKm || undefined}
          />
        </Field>
        <Field id="next-date" label="Próxima fecha" optional error={errors.nextDueDate}>
          <Input
            id="next-date"
            type="date"
            value={values.nextDueDate}
            onChange={(e) => onChange({ ...values, nextDueDate: e.target.value })}
            aria-invalid={!!errors.nextDueDate || undefined}
          />
        </Field>
      </div>

      {hasKm && hasDate ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">¿Cuándo avisar?</span>
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Regla de vencimiento"
          >
            {(['ANY', 'ALL'] as const).map((rule) => (
              <button
                key={rule}
                type="button"
                role="radio"
                aria-checked={selected === rule}
                onClick={() => onChange({ ...values, dueRule: rule })}
                className={cn(
                  'min-h-11 rounded-md border px-2 py-2 text-sm font-medium',
                  selected === rule
                    ? 'border-[var(--foreground)] bg-[var(--muted)]'
                    : 'border-[var(--border)] text-[var(--muted-foreground)]',
                  errors.dueRule && 'border-[var(--danger)]',
                )}
              >
                {DUE_RULE_LABELS[rule]}
              </button>
            ))}
          </div>
          {errors.dueRule && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {errors.dueRule}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          {selected
            ? `Se avisará ${selected === 'KM' ? 'por km' : 'por fecha'}.`
            : 'Sin próximo km ni fecha no se crea recordatorio.'}
        </p>
      )}
    </fieldset>
  );
}
