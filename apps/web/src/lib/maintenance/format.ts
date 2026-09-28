import type { Schemas } from '@/lib/api/client';

export type Maintenance = Schemas['MaintenanceResponse'];
export type MaintenanceWithItems = Schemas['MaintenanceWithItemsResponse'];
export type MaintenanceType = Schemas['MaintenanceTypeResponse'];
export type MaintenanceWarning = Schemas['MaintenanceWarningResponse'];
export type CreateMaintenanceResult = Schemas['CreateMaintenanceResponse'];
/** Con su cobro (`sale`), o `null` si no tiene (R6, B-156). */
export type MaintenanceDetail = Schemas['MaintenanceDetailResponse'];
export type VoidMaintenanceResult = Schemas['VoidMaintenanceResponse'];
export type MaintenanceCharge = Schemas['MaintenanceChargeDto'];
export type DueRule = Schemas['DueRule'];

/** BR-M4: KM y DATE se infieren; ANY y ALL los elige el usuario cuando hay ambos. */
export const DUE_RULE_LABELS: Record<DueRule, string> = {
  KM: 'Por km',
  DATE: 'Por fecha',
  ANY: 'Lo primero que ocurra',
  ALL: 'Cuando ocurran ambos',
};

const dateFormat = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDate(value: string | null): string | null {
  return value ? dateFormat.format(new Date(value)) : null;
}

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value));
}

export function formatKm(value: number | null): string | null {
  return value === null ? null : `${value.toLocaleString('es-PE')} km`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Valor para `<input type="datetime-local">` con la hora local actual. */
export function nowForDateTimeInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** `YYYY-MM-DD` de un ISO, en hora local (para `<input type="date">`). */
export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * ISO de una fecha elegida en `<input type="date">`. Se fija al mediodía
 * local para que el cambio de zona horaria nunca la mueva de día.
 */
export function fromDateInput(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

/** Entero ≥ 0 (km); null si no es válido. */
export function parseKm(raw: string): number | null {
  const trimmed = raw.replace(/\s/g, '');
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** Regla que corresponde a lo ingresado (BR-M4); con ambos, la elegida por el usuario. */
export function inferredDueRule(hasKm: boolean, hasDate: boolean): DueRule | null {
  if (hasKm && !hasDate) return 'KM';
  if (hasDate && !hasKm) return 'DATE';
  return null;
}

export interface NextDueValues {
  nextDueKm: string;
  nextDueDate: string;
  /** Solo ANY/ALL: la elección del usuario cuando hay km y fecha. '' = sin elegir. */
  dueRule: '' | 'ANY' | 'ALL';
}

export type NextDueErrors = Partial<Record<keyof NextDueValues, string>>;

/**
 * Regla que se usará: con km y fecha, la elegida o, si no hay elección, el
 * valor por defecto del negocio (BR-M5); con uno solo, la inferida (BR-M4).
 */
export function effectiveDueRule(
  values: NextDueValues,
  businessDefault: DueRule | null,
): DueRule | null {
  const hasKm = values.nextDueKm.trim() !== '';
  const hasDate = values.nextDueDate !== '';
  if (hasKm && hasDate) {
    if (values.dueRule) return values.dueRule;
    return businessDefault === 'ANY' || businessDefault === 'ALL' ? businessDefault : null;
  }
  return inferredDueRule(hasKm, hasDate);
}
