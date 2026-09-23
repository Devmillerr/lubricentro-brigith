import type { ReactNode } from 'react';
import { MOVEMENT_LABELS, type MovementType } from '@/lib/inventory/format';
import type { PilotIndicators } from '@/lib/pilot/period';

/** Tipos con punto de entrada en el MVP (BR-P4); las ventas (DEC-24) solo si hay alguna. */
const MVP_MOVEMENT_TYPES: MovementType[] = [
  'COUNT',
  'PURCHASE_IN',
  'MAINTENANCE_USE',
  'MAINTENANCE_VOID',
  'ADJUSTMENT',
];

/**
 * Los tres indicadores del piloto (BR-I1 a BR-I3), como conteos del período.
 * Sin metas, porcentajes ni colores de estado: los umbrales de éxito se
 * acuerdan con Brigith durante el piloto (BR-I4, pendiente).
 */
export function IndicatorsView({ indicators }: { indicators: PilotIndicators }) {
  const { adoption, maintenance, inventory } = indicators;
  const movementTypes = [
    ...MVP_MOVEMENT_TYPES,
    ...(['SALE', 'SALE_VOID'] as const).filter((type) => inventory.movementsByType[type] > 0),
  ];

  return (
    <div className="flex flex-col gap-5">
      <IndicatorSection title="Uso del sistema">
        <Figure
          value={adoption.activeMaintenances}
          label="Mantenimientos registrados"
          help="No cuenta los anulados."
        />
      </IndicatorSection>

      <IndicatorSection title="Mantenimiento y avisos">
        <Figure
          value={maintenance.maintenancesWithNextDue}
          label="Con próximo km o fecha"
          help="Mantenimientos del período que dejaron programado el siguiente."
        />
        <Figure
          value={maintenance.remindersOpenedInWhatsApp}
          label="Avisos abiertos en WhatsApp"
          help="Veces que se abrió un aviso; el sistema no sabe si se envió."
        />
      </IndicatorSection>

      <IndicatorSection title="Inventario">
        <Figure
          value={inventory.totalMovements}
          label="Movimientos de stock"
          help="Conteos, ingresos, usos en mantenimientos, anulaciones y ajustes."
        />
        <Figure
          value={inventory.productsCountedAndMovedInPeriod}
          label="Productos con conteo y movimientos"
          help="Productos contados alguna vez que tuvieron movimientos en el período."
        />
        <div className="col-span-full flex flex-col gap-1.5 rounded-md bg-[var(--muted)] p-3 text-sm">
          <span className="font-medium">Movimientos por tipo</span>
          {movementTypes.map((type) => (
            <div key={type} className="flex items-baseline justify-between gap-3">
              <span className="text-[var(--muted-foreground)]">{MOVEMENT_LABELS[type]}</span>
              <span className="font-medium tabular-nums">
                {inventory.movementsByType[type].toLocaleString('es-PE')}
              </span>
            </div>
          ))}
        </div>
      </IndicatorSection>
    </div>
  );
}

function IndicatorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function Figure({ value, label, help }: { value: number; label: string; help?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--border)] p-4">
      <span className="text-3xl font-semibold tabular-nums">{value.toLocaleString('es-PE')}</span>
      <span className="text-sm font-medium">{label}</span>
      {help && <span className="text-xs text-[var(--muted-foreground)]">{help}</span>}
    </div>
  );
}
