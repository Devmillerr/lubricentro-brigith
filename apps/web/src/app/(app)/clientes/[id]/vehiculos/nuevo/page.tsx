'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { VehicleForm } from '@/components/vehicles/vehicle-form';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle } from '@/lib/customers/format';

/**
 * Registrar un vehículo de este cliente (`POST /vehicles` con `customerId`).
 * `?siguiente=mantenimiento` (desde "Nuevo mantenimiento") sigue al
 * mantenimiento del vehículo al guardarlo.
 */
export default function NewVehiclePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewVehicle />
    </Suspense>
  );
}

function NewVehicle() {
  const { id } = useParams<{ id: string }>();
  const thenMaintenance = useSearchParams().get('siguiente') === 'mantenimiento';
  const query = useApiQuery(`customer:${id}`, () =>
    callApi(api.GET('/customers/{id}', { params: { path: { id } } })),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Registrar vehículo"
        subtitle={query.status === 'success' ? customerTitle(query.data) : undefined}
        back={{ href: `/clientes/${id}`, label: 'Volver al cliente' }}
      />
      {query.status === 'loading' && <LoadingState />}
      {query.status === 'error' && (
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{ title: 'Cliente no encontrado', href: '/clientes', label: 'Ver clientes' }}
        />
      )}
      {query.status === 'success' && (
        <VehicleForm mode="create" customerId={query.data.id} thenMaintenance={thenMaintenance} />
      )}
    </div>
  );
}
