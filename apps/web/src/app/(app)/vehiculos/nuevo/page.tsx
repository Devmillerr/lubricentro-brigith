'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/states';
import { VehicleForm } from '@/components/vehicles/vehicle-form';

/**
 * Registrar un vehículo sin cliente (BR-C4), desde "Crear vehículo con esta
 * placa" del Inicio (07-UI-UX.md §3.1) o desde "Nuevo mantenimiento".
 * `?placa=` precarga la placa buscada; `?siguiente=mantenimiento` sigue al
 * mantenimiento del vehículo al guardarlo.
 */
export default function NewVehicleWithoutCustomerPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Registrar vehículo" back={{ href: '/dashboard', label: 'Inicio' }} />
      <Suspense fallback={<LoadingState />}>
        <Form />
      </Suspense>
    </div>
  );
}

function Form() {
  const params = useSearchParams();
  const plate = params.get('placa') ?? '';
  return (
    <VehicleForm
      mode="create"
      customerId={null}
      initialPlate={plate}
      thenMaintenance={params.get('siguiente') === 'mantenimiento'}
    />
  );
}
