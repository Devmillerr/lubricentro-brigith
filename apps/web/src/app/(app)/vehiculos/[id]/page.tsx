'use client';

import { Pencil, Phone, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { MaintenanceList } from '@/components/maintenance/maintenance-list';
import { buttonVariants } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle, present, vehicleModelLabel } from '@/lib/customers/format';
import { DUE_RULE_LABELS, formatDate, formatKm } from '@/lib/maintenance/format';

/**
 * Ficha del vehículo (07-UI-UX.md §3.2): placa, modelo, cliente, último km
 * conocido y próximo mantenimiento (de `GET /vehicles/lookup`), productos
 * compatibles e historial. Acción principal: Nuevo mantenimiento.
 */
export default function VehiclePage() {
  const { id } = useParams<{ id: string }>();
  const vehicle = useApiQuery(`vehicle:${id}`, () =>
    callApi(api.GET('/vehicles/{id}', { params: { path: { id } } })),
  );
  const plate = vehicle.status === 'success' ? vehicle.data.plate : null;
  // El último km y el último mantenimiento los calcula la API en lookup, por placa.
  const lookup = useApiQuery(plate ? `vehicle-lookup:${plate}` : null, () =>
    callApi(api.GET('/vehicles/lookup', { params: { query: { plate: plate! } } })),
  );
  const history = useApiQuery(`vehicle-maintenances:${id}`, () =>
    callApi(api.GET('/vehicles/{id}/maintenances', { params: { path: { id } } })),
  );
  const compatible = useApiQuery(`vehicle-compatible:${id}`, () =>
    callApi(api.GET('/vehicles/{id}/compatible-products', { params: { path: { id } } })),
  );
  const types = useApiQuery('maintenance-types', () => callApi(api.GET('/maintenance-types')));

  if (vehicle.status === 'loading') return <LoadingState />;
  if (vehicle.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Vehículo" back={{ href: '/clientes', label: 'Clientes' }} />
        <QueryError
          failure={vehicle.failure}
          onRetry={vehicle.reload}
          notFound={{ title: 'Vehículo no encontrado', href: '/clientes', label: 'Ver clientes' }}
        />
      </div>
    );
  }

  const data = vehicle.data;
  const summary =
    lookup.status === 'success' ? lookup.data.find((item) => item.id === data.id) : undefined;
  const last = summary?.lastMaintenance ?? null;
  const back = data.customer
    ? { href: `/clientes/${data.customer.id}`, label: customerTitle(data.customer) }
    : { href: '/clientes', label: 'Clientes' };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.plate}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {data.vehicleModel ? vehicleModelLabel(data.vehicleModel) : 'Sin modelo'}
            {data.year ? ` · ${data.year}` : ''}
            {present(data.color) ? ` · ${data.color}` : ''}
            {!data.isActive && <Badge>Inactivo</Badge>}
          </span>
        }
        back={back}
        action={
          <Link
            href={`/vehiculos/${data.id}/editar`}
            className={buttonVariants({ variant: 'outline' })}
            aria-label="Editar vehículo"
          >
            <Pencil className="size-4" aria-hidden />
          </Link>
        }
      />

      <Link
        href={`/vehiculos/${data.id}/mantenimientos/nuevo`}
        className={buttonVariants({ size: 'lg' })}
      >
        <Plus className="mr-2 size-5" aria-hidden />
        Nuevo mantenimiento
      </Link>

      <dl className="grid gap-3 rounded-lg border border-[var(--border)] p-4 text-sm">
        <Row icon={<User className="size-4" aria-hidden />} label="Cliente">
          {data.customer ? (
            <Link
              href={`/clientes/${data.customer.id}`}
              className="underline-offset-4 hover:underline"
            >
              {customerTitle(data.customer)}
            </Link>
          ) : null}
        </Row>
        <Row icon={<Phone className="size-4" aria-hidden />} label="Teléfono">
          {present(data.customer?.phone)}
        </Row>
        <Row label="Último km conocido">
          {lookup.status === 'loading' ? 'Cargando…' : formatKm(summary?.lastKnownKm ?? null)}
        </Row>
        <Row label="Próximo mantenimiento">
          {lookup.status === 'loading' ? (
            'Cargando…'
          ) : last && (last.nextDueKm !== null || last.nextDueDate) ? (
            <span className="flex flex-col">
              {last.nextDueKm !== null && <span>{formatKm(last.nextDueKm)}</span>}
              {last.nextDueDate && <span>{formatDate(last.nextDueDate)}</span>}
              {last.dueRule && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  {DUE_RULE_LABELS[last.dueRule]}
                </span>
              )}
            </span>
          ) : null}
        </Row>
      </dl>
      {lookup.status === 'error' && (
        <p className="-mt-4 text-sm text-[var(--danger)]">
          No se pudo cargar el último km.{' '}
          <button type="button" onClick={lookup.reload} className="underline">
            Reintentar
          </button>
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Historial</h3>
        {history.status === 'loading' && <LoadingState label="Cargando historial…" />}
        {history.status === 'error' && (
          <ErrorState message={failureMessage(history.failure)} onRetry={history.reload} />
        )}
        {history.status === 'success' &&
          (history.data.length === 0 ? (
            <EmptyState
              title="Sin mantenimientos"
              description="Registra el primero con «Nuevo mantenimiento»."
            />
          ) : (
            <MaintenanceList
              maintenances={history.data}
              types={types.status === 'success' ? types.data : []}
            />
          ))}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Productos compatibles</h3>
        {compatible.status === 'loading' && <LoadingState label="Cargando…" />}
        {compatible.status === 'error' && (
          <ErrorState message={failureMessage(compatible.failure)} onRetry={compatible.reload} />
        )}
        {compatible.status === 'success' &&
          (compatible.data.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {data.vehicleModelId
                ? 'Todavía no hay productos marcados como compatibles con este modelo.'
                : 'Asigna un modelo al vehículo para ver sus productos compatibles.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {compatible.data.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/productos/${product.id}`}
                    className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--muted)]"
                  >
                    <span className="truncate">{product.name}</span>
                    {!product.isActive && <Badge>Inactivo</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}

function Row({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-2 text-[var(--muted-foreground)]">
        {icon}
        {label}
      </dt>
      <dd className={children ? 'text-right' : 'text-right text-[var(--muted-foreground)]'}>
        {children ?? '—'}
      </dd>
    </div>
  );
}
