'use client';

import { CarFront } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MaintenanceForm, type SavedMaintenance } from '@/components/maintenance/maintenance-form';
import { MaintenanceSaved } from '@/components/maintenance/maintenance-saved';
import { VehicleFinder } from '@/components/maintenance/vehicle-finder';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/states';

/**
 * Nuevo mantenimiento desde Inicio (Fase 2). Primero se identifica el
 * vehículo, por placa o por cliente, y se sigue al formulario del vehículo
 * (`/vehiculos/{id}/mantenimientos/nuevo`): el cliente queda asociado a través
 * del vehículo. "Sin vehículo" (R6, DEC-31, DEC-73: sin km, próximo
 * mantenimiento ni recordatorio) queda como opción secundaria, con
 * `?sinVehiculo=1`.
 */
export default function NewMaintenancePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewMaintenance />
    </Suspense>
  );
}

function NewMaintenance() {
  const withoutVehicle = useSearchParams().get('sinVehiculo') === '1';
  return withoutVehicle ? <WithoutVehicle /> : <ChooseVehicle />;
}

function ChooseVehicle() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Nuevo mantenimiento"
        subtitle="Elige el vehículo: el mantenimiento queda en su historial y en el de su cliente."
        back={{ href: '/dashboard', label: 'Inicio' }}
      />
      <VehicleFinder />
      <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-4">
        <Link
          href="/mantenimientos/nuevo?sinVehiculo=1"
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold underline underline-offset-4"
        >
          <CarFront className="size-4" aria-hidden />
          Registrar sin vehículo
        </Link>
        <p className="text-xs text-[var(--muted-foreground)]">
          Solo si el vehículo no se va a registrar: queda sin km, sin próximo mantenimiento y sin
          recordatorio.
        </p>
      </div>
    </div>
  );
}

function WithoutVehicle() {
  const [saved, setSaved] = useState<SavedMaintenance | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Nuevo mantenimiento"
        subtitle="Sin vehículo"
        back={{ href: '/mantenimientos/nuevo', label: 'Elegir vehículo' }}
      />
      {saved ? (
        <MaintenanceSaved saved={saved} vehicleId={null} />
      ) : (
        <MaintenanceForm vehicleId={null} lastKnownKm={null} onSaved={setSaved} />
      )}
    </div>
  );
}
