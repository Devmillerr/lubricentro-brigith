'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { VehicleForm } from '@/components/vehicles/vehicle-form';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle } from '@/lib/customers/format';

/** Editar un vehículo (`GET /vehicles/{id}` + `PATCH /vehicles/{id}`). */
export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const query = useApiQuery(`vehicle:${id}`, () =>
    callApi(api.GET('/vehicles/{id}', { params: { path: { id } } })),
  );

  const customer = query.status === 'success' ? query.data.customer : null;
  const back = customer
    ? { href: `/clientes/${customer.id}`, label: customerTitle(customer) }
    : { href: '/clientes', label: 'Clientes' };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Editar vehículo"
        subtitle={query.status === 'success' ? query.data.plate : undefined}
        back={back}
      />
      {query.status === 'loading' && <LoadingState />}
      {query.status === 'error' && (
        <QueryError
          failure={query.failure}
          onRetry={query.reload}
          notFound={{ title: 'Vehículo no encontrado', href: '/clientes', label: 'Ver clientes' }}
        />
      )}
      {query.status === 'success' && <VehicleForm mode="edit" vehicle={query.data} />}
    </div>
  );
}
