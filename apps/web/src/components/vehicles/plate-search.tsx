'use client';

import { ChevronRight, Plus, Search, User } from 'lucide-react';
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
import { searchOnEnter } from '@/lib/enter-key';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { looksLikePlate, normalizePlate } from '@/lib/vehicles/plate';

type LookupItem = Schemas['VehicleLookupResponse'];
type Customer = Schemas['CustomerResponse'];

const DEBOUNCE_MS = 400;

/**
 * Búsqueda del Inicio (07-UI-UX.md §3.1) mientras se escribe, igual que en
 * Mantenimiento: por placa (`GET /vehicles/lookup`) y por nombre o teléfono
 * del cliente (`GET /customers`). Si lo escrito parece placa y ninguna
 * coincide completa, ofrece crear el vehículo con esa placa.
 */
export function PlateSearch() {
  const [text, setText] = useState('');
  // Una sola petición cuando se deja de escribir, no una por tecla.
  const term = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const plate = normalizePlate(term);
  const typing = text.trim() !== term;

  const lookup = useApiQuery(plate ? `plate-search:${plate}` : null, () =>
    callApi(api.GET('/vehicles/lookup', { params: { query: { plate } } })),
  );
  const customers = useApiQuery(term.length >= 2 ? `home-customer:${term}` : null, () =>
    callApi(api.GET('/customers', { params: { query: { search: term, limit: 5 } } })),
  );
  const loading = lookup.status === 'loading' || customers.status === 'loading';
  const vehicleItems = lookup.status === 'success' ? lookup.data : [];
  const customerItems = customers.status === 'success' ? customers.data.items : [];
  const exactMatch = vehicleItems.some((item) => item.plateNormalized === plate);
  const nothing =
    !loading &&
    lookup.status !== 'error' &&
    customers.status !== 'error' &&
    vehicleItems.length === 0 &&
    customerItems.length === 0;

  return (
    <section className="flex flex-col gap-3">
      {/* Compacto en Inicio: la lupa y el ejemplo bastan; la etiqueta queda para lectores de pantalla. */}
      <label htmlFor="plate-search" className="sr-only">
        Buscar por nombre o placa
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
          onKeyDown={searchOnEnter}
          placeholder="Buscar nombre o placa"
          maxLength={60}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="pl-11 text-lg font-medium tracking-wide"
        />
      </div>

      {term && !typing && (
        <div aria-live="polite" className="flex flex-col gap-3">
          {loading && <LoadingState label="Buscando…" className="py-6" />}
          {lookup.status === 'error' && (
            <ErrorState
              message={failureMessage(lookup.failure)}
              onRetry={lookup.reload}
              className="py-6"
            />
          )}
          {customers.status === 'error' && (
            <ErrorState
              message={failureMessage(customers.failure)}
              onRetry={customers.reload}
              className="py-6"
            />
          )}
          {vehicleItems.length > 0 && (
            <ul className="flex flex-col gap-2">
              {vehicleItems.map((item) => (
                <li key={item.id}>
                  <LookupResult item={item} />
                </li>
              ))}
            </ul>
          )}
          {customerItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-[var(--muted-foreground)]">Clientes</h3>
              <ul className="flex flex-col gap-2">
                {customerItems.map((customer) => (
                  <li key={customer.id}>
                    <CustomerResult customer={customer} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {nothing && (
            <p className="text-sm text-[var(--muted-foreground)]">
              No hay vehículos ni clientes que coincidan.
            </p>
          )}
          {!loading && lookup.status !== 'error' && looksLikePlate(plate) && !exactMatch && (
            <Link
              href={`/vehiculos/nuevo?placa=${encodeURIComponent(term)}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              Crear vehículo con esta placa
            </Link>
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

/** Cliente encontrado por nombre o teléfono: lleva a su ficha, con sus vehículos. */
function CustomerResult({ customer }: { customer: Customer }) {
  const phone = present(customer.phone);
  return (
    <Link
      href={`/clientes/${customer.id}`}
      className="flex min-h-14 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 hover:bg-[var(--muted)]"
    >
      <User className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col text-sm">
        <span className="font-semibold break-words">{customerTitle(customer)}</span>
        {phone && <span className="text-[var(--muted-foreground)]">{phone}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
    </Link>
  );
}
