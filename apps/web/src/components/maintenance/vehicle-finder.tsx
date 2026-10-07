'use client';

import { Car, ChevronDown, ChevronRight, Plus, Search, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page-header';
import { Plate } from '@/components/ui/plate';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle, present, vehicleModelLabel } from '@/lib/customers/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type LookupItem = Schemas['VehicleLookupResponse'];
type Customer = Schemas['CustomerResponse'];

const DEBOUNCE_MS = 400;

/** Misma normalización que la API (BR-C6): mayúsculas, sin espacios ni guiones. */
function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Solo se ofrece registrar una placa nueva si lo escrito parece placa (letras
 * y números, con al menos un número, de 4 a 10): un nombre no es una placa.
 */
function looksLikePlate(plate: string): boolean {
  return /^[A-Z0-9]{4,10}$/.test(plate) && /\d/.test(plate);
}

/** Ruta del formulario de mantenimiento con el vehículo elegido. */
export function maintenanceHref(vehicleId: string): string {
  return `/vehiculos/${vehicleId}/mantenimientos/nuevo`;
}

/**
 * "¿Qué vehículo?" antes de registrar un mantenimiento (Fase 2): el
 * mantenimiento se asocia al vehículo, y el cliente llega a través de él
 * (Mantenimiento → Vehículo → Cliente). Busca a la vez por placa
 * (`GET /vehicles/lookup`, como en Inicio) y por nombre o teléfono del
 * cliente (`GET /customers`). Al elegir un cliente se ven sus vehículos; si no
 * tiene, se registra uno y se sigue directo al mantenimiento. No crea nada
 * por sí mismo: lleva al formulario existente del vehículo.
 */
export function VehicleFinder() {
  const [text, setText] = useState('');
  const term = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const plate = normalizePlate(term);
  const typing = text.trim() !== term;

  const vehicles = useApiQuery(plate ? `maint-plate:${plate}` : null, () =>
    callApi(api.GET('/vehicles/lookup', { params: { query: { plate } } })),
  );
  const customers = useApiQuery(term.length >= 2 ? `maint-customer:${term}` : null, () =>
    callApi(api.GET('/customers', { params: { query: { search: term, limit: 5 } } })),
  );

  const loading = vehicles.status === 'loading' || customers.status === 'loading';
  const vehicleItems = vehicles.status === 'success' ? vehicles.data : [];
  const customerItems = customers.status === 'success' ? customers.data.items : [];
  const exactPlate = vehicleItems.some((item) => item.plateNormalized === plate);
  const nothing =
    !loading &&
    vehicles.status !== 'error' &&
    customers.status !== 'error' &&
    vehicleItems.length === 0 &&
    customerItems.length === 0;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="vehicle-finder-title">
      <h3 id="vehicle-finder-title" className="text-lg font-bold">
        ¿Qué vehículo?
      </h3>
      <label htmlFor="vehicle-finder" className="sr-only">
        Buscar por placa o por cliente
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <Input
          id="vehicle-finder"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Placa o nombre del cliente"
          maxLength={60}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="pl-11 text-lg"
        />
      </div>
      {!term && (
        <p className="text-sm text-[var(--muted-foreground)]">
          Escribe la placa (ej. ABC-123) o el nombre o teléfono del cliente.
        </p>
      )}

      {term && !typing && (
        <div aria-live="polite" className="flex flex-col gap-4">
          {loading && <LoadingState label="Buscando…" className="py-6" />}
          {vehicles.status === 'error' && (
            <ErrorState message={failureMessage(vehicles.failure)} onRetry={vehicles.reload} />
          )}
          {customers.status === 'error' && (
            <ErrorState message={failureMessage(customers.failure)} onRetry={customers.reload} />
          )}

          {vehicleItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-[var(--muted-foreground)]">Vehículos</h4>
              <ul className="flex flex-col gap-2">
                {vehicleItems.map((item) => (
                  <li key={item.id}>
                    <VehicleResult item={item} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {customerItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-[var(--muted-foreground)]">Clientes</h4>
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

          {!loading && looksLikePlate(plate) && !exactPlate && (
            <Link
              href={`/vehiculos/nuevo?placa=${encodeURIComponent(term)}&siguiente=mantenimiento`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              Registrar vehículo con placa {term.toUpperCase()}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function VehicleResult({ item }: { item: LookupItem }) {
  return (
    <Link
      href={maintenanceHref(item.id)}
      className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 hover:bg-[var(--muted)]"
    >
      <Car className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <Plate plate={item.plate} />
          {!item.isActive && <Badge>Inactivo</Badge>}
        </span>
        <span className="text-[var(--muted-foreground)]">
          {item.vehicleModel ? vehicleModelLabel(item.vehicleModel) : 'Sin modelo'}
          {' · '}
          {item.customer ? customerTitle(item.customer) : 'Sin cliente'}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
    </Link>
  );
}

/** Cliente encontrado: al tocarlo se ven sus vehículos (`GET /customers/{id}`). */
function CustomerResult({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false);
  const detail = useApiQuery(open ? `customer:${customer.id}` : null, () =>
    callApi(api.GET('/customers/{id}', { params: { path: { id: customer.id } } })),
  );
  const phone = present(customer.phone);
  const panelId = `customer-vehicles-${customer.id}`;

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-14 items-center gap-3 rounded-lg p-3 text-left hover:bg-[var(--muted)]"
      >
        <User className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col text-sm">
          <span className="font-semibold break-words">{customerTitle(customer)}</span>
          {phone && <span className="text-[var(--muted-foreground)]">{phone}</span>}
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
          {detail.status === 'loading' && (
            <LoadingState label="Cargando vehículos…" className="py-3" />
          )}
          {detail.status === 'error' && (
            <ErrorState message={failureMessage(detail.failure)} onRetry={detail.reload} />
          )}
          {detail.status === 'success' && (
            <>
              {detail.data.vehicles.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Este cliente todavía no tiene vehículos.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.data.vehicles.map((vehicle) => (
                    <li key={vehicle.id}>
                      <Link
                        href={maintenanceHref(vehicle.id)}
                        className="flex min-h-12 items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--muted)]"
                      >
                        <Plate plate={vehicle.plate} />
                        {!vehicle.isActive && <Badge>Inactivo</Badge>}
                        <span className="ml-auto text-sm font-semibold">Elegir</span>
                        <ChevronRight
                          className="size-4 text-[var(--muted-foreground)]"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/clientes/${customer.id}/vehiculos/nuevo?siguiente=mantenimiento`}
                className={buttonVariants({ variant: 'outline' })}
              >
                <Plus className="mr-2 size-4" aria-hidden />
                Registrar un vehículo de este cliente
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
