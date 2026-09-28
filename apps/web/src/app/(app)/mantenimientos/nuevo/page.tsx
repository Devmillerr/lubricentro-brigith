'use client';

import { useState } from 'react';
import { MaintenanceForm, type SavedMaintenance } from '@/components/maintenance/maintenance-form';
import { MaintenanceSaved } from '@/components/maintenance/maintenance-saved';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Nuevo mantenimiento sin vehículo (R6, DEC-31, DEC-73): sin km, próximo
 * mantenimiento ni recordatorio. Con vehículo se entra desde su ficha
 * (`/vehiculos/{id}/mantenimientos/nuevo`).
 */
export default function NewMaintenanceWithoutVehiclePage() {
  const [saved, setSaved] = useState<SavedMaintenance | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={saved ? 'Mantenimiento registrado' : 'Nuevo mantenimiento'}
        subtitle="Sin vehículo"
        back={{ href: '/dashboard', label: 'Inicio' }}
      />
      {saved ? (
        <MaintenanceSaved saved={saved} vehicleId={null} />
      ) : (
        <MaintenanceForm vehicleId={null} lastKnownKm={null} onSaved={setSaved} />
      )}
    </div>
  );
}
