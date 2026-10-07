'use client';

import { Car, Pencil, Phone, Plus, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { EmptyState, PageSkeleton } from '@/components/ui/states';
import { Plate } from '@/components/ui/plate';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import {
  customerTitle,
  present,
  vehicleModelLabel,
  type Vehicle,
  type VehicleModel,
} from '@/lib/customers/format';

/** Ficha del cliente con sus vehículos (`GET /customers/{id}`). */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`customer:${id}`, () =>
    callApi(api.GET('/customers/{id}', { params: { path: { id } } })),
  );
  // El detalle trae `vehicleModelId`; el nombre del modelo sale de la lista de modelos.
  const models = useApiQuery('vehicle-models', () => callApi(api.GET('/vehicle-models')));

  if (query.status === 'loading') return <PageSkeleton label="Cargando cliente…" />;
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Cliente" back={{ href: '/clientes', label: 'Clientes' }} />
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{ title: 'Cliente no encontrado', href: '/clientes', label: 'Ver clientes' }}
        />
      </div>
    );
  }

  const customer = query.data;
  const phone = present(customer.phone);
  const notes = present(customer.notes);
  const modelById = new Map<string, VehicleModel>(
    models.status === 'success' ? models.data.map((model) => [model.id, model]) : [],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={customerTitle(customer)}
        subtitle={!customer.isActive ? <Badge>Inactivo</Badge> : undefined}
        back={{ href: '/clientes', label: 'Clientes' }}
        action={
          <Link
            href={`/clientes/${customer.id}/editar`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Pencil className="mr-1 size-4" aria-hidden />
            Editar
          </Link>
        }
      />

      <dl className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <div className="flex items-center gap-2">
          <Phone className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
          <dt className="sr-only">Teléfono</dt>
          <dd className={phone ? '' : 'text-[var(--muted-foreground)]'}>
            {phone ?? 'Sin teléfono'}
          </dd>
        </div>
        {notes && (
          <div className="flex flex-col gap-1">
            <dt className="text-[var(--muted-foreground)]">Notas</dt>
            <dd className="whitespace-pre-line">{notes}</dd>
          </div>
        )}
      </dl>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">
            Vehículos
            <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
              {customer.vehicles.length}
            </span>
          </h3>
          <Link href={`/clientes/${customer.id}/vehiculos/nuevo`} className={buttonVariants()}>
            <Plus className="mr-1 size-4" aria-hidden />
            Registrar
          </Link>
        </div>

        {customer.vehicles.length === 0 ? (
          <EmptyState
            icon={Car}
            title="Sin vehículos registrados"
            description="Para registrar un mantenimiento, primero registra su vehículo con la placa; el resto de datos es opcional."
            action={
              <Link
                href={`/clientes/${customer.id}/vehiculos/nuevo?siguiente=mantenimiento`}
                className={buttonVariants({ variant: 'outline' })}
              >
                <Wrench className="mr-2 size-4" aria-hidden />
                Registrar vehículo y mantenimiento
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {customer.vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                model={vehicle.vehicleModelId ? modelById.get(vehicle.vehicleModelId) : undefined}
                modelsLoading={models.status === 'loading'}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function VehicleCard({
  vehicle,
  model,
  modelsLoading,
}: {
  vehicle: Vehicle;
  model: VehicleModel | undefined;
  modelsLoading: boolean;
}) {
  const details = [vehicle.year ? String(vehicle.year) : null, present(vehicle.color)].filter(
    Boolean,
  );
  const notes = present(vehicle.notes);
  const modelText = model
    ? vehicleModelLabel(model)
    : vehicle.vehicleModelId
      ? modelsLoading
        ? 'Cargando modelo…'
        : 'Modelo no disponible'
      : 'Sin modelo';

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/vehiculos/${vehicle.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:bg-[var(--muted)]"
        >
          <Car className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
          <div className="flex min-w-0 flex-col gap-1">
            <Plate plate={vehicle.plate} className="self-start" />
            <span className={model ? 'text-sm' : 'text-sm text-[var(--muted-foreground)]'}>
              {modelText}
            </span>
          </div>
        </Link>
        <Link
          href={`/vehiculos/${vehicle.id}/editar`}
          className={buttonVariants({ variant: 'outline', className: 'h-10 shrink-0 px-3' })}
          aria-label={`Editar vehículo ${vehicle.plate}`}
        >
          <Pencil className="size-4" aria-hidden />
        </Link>
      </div>
      {(details.length > 0 || !vehicle.isActive) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
          {details.length > 0 && <span>{details.join(' · ')}</span>}
          {!vehicle.isActive && <Badge>Inactivo</Badge>}
        </div>
      )}
      {notes && <p className="text-sm whitespace-pre-line">{notes}</p>}
      <Link
        href={`/vehiculos/${vehicle.id}/mantenimientos/nuevo`}
        className={buttonVariants({ className: 'mt-1' })}
      >
        <Wrench className="mr-2 size-4" aria-hidden />
        Nuevo mantenimiento
      </Link>
    </li>
  );
}
