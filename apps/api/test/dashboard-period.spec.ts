import {
  localMidnightUtc,
  parseLocalDate,
  periodBuckets,
  resolveDashboardPeriod,
} from '../src/dashboard/dashboard-period';
import { ValidationProblemException } from '../src/common/exceptions/problem.exception';

/**
 * Períodos del dashboard (R7, DEC-79, BR-D1). America/Lima es UTC−5 todo el
 * año: las 00:00 locales son las 05:00 UTC. 2026-09-28 es lunes.
 */
const LIMA = 'America/Lima';

function iso(date: Date) {
  return date.toISOString();
}

describe('resolveDashboardPeriod', () => {
  it('today: [00:00, 24:00) de Lima en UTC, por hora', () => {
    const period = resolveDashboardPeriod({ period: 'today', date: '2026-09-28' }, LIMA);
    expect(period).toMatchObject({
      kind: 'today',
      date: '2026-09-28',
      timezone: LIMA,
      bucket: 'hour',
    });
    expect(iso(period.from)).toBe('2026-09-28T05:00:00.000Z');
    expect(iso(period.to)).toBe('2026-09-29T05:00:00.000Z');
  });

  it('sin period: today', () => {
    expect(resolveDashboardPeriod({ date: '2026-09-28' }, LIMA).kind).toBe('today');
  });

  it('sin date: hoy en Lima, no en UTC (23:30 de Lima ya es el día siguiente en UTC)', () => {
    // 2026-09-29T04:30Z = 2026-09-28 23:30 en Lima.
    const lateNight = resolveDashboardPeriod({}, LIMA, new Date('2026-09-29T04:30:00Z'));
    expect(lateNight.date).toBe('2026-09-28');
    // 2026-09-29T05:10Z = 2026-09-29 00:10 en Lima.
    const afterMidnight = resolveDashboardPeriod({}, LIMA, new Date('2026-09-29T05:10:00Z'));
    expect(afterMidnight.date).toBe('2026-09-29');
  });

  it('23:30 de Lima cae dentro del día; 00:10 del día siguiente, fuera', () => {
    const period = resolveDashboardPeriod({ period: 'today', date: '2026-09-28' }, LIMA);
    const at2330 = new Date('2026-09-29T04:30:00Z');
    const at0010 = new Date('2026-09-29T05:10:00Z');
    expect(at2330 >= period.from && at2330 < period.to).toBe(true);
    expect(at0010 >= period.from && at0010 < period.to).toBe(false);
  });

  it.each([
    ['2026-09-28', 'lunes'],
    ['2026-10-01', 'jueves'],
    ['2026-10-04', 'domingo'],
  ])('week: %s (%s) → lunes 28 a domingo 4, por día', (date) => {
    const period = resolveDashboardPeriod({ period: 'week', date }, LIMA);
    expect(period.bucket).toBe('day');
    expect(iso(period.from)).toBe('2026-09-28T05:00:00.000Z');
    expect(iso(period.to)).toBe('2026-10-05T05:00:00.000Z');
  });

  it('week que cruza el año: jueves 2026-12-31 → lunes 28 dic a lunes 4 ene', () => {
    const period = resolveDashboardPeriod({ period: 'week', date: '2026-12-31' }, LIMA);
    expect(iso(period.from)).toBe('2026-12-28T05:00:00.000Z');
    expect(iso(period.to)).toBe('2027-01-04T05:00:00.000Z');
  });

  it('month: mes calendario', () => {
    const period = resolveDashboardPeriod({ period: 'month', date: '2026-09-15' }, LIMA);
    expect(iso(period.from)).toBe('2026-09-01T05:00:00.000Z');
    expect(iso(period.to)).toBe('2026-10-01T05:00:00.000Z');
  });

  it('month: diciembre termina en enero; febrero bisiesto tiene 29 días', () => {
    const december = resolveDashboardPeriod({ period: 'month', date: '2026-12-31' }, LIMA);
    expect(iso(december.to)).toBe('2027-01-01T05:00:00.000Z');
    const leap = resolveDashboardPeriod({ period: 'month', date: '2028-02-10' }, LIMA);
    expect(periodBuckets(leap)).toHaveLength(29);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-9-1', '28/09/2026', '2026-09-28T00:00', ''])(
    'date inválida %p → 400 VALIDATION_ERROR en "date"',
    (date) => {
      expect.assertions(2);
      try {
        resolveDashboardPeriod({ period: 'today', date }, LIMA);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationProblemException);
        expect((error as ValidationProblemException).errors?.[0]?.field).toBe('date');
      }
    },
  );

  it('period inválido → 400 VALIDATION_ERROR en "period"', () => {
    expect.assertions(2);
    try {
      resolveDashboardPeriod({ period: 'year' as never, date: '2026-09-28' }, LIMA);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationProblemException);
      expect((error as ValidationProblemException).errors?.[0]?.field).toBe('period');
    }
  });

  it('zona horaria inválida en el negocio → error (dato corrupto, no validación)', () => {
    expect(() => resolveDashboardPeriod({}, 'Mars/Olympus')).toThrow(RangeError);
  });

  it('usa la zona del negocio, no una fija: Madrid en horario de verano es UTC+2', () => {
    const period = resolveDashboardPeriod({ period: 'today', date: '2026-07-01' }, 'Europe/Madrid');
    expect(iso(period.from)).toBe('2026-06-30T22:00:00.000Z');
  });
});

describe('periodBuckets', () => {
  it('today: 24 horas desde las 00:00 locales', () => {
    const buckets = periodBuckets(resolveDashboardPeriod({ date: '2026-09-28' }, LIMA));
    expect(buckets).toHaveLength(24);
    expect(iso(buckets[0]!)).toBe('2026-09-28T05:00:00.000Z');
    expect(iso(buckets[23]!)).toBe('2026-09-29T04:00:00.000Z');
  });

  it('week: 7 días que empiezan en lunes; month: los días del mes', () => {
    const week = periodBuckets(
      resolveDashboardPeriod({ period: 'week', date: '2026-10-01' }, LIMA),
    );
    expect(week.map(iso)).toEqual([
      '2026-09-28T05:00:00.000Z',
      '2026-09-29T05:00:00.000Z',
      '2026-09-30T05:00:00.000Z',
      '2026-10-01T05:00:00.000Z',
      '2026-10-02T05:00:00.000Z',
      '2026-10-03T05:00:00.000Z',
      '2026-10-04T05:00:00.000Z',
    ]);
    const month = periodBuckets(
      resolveDashboardPeriod({ period: 'month', date: '2026-09-01' }, LIMA),
    );
    expect(month).toHaveLength(30);
  });

  it('día con cambio de hora (Nueva York, 8 de marzo de 2026): 23 horas', () => {
    const period = resolveDashboardPeriod({ date: '2026-03-08' }, 'America/New_York');
    expect(periodBuckets(period)).toHaveLength(23);
  });
});

describe('helpers de fecha', () => {
  it('parseLocalDate rechaza fechas que no existen', () => {
    expect(parseLocalDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseLocalDate('2026-02-29')).toBeNull();
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('localMidnightUtc en Lima = 05:00 UTC', () => {
    expect(iso(localMidnightUtc({ year: 2026, month: 1, day: 1 }, LIMA))).toBe(
      '2026-01-01T05:00:00.000Z',
    );
  });
});
