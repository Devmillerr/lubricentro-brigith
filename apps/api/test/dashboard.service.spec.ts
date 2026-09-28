import { resolveDashboardPeriod } from '../src/dashboard/dashboard-period';
import { buildDashboard, type DashboardRows } from '../src/dashboard/dashboard.service';

/**
 * Armado de la respuesta de `GET /dashboard` (R7, B-160/B-161) sin base: las
 * agregaciones SQL se prueban contra Postgres en
 * `test/integration/dashboard.int-spec.ts` (el fake no ejecuta `$queryRaw`).
 */
const LIMA = 'America/Lima';

const zeroRows = (): DashboardRows => ({
  money: {
    salesCount: 0,
    washCount: 0,
    total: '0',
    cash: '0',
    yape: '0',
    counter: '0',
    wash: '0',
    maintenance: '0',
  },
  washTypes: [],
  maintenances: { count: 0, charged: 0 },
  productsSold: { units: '0' },
  topProducts: [],
  series: [],
});

describe('buildDashboard', () => {
  it('período vacío: todo en cero y la serie con sus 24 horas en cero', () => {
    const period = resolveDashboardPeriod({ date: '2026-09-28' }, LIMA);
    const dashboard = buildDashboard(period, zeroRows());

    expect(dashboard.period).toEqual({
      kind: 'today',
      date: '2026-09-28',
      from: '2026-09-28T05:00:00.000Z',
      to: '2026-09-29T05:00:00.000Z',
      timezone: LIMA,
    });
    expect(dashboard.totals).toEqual({
      total: '0',
      cash: '0',
      yape: '0',
      salesCount: 0,
      bySource: { counter: '0', wash: '0', maintenance: '0' },
    });
    expect(dashboard.washes).toEqual({ count: 0, amount: '0', byType: [] });
    expect(dashboard.maintenances).toEqual({ count: 0, charged: 0, uncharged: 0 });
    expect(dashboard.productsSold).toEqual({ units: '0' });
    expect(dashboard.topProducts).toEqual([]);
    expect(dashboard.series).toHaveLength(24);
    expect(
      dashboard.series.every((p) => p.counter === '0' && p.wash === '0' && p.maintenance === '0'),
    ).toBe(true);
  });

  it('montos como string decimal, sin pasar por float, normalizados como en /sales', () => {
    const period = resolveDashboardPeriod({ date: '2026-09-28' }, LIMA);
    const rows = zeroRows();
    rows.money = {
      salesCount: 3,
      washCount: 1,
      // 0.1 + 0.2 en float sería 0.30000000000000004.
      total: '12345678.30',
      cash: '0.10',
      yape: '12345678.20',
      counter: '12345678.20',
      wash: '0.10',
      maintenance: '0.00',
    };
    const dashboard = buildDashboard(period, rows);

    expect(dashboard.totals.total).toBe('12345678.3');
    expect(dashboard.totals.cash).toBe('0.1');
    expect(dashboard.totals.yape).toBe('12345678.2');
    expect(dashboard.totals.bySource).toEqual({
      counter: '12345678.2',
      wash: '0.1',
      maintenance: '0',
    });
    expect(dashboard.washes.amount).toBe('0.1');
    for (const value of [dashboard.totals.total, dashboard.totals.cash, dashboard.washes.amount]) {
      expect(typeof value).toBe('string');
    }
  });

  it('mantenimientos: uncharged = count − charged (el cobro no suma otro mantenimiento)', () => {
    const period = resolveDashboardPeriod({ date: '2026-09-28' }, LIMA);
    const rows = zeroRows();
    rows.maintenances = { count: 5, charged: 2 };
    expect(buildDashboard(period, rows).maintenances).toEqual({
      count: 5,
      charged: 2,
      uncharged: 3,
    });
  });

  it('serie: coloca cada fila en su punto (Date o texto ISO) y rellena el resto con cero', () => {
    const period = resolveDashboardPeriod({ period: 'week', date: '2026-09-30' }, LIMA);
    const rows = zeroRows();
    rows.series = [
      {
        bucket: new Date('2026-09-29T05:00:00.000Z'),
        counter: '10.50',
        wash: '0',
        maintenance: '0',
      },
      { bucket: '2026-10-04T05:00:00.000Z', counter: '0', wash: '15.00', maintenance: '95.90' },
    ];
    const series = buildDashboard(period, rows).series;

    expect(series.map((p) => p.bucket)).toEqual([
      '2026-09-28T05:00:00.000Z',
      '2026-09-29T05:00:00.000Z',
      '2026-09-30T05:00:00.000Z',
      '2026-10-01T05:00:00.000Z',
      '2026-10-02T05:00:00.000Z',
      '2026-10-03T05:00:00.000Z',
      '2026-10-04T05:00:00.000Z',
    ]);
    expect(series[1]).toEqual({
      bucket: '2026-09-29T05:00:00.000Z',
      counter: '10.5',
      wash: '0',
      maintenance: '0',
    });
    expect(series[6]).toEqual({
      bucket: '2026-10-04T05:00:00.000Z',
      counter: '0',
      wash: '15',
      maintenance: '95.9',
    });
    expect(series[0]).toEqual({
      bucket: '2026-09-28T05:00:00.000Z',
      counter: '0',
      wash: '0',
      maintenance: '0',
    });
  });

  it('productos: cantidades y montos como string decimal exacto, sin float, en el orden del SQL', () => {
    const period = resolveDashboardPeriod({ date: '2026-09-28' }, LIMA);
    const rows = zeroRows();
    rows.productsSold = { units: '3.750' };
    rows.topProducts = [
      {
        productId: 'a',
        name: 'Aceite',
        soldUnits: '3.750',
        soldAmount: '112.50',
        maintenanceUnits: '4.000',
      },
      {
        productId: 'b',
        name: 'Filtro',
        soldUnits: '0',
        soldAmount: '0',
        maintenanceUnits: '0.100',
      },
    ];
    const dashboard = buildDashboard(period, rows);
    expect(dashboard.productsSold).toEqual({ units: '3.75' });
    expect(dashboard.topProducts).toEqual([
      {
        productId: 'a',
        name: 'Aceite',
        soldUnits: '3.75',
        soldAmount: '112.5',
        maintenanceUnits: '4',
      },
      { productId: 'b', name: 'Filtro', soldUnits: '0', soldAmount: '0', maintenanceUnits: '0.1' },
    ]);
  });

  it('lavados por tipo: conserva orden, conteo y monto como string', () => {
    const period = resolveDashboardPeriod({ date: '2026-09-28' }, LIMA);
    const rows = zeroRows();
    rows.washTypes = [
      { washTypeId: 'a', name: 'Auto', count: 2, amount: '30.00' },
      { washTypeId: 'b', name: 'Moto lineal', count: 1, amount: '8.00' },
    ];
    expect(buildDashboard(period, rows).washes.byType).toEqual([
      { washTypeId: 'a', name: 'Auto', count: 2, amount: '30' },
      { washTypeId: 'b', name: 'Moto lineal', count: 1, amount: '8' },
    ]);
  });
});
