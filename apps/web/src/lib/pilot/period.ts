import type { Schemas } from '@/lib/api/client';

export type PilotIndicators = Schemas['PilotIndicatorsResponse'];

export type PeriodPreset = 'month' | 'last7' | 'last30' | 'all' | 'custom';

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  month: 'Este mes',
  last7: 'Últimos 7 días',
  last30: 'Últimos 30 días',
  all: 'Todo',
  custom: 'Elegir fechas',
};

/** Rango para `GET /pilot-indicators` (ISO 8601; límites inclusivos; null = sin límite). */
export interface Period {
  from: string | null;
  to: string | null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** `YYYY-MM-DD` de `<input type="date">` → fecha local. */
function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

/**
 * Rango en hora local. El fin es el final del día para que el último día
 * cuente completo (la API compara `fecha <= to`).
 */
export function periodFor(
  preset: PeriodPreset,
  custom: { from: string; to: string },
  now: Date,
): Period {
  switch (preset) {
    case 'month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: endOfDay(now).toISOString(),
      };
    case 'last7':
    case 'last30': {
      const days = preset === 'last7' ? 6 : 29;
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
      return { from: from.toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'all':
      return { from: null, to: null };
    case 'custom':
      return {
        from: custom.from ? startOfDay(parseDateInput(custom.from)).toISOString() : null,
        to: custom.to ? endOfDay(parseDateInput(custom.to)).toISOString() : null,
      };
  }
}

const dayFormat = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' });

export function describePeriod(period: Period): string {
  if (!period.from && !period.to) return 'Todo el historial';
  if (period.from && period.to) {
    return `${dayFormat.format(new Date(period.from))} – ${dayFormat.format(new Date(period.to))}`;
  }
  if (period.from) return `Desde el ${dayFormat.format(new Date(period.from))}`;
  return `Hasta el ${dayFormat.format(new Date(period.to!))}`;
}

/** true si no hubo ninguna actividad contada en el período. */
export function isEmptyPeriod(indicators: PilotIndicators): boolean {
  return (
    indicators.adoption.activeMaintenances === 0 &&
    indicators.maintenance.maintenancesWithNextDue === 0 &&
    indicators.maintenance.remindersOpenedInWhatsApp === 0 &&
    indicators.inventory.totalMovements === 0
  );
}
