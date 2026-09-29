'use client';

import { ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page-header';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Plate } from '@/components/ui/plate';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle, present, vehicleModelLabel } from '@/lib/customers/format';
import { formatDate, formatKm } from '@/lib/maintenance/format';
import { STATUS_LABELS } from '@/lib/reminders/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type LookupItem = Schemas['VehicleLookupResponse'];

const DEBOUNCE_MS = 400;

/** Misma normalización que la API (BR-C6): mayúsculas, sin espacios ni guiones. */
function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Búsqueda por placa del Inicio (07-UI-UX.md §3.1) con `GET /vehicles/lookup`
 * mientras se escribe. Si ninguna placa coincide completa, ofrece crear el
 * vehículo con la placa escrita.
 */
export function PlateSearch() {
  const [text, setText] = useState('');
  // Una sola petición cuando se deja de escribir, no una por tecla.
  const plate = useDebouncedValue(normalizePlate(text), DEBOUNCE_MS);

  const lookup = useApiQuery(plate ? `plate-search:${plate}` : null, () =>
    callApi(api.GET('/vehicles/lookup', { params: { query: { plate } } })),
  );
  const typing = normalizePlate(text) !== plate;
  const exactMatch =
    lookup.status === 'success' && lookup.data.some((item) => item.plateNormalized === plate);

  return (
    <section className="flex flex-col gap-3">
      {/* Compacto en Inicio: la lupa y el ejemplo bastan; la etiqueta queda para lectores de pantalla. */}
      <label htmlFor="plate-search" className="sr-only">
        Buscar por placa
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <Input
          id="plate-search"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buscar placa, ej. ABC-123"
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="pl-11 text-lg font-medium tracking-wide"
        />
      </div>

      {plate && !typing && (
        <div aria-live="polite" className="flex flex-col gap-3">
          {lookup.status === 'loading' && <LoadingState label="Buscando…" className="py-6" />}
          {lookup.status === 'error' && (
            <ErrorState
              message={failureMessage(lookup.failure)}
              onRetry={lookup.reload}
              className="py-6"
            />
          )}
          {lookup.status === 'success' && (
            <>
              {lookup.data.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No hay vehículos con esa placa.
                </p>
              )}
              {lookup.data.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {lookup.data.map((item) => (
                    <li key={item.id}>
                      <LookupResult item={item} />
                    </li>
                  ))}
                </ul>
              )}
              {!exactMatch && (
                <Link
                  href={`/vehiculos/nuevo?placa=${encodeURIComponent(text.trim())}`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <Plus className="mr-2 size-4" aria-hidden />
                  Crear vehículo con esta placa
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function LookupResult({ item }: { item: LookupItem }) {
  const last = item.lastMaintenance;
  const nextDue = last ? [formatKm(last.nextDueKm), formatDate(last.nextDueDate)] : [];
  const nextDueText = nextDue.filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <Link href={`/vehiculos/${item.id}`} className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <Plate plate={item.plate} size="lg" />
            {!item.isActive && <Badge>Inactivo</Badge>}
          </span>
          <span className="text-[var(--muted-foreground)]">
            {item.vehicleModel ? vehicleModelLabel(item.vehicleModel) : 'Sin modelo'}
            {present(item.color) ? ` · ${item.color}` : ''}
          </span>
          <span>{item.customer ? customerTitle(item.customer) : 'Sin cliente'}</span>
          <span className="text-[var(--muted-foreground)]">
            {last ? `Último mantenimiento: ${formatDate(last.performedAt)}` : 'Sin mantenimientos'}
            {item.lastKnownKm !== null ? ` · ${formatKm(item.lastKnownKm)}` : ''}
          </span>
          {nextDueText && (
            <span className="flex flex-wrap items-center gap-2">
              Próximo: {nextDueText}
              {item.lastMaintenanceReminder && (
                <Badge>Aviso: {STATUS_LABELS[item.lastMaintenanceReminder.status]}</Badge>
              )}
            </span>
          )}
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      </Link>
      <Link
        href={`/vehiculos/${item.id}/mantenimientos/nuevo`}
        className={buttonVariants({ size: 'lg' })}
      >
        <Plus className="mr-2 size-5" aria-hidden />
        Nuevo mantenimiento
      </Link>
    </div>
  );
}
