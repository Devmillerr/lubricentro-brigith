import { ValidationProblemException } from '../common/exceptions/problem.exception';

/**
 * Períodos del dashboard (R7, DEC-79, BR-D1): el día operativo es el día
 * calendario en la zona horaria del negocio (`Business.timezone`), de 00:00 a
 * 24:00; la semana va de lunes a domingo y el mes es calendario. El rango se
 * devuelve como instantes UTC `[from, to)`, que es lo que se compara contra las
 * columnas `TIMESTAMP(3)` (Prisma guarda UTC).
 *
 * Sin dependencias: la conversión usa `Intl`, que trae la base de zonas
 * horarias de Node.
 */
export const DASHBOARD_PERIODS = ['today', 'week', 'month'] as const;
export type DashboardPeriodKind = (typeof DASHBOARD_PERIODS)[number];

export interface DashboardPeriod {
  kind: DashboardPeriodKind;
  /** Fecha local pedida (o hoy en la zona del negocio), `YYYY-MM-DD`. */
  date: string;
  /** Inicio incluido, UTC. */
  from: Date;
  /** Fin excluido, UTC. */
  to: Date;
  timezone: string;
  /** Tamaño de cada punto de la serie: por hora (Hoy) o por día (Semana, Mes). */
  bucket: 'hour' | 'day';
}

interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function formatLocalDate({ year, month, day }: LocalDate): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** `YYYY-MM-DD` de calendario real (rechaza 2026-02-30); si no, `null`. */
export function parseLocalDate(value: string): LocalDate | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Suma días de calendario (aritmética en UTC, sin horas de por medio). */
function addDays(date: LocalDate, days: number): LocalDate {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: probe.getUTCFullYear(), month: probe.getUTCMonth() + 1, day: probe.getUTCDate() };
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Fecha y hora de pared de `instant` en `timezone`. */
function wallClock(instant: Date, timezone: string) {
  const parts = Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return parts;
}

/** Diferencia (ms) entre la hora de pared en `timezone` y UTC en ese instante. */
function offsetMs(instant: Date, timezone: string): number {
  const p = wallClock(instant, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante UTC de las 00:00 locales de `date` en `timezone`. */
export function localMidnightUtc(date: LocalDate, timezone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day);
  const first = naive - offsetMs(new Date(naive), timezone);
  // Segunda pasada por si el desfase cambia entre la estimación y el resultado
  // (horario de verano). En America/Lima no cambia nunca.
  const second = naive - offsetMs(new Date(first), timezone);
  return new Date(second);
}

/** Fecha local de `instant` en `timezone`. */
export function localDateOf(instant: Date, timezone: string): LocalDate {
  const p = wallClock(instant, timezone);
  return { year: p.year, month: p.month, day: p.day };
}

/** Lanza `RangeError` si `timezone` no es una zona IANA válida. */
function assertTimezone(timezone: string): void {
  formatterFor(timezone);
}

export function resolveDashboardPeriod(
  input: { period?: DashboardPeriodKind; date?: string },
  timezone: string,
  now: Date = new Date(),
): DashboardPeriod {
  assertTimezone(timezone);
  const kind = input.period ?? 'today';
  if (!DASHBOARD_PERIODS.includes(kind)) {
    throw new ValidationProblemException([
      { field: 'period', message: 'El período debe ser today, week o month.' },
    ]);
  }

  let date: LocalDate;
  if (input.date === undefined) {
    date = localDateOf(now, timezone);
  } else {
    const parsed = parseLocalDate(input.date);
    if (!parsed) {
      throw new ValidationProblemException([
        { field: 'date', message: 'La fecha debe tener el formato YYYY-MM-DD y existir.' },
      ]);
    }
    date = parsed;
  }

  let first: LocalDate;
  let afterLast: LocalDate;
  if (kind === 'today') {
    first = date;
    afterLast = addDays(date, 1);
  } else if (kind === 'week') {
    // getUTCDay: 0 = domingo. Días desde el lunes: domingo → 6.
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    first = addDays(date, -((weekday + 6) % 7));
    afterLast = addDays(first, 7);
  } else {
    first = { year: date.year, month: date.month, day: 1 };
    const nextMonth = new Date(Date.UTC(date.year, date.month, 1));
    afterLast = { year: nextMonth.getUTCFullYear(), month: nextMonth.getUTCMonth() + 1, day: 1 };
  }

  return {
    kind,
    date: formatLocalDate(date),
    from: localMidnightUtc(first, timezone),
    to: localMidnightUtc(afterLast, timezone),
    timezone,
    bucket: kind === 'today' ? 'hour' : 'day',
  };
}

/**
 * Inicio (UTC) de cada punto de la serie, incluidos los vacíos. Por hora:
 * pasos de una hora desde `from`. Por día: la medianoche local de cada día.
 */
export function periodBuckets(period: DashboardPeriod): Date[] {
  const buckets: Date[] = [];
  if (period.bucket === 'hour') {
    for (let t = period.from.getTime(); t < period.to.getTime(); t += 3_600_000) {
      buckets.push(new Date(t));
    }
    return buckets;
  }
  let day = localDateOf(period.from, period.timezone);
  for (;;) {
    const start = localMidnightUtc(day, period.timezone);
    if (start.getTime() >= period.to.getTime()) break;
    buckets.push(start);
    day = addDays(day, 1);
  }
  return buckets;
}
