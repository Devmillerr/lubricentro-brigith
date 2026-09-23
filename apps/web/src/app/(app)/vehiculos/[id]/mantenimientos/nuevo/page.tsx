'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MaintenanceForm, type SavedMaintenance } from '@/components/maintenance/maintenance-form';
import { MaintenanceSaved } from '@/components/maintenance/maintenance-saved';
import { PageHeader } from '@/components/ui/page-header';
import { QueryError } from '@/components/ui/query-error';
import { LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { customerTitle, vehicleModelLabel } from '@/lib/customers/format';

/** Nuevo mantenimiento (07-UI-UX.md §3.3), con el vehículo ya elegido. */
export default function NewMaintenancePage() {
  const { id } = useParams<{ id: string }>();
  const vehicle = useApiQuery(`vehicle:${id}`, () =>
    callApi(api.GET('/vehicles/{id}', { params: { path: { id } } })),
  );
  const plate = vehicle.status === 'success' ? vehicle.data.plate : null;
  const lookup = useApiQuery(plate ? `vehicle-lookup:${plate}` : null, () =>
    callApi(api.GET('/vehicles/lookup', { params: { query: { plate: plate! } } })),
  );
  const [saved, setSaved] = useState<SavedMaintenance | null>(null);

  const back = { href: `/vehiculos/${id}`, label: 'Volver al vehículo' };

  if (vehicle.status === 'loading') return <LoadingState />;
  if (vehicle.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Nuevo mantenimiento" back={back} />
        <QueryError
          failure={vehicle.failure}
          onRetry={vehicle.reload}
          notFound={{ title: 'Vehículo no encontrado', href: '/clientes', label: 'Ver clientes' }}
        />
      </div>
    );
  }

  const data = vehicle.data;
  const subtitle = [
    data.plate,
    data.vehicleModel ? vehicleModelLabel(data.vehicleModel) : null,
    data.customer ? customerTitle(data.customer) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const lastKnownKm =
    lookup.status === 'success'
      ? (lookup.data.find((item) => item.id === data.id)?.lastKnownKm ?? null)
      : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={saved ? 'Mantenimiento registrado' : 'Nuevo mantenimiento'}
        subtitle={subtitle}
        back={back}
      />
      {saved ? (
        <MaintenanceSaved saved={saved} vehicleId={data.id} />
      ) : (
        <MaintenanceForm vehicleId={data.id} lastKnownKm={lastKnownKm} onSaved={setSaved} />
      )}
    </div>
  );
}
