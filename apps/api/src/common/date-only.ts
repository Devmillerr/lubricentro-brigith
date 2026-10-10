import { formatLocalDate, localDateOf, parseLocalDate } from '../dashboard/dashboard-period';

/** `YYYY-MM-DD` (el calendario se valida aparte con {@link isDateOnly}). */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fechas sin hora (`@db.Date`) de R8 (DEC-101): la API las recibe y devuelve
 * como texto `YYYY-MM-DD`; hacia la base viajan como la medianoche UTC de ese
 * día y se leen con los componentes UTC. Probado en F0 con Node y Postgres en
 * UTC y en America/Lima: el día se conserva. Nunca se usan métodos de hora
 * local sobre estas fechas.
 */
export function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` válido en el calendario (rechaza 2026-02-30). */
export function isDateOnly(value: string): boolean {
  return parseLocalDate(value) !== null;
}

/** Día de un instante en la zona del negocio, como `YYYY-MM-DD`. */
export function localDateString(instant: Date, timezone: string): string {
  return formatLocalDate(localDateOf(instant, timezone));
}

/** Suma días calendario a una fecha `YYYY-MM-DD` (sin horarios ni cambios de hora). */
export function addDays(value: string, days: number): string {
  return fromDbDate(new Date(toDbDate(value).getTime() + days * 86_400_000));
}
