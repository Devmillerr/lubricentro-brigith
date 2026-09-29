'use client';

import { useState } from 'react';
import { IndicatorsView } from '@/components/pilot/indicators-view';
import { chipClass } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import {
  describePeriod,
  isEmptyPeriod,
  periodFor,
  PRESET_LABELS,
  type PeriodPreset,
} from '@/lib/pilot/period';

const PRESETS: PeriodPreset[] = ['month', 'last7', 'last30', 'all', 'custom'];

/**
 * Resumen del piloto (07-UI-UX.md §3.8): solo lectura, los tres indicadores
 * aprobados (BR-I1 a BR-I3) por período. `GET /pilot-indicators?from=&to=`.
 */
export default function PilotSummaryPage() {
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  // "Ahora" fijo por visita, para que el rango no cambie en cada render.
  const [now] = useState(() => new Date());

  const customInvalid =
    preset === 'custom' && custom.from !== '' && custom.to !== '' && custom.from > custom.to;
  const period = periodFor(preset, custom, now);
  const key = customInvalid ? null : `pilot:${period.from ?? ''}|${period.to ?? ''}`;

  const indicators = useApiQuery(key, () =>
    callApi(
      api.GET('/pilot-indicators', {
        params: {
          query: {
            ...(period.from ? { from: period.from } : {}),
            ...(period.to ? { to: period.to } : {}),
          },
        },
      }),
    ),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Resumen del piloto"
        subtitle={customInvalid ? undefined : describePeriod(period)}
        back={{ href: '/mas', label: 'Más' }}
      />

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Período"
      >
        {PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={preset === value}
            onClick={() => setPreset(value)}
            className={chipClass(preset === value)}
          >
            {PRESET_LABELS[value]}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <Field id="period-from" label="Desde" optional>
            <Input
              id="period-from"
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((current) => ({ ...current, from: e.target.value }))}
            />
          </Field>
          <Field
            id="period-to"
            label="Hasta"
            optional
            error={customInvalid ? 'Debe ser igual o posterior a «Desde».' : undefined}
          >
            <Input
              id="period-to"
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((current) => ({ ...current, to: e.target.value }))}
              aria-invalid={customInvalid || undefined}
            />
          </Field>
        </div>
      )}

      {!customInvalid && indicators.status === 'loading' && (
        <LoadingState label="Calculando indicadores…" />
      )}
      {!customInvalid && indicators.status === 'error' && (
        <ErrorState message={failureMessage(indicators.failure)} onRetry={indicators.reload} />
      )}
      {!customInvalid && indicators.status === 'success' && (
        <>
          {isEmptyPeriod(indicators.data) && (
            <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
              No hay actividad registrada en este período.
            </p>
          )}
          <IndicatorsView indicators={indicators.data} />
        </>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Cuenta solo operaciones del negocio real. Las metas de cada indicador se acuerdan durante el
        piloto.
      </p>
    </div>
  );
}
