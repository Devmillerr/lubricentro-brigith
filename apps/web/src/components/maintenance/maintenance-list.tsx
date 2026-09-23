import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/page-header';
import {
  formatDate,
  formatKm,
  type MaintenanceType,
  type MaintenanceWithItems,
} from '@/lib/maintenance/format';

/** Historial de mantenimientos de un vehículo (del más reciente al más antiguo, como la API). */
export function MaintenanceList({
  maintenances,
  types,
}: {
  maintenances: MaintenanceWithItems[];
  types: MaintenanceType[];
}) {
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? 'Mantenimiento';

  return (
    <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
      {maintenances.map((maintenance) => {
        const details = [
          formatKm(maintenance.odometerKm),
          maintenance.items.length > 0
            ? `${maintenance.items.length} producto${maintenance.items.length === 1 ? '' : 's'}`
            : null,
        ].filter(Boolean);
        const voided = maintenance.status === 'VOIDED';
        return (
          <li key={maintenance.id}>
            <Link
              href={`/mantenimientos/${maintenance.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
            >
              <span className={`flex min-w-0 flex-1 flex-col ${voided ? 'opacity-60' : ''}`}>
                <span className="truncate font-medium">
                  {typeName(maintenance.maintenanceTypeId)}
                </span>
                <span className="truncate text-sm text-[var(--muted-foreground)]">
                  {[formatDate(maintenance.performedAt), ...details].join(' · ')}
                </span>
              </span>
              {voided && <Badge>Anulado</Badge>}
              <ChevronRight
                className="size-5 shrink-0 text-[var(--muted-foreground)]"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
