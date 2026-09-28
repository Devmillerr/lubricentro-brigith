import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService, type StockAlertProduct } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';
import {
  periodBuckets,
  resolveDashboardPeriod,
  type DashboardPeriod,
  type DashboardPeriodKind,
} from './dashboard-period';

export interface DashboardQuery {
  period?: DashboardPeriodKind;
  date?: string;
}

/** Montos como string decimal (igual que `/sales`): nunca `float`. */
export interface DashboardSeriesPoint {
  bucket: string;
  counter: string;
  wash: string;
  maintenance: string;
}

export interface DashboardWashType {
  washTypeId: string | null;
  name: string;
  count: number;
  amount: string;
}

/**
 * Producto del ranking (B-162, DEC-81, BR-D5). `soldUnits`/`soldAmount`: lo
 * vendido en mostrador. `maintenanceUnits`: lo consumido en mantenimientos,
 * sin monto (es inventario, no un ingreso). Cantidades en la unidad del
 * producto, como string decimal.
 */
export interface DashboardTopProduct {
  productId: string;
  name: string;
  soldUnits: string;
  soldAmount: string;
  maintenanceUnits: string;
}

/** Máximo de productos en el ranking (06-API.md §2 "Dashboard"). */
export const TOP_PRODUCTS_LIMIT = 10;

/** Máximo de productos en `stock.items` (06-API.md §2 "Dashboard"). */
export const STOCK_ITEMS_LIMIT = 10;

/**
 * Stock que requiere atención (B-163, DEC-82, BR-P19): la misma lógica que
 * `GET /inventory/alerts`. `outOfStock` y `negative` son cantidades; `items`
 * muestra hasta 10, primero los negativos y luego los agotados, cada uno con la
 * forma de un elemento de `/inventory/alerts`. No depende del período: es el
 * saldo actual.
 */
export interface DashboardStock {
  outOfStock: number;
  negative: number;
  notCounted: number;
  items: StockAlertProduct[];
}

/** `GET /dashboard` de R7 (B-160 a B-163). */
export interface Dashboard {
  period: { kind: DashboardPeriodKind; date: string; from: string; to: string; timezone: string };
  totals: {
    total: string;
    cash: string;
    yape: string;
    salesCount: number;
    bySource: { counter: string; wash: string; maintenance: string };
  };
  washes: { count: number; amount: string; byType: DashboardWashType[] };
  maintenances: { count: number; charged: number; uncharged: number };
  productsSold: { units: string };
  topProducts: DashboardTopProduct[];
  series: DashboardSeriesPoint[];
  stock: DashboardStock;
  /**
   * `dueNow`: recordatorios `PENDING` que corresponde avisar ahora, con la misma
   * evaluación que `GET /reminders?due=now&status=PENDING` (la pantalla Avisar).
   * Es el estado actual: no depende del período elegido.
   */
  reminders: { dueNow: number };
}

/** Filas tal como salen del SQL: montos como texto, conteos como int. */
export interface MoneyRow {
  salesCount: number;
  washCount: number;
  total: string;
  cash: string;
  yape: string;
  counter: string;
  wash: string;
  maintenance: string;
}

export interface WashTypeRow {
  washTypeId: string | null;
  name: string;
  count: number;
  amount: string;
}

export interface MaintenanceRow {
  count: number;
  charged: number;
}

export interface SeriesRow {
  /**
   * Inicio del punto en UTC. El SQL lo devuelve como texto ISO (`...Z`): el
   * adapter `pg` de Prisma lee los `timestamptz` calculados sin su desfase
   * (Postgres los envía en la zona de la sesión), y el punto se correría.
   */
  bucket: Date | string;
  counter: string;
  wash: string;
  maintenance: string;
}

export interface ProductsSoldRow {
  units: string;
}

export interface TopProductRow {
  productId: string;
  name: string;
  soldUnits: string;
  soldAmount: string;
  maintenanceUnits: string;
}

export interface DashboardRows {
  money: MoneyRow;
  washTypes: WashTypeRow[];
  maintenances: MaintenanceRow;
  productsSold: ProductsSoldRow;
  topProducts: TopProductRow[];
  series: SeriesRow[];
  stock: {
    outOfStock: StockAlertProduct[];
    negative: StockAlertProduct[];
    notCountedCount: number;
  };
  remindersDueNow: number;
}

/** Normaliza un decimal de Postgres igual que `Decimal.toString()` en el resto de la API. */
function money(value: string): string {
  return new Prisma.Decimal(value).toString();
}

/** Arma la respuesta sin tocar la base: la serie incluye los puntos vacíos en cero. */
export function buildDashboard(period: DashboardPeriod, rows: DashboardRows): Dashboard {
  const byBucket = new Map(rows.series.map((row) => [new Date(row.bucket).getTime(), row]));
  const series = periodBuckets(period).map((bucket) => {
    const row = byBucket.get(bucket.getTime());
    return {
      bucket: bucket.toISOString(),
      counter: money(row?.counter ?? '0'),
      wash: money(row?.wash ?? '0'),
      maintenance: money(row?.maintenance ?? '0'),
    };
  });

  const { money: m } = rows;
  return {
    period: {
      kind: period.kind,
      date: period.date,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      timezone: period.timezone,
    },
    totals: {
      total: money(m.total),
      cash: money(m.cash),
      yape: money(m.yape),
      salesCount: m.salesCount,
      bySource: {
        counter: money(m.counter),
        wash: money(m.wash),
        maintenance: money(m.maintenance),
      },
    },
    washes: {
      count: m.washCount,
      amount: money(m.wash),
      byType: rows.washTypes.map((row) => ({
        washTypeId: row.washTypeId,
        name: row.name,
        count: row.count,
        amount: money(row.amount),
      })),
    },
    maintenances: {
      count: rows.maintenances.count,
      charged: rows.maintenances.charged,
      uncharged: rows.maintenances.count - rows.maintenances.charged,
    },
    productsSold: { units: money(rows.productsSold.units) },
    topProducts: rows.topProducts.map((row) => ({
      productId: row.productId,
      name: row.name,
      soldUnits: money(row.soldUnits),
      soldAmount: money(row.soldAmount),
      maintenanceUnits: money(row.maintenanceUnits),
    })),
    series,
    stock: {
      outOfStock: rows.stock.outOfStock.length,
      negative: rows.stock.negative.length,
      notCounted: rows.stock.notCountedCount,
      items: [...rows.stock.negative, ...rows.stock.outOfStock].slice(0, STOCK_ITEMS_LIMIT),
    },
    reminders: { dueNow: rows.remindersDueNow },
  };
}

/**
 * Agregaciones en SQL (DEC-80, BR-D2 a BR-D4). El SQL crudo no pasa por
 * `forBusiness`: cada consulta filtra `businessId` explícito y es
 * parametrizada (`Prisma.sql`, nunca `$queryRawUnsafe`).
 *
 * Las columnas de fecha son `TIMESTAMP(3)` sin zona, en UTC. Por eso los
 * límites se pasan como `timestamptz` y se llevan a UTC con `AT TIME ZONE
 * 'UTC'`, sin depender de la zona de la sesión; y para agrupar se pasa de UTC a
 * la zona del negocio.
 *
 * - Dinero: solo `Sale` `ACTIVE`, fechadas por `Sale.occurredAt`. El cobro de
 *   un mantenimiento es su venta `MAINTENANCE` (hora real del cobro, DEC-75).
 * - Mantenimientos: `Maintenance` `ACTIVE` por `performedAt`. Cobrado = con
 *   venta `ACTIVE` (como máximo una, `Sale.maintenanceId @unique`, DEC-69), así
 *   que el cobro no suma un segundo mantenimiento.
 * - Productos (DEC-81, BR-D5), con los tipos reales del ledger:
 *   - Vendido: `quantity`/`subtotal` de las líneas `PRODUCT` de ventas
 *     `COUNTER` `ACTIVE`, por `Sale.occurredAt`. Es la misma fecha y cantidad del
 *     movimiento `SALE`, que el ledger solo crea para productos con
 *     `tracksStock`; la línea cuenta también lo vendido sin control de stock.
 *   - Consumo en mantenimiento: `−quantityDelta` de los movimientos
 *     `MAINTENANCE_USE` (`refType = 'Maintenance'`) de mantenimientos `ACTIVE`,
 *     por el `occurredAt` del movimiento (= `performedAt`, que no se edita). No
 *     tiene monto: el dinero del mantenimiento es solo su venta `MAINTENANCE`,
 *     que no lleva líneas `PRODUCT`.
 *   - Fuera: `COUNT`, `PURCHASE_IN` y `ADJUSTMENT` (no son consumo), y
 *     `SALE_VOID`/`MAINTENANCE_VOID` (lo anulado se excluye por el estado del
 *     origen, no restando la reversa, que lleva la fecha de la anulación).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly reminders: RemindersService,
  ) {}

  async get(businessId: string, query: DashboardQuery, now: Date = new Date()): Promise<Dashboard> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const period = resolveDashboardPeriod(query, business.timezone, now);
    const [rows, stock, remindersDueNow] = await Promise.all([
      this.loadRows(businessId, period),
      this.inventory.getAlerts(businessId),
      this.reminders.countDueNow(businessId),
    ]);
    return buildDashboard(period, { ...rows, stock, remindersDueNow });
  }

  private async loadRows(
    businessId: string,
    period: DashboardPeriod,
  ): Promise<Omit<DashboardRows, 'stock' | 'remindersDueNow'>> {
    const from = Prisma.sql`(${period.from.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const to = Prisma.sql`(${period.to.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const tz = period.timezone;

    const [money, washTypes, maintenances, productsSold, topProducts, series] = await Promise.all([
      this.prisma.$queryRaw<MoneyRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "salesCount",
          (COUNT(*) FILTER (WHERE "source" = 'WASH'))::int AS "washCount",
          COALESCE(SUM("total"), 0)::text AS "total",
          COALESCE(SUM("total") FILTER (WHERE "paymentMethod" = 'CASH'), 0)::text AS "cash",
          COALESCE(SUM("total") FILTER (WHERE "paymentMethod" = 'YAPE'), 0)::text AS "yape",
          COALESCE(SUM("total") FILTER (WHERE "source" = 'COUNTER'), 0)::text AS "counter",
          COALESCE(SUM("total") FILTER (WHERE "source" = 'WASH'), 0)::text AS "wash",
          COALESCE(SUM("total") FILTER (WHERE "source" = 'MAINTENANCE'), 0)::text AS "maintenance"
        FROM "sales"
        WHERE "businessId" = ${businessId}::text
          AND "status" = 'ACTIVE'
          AND "occurredAt" >= ${from}
          AND "occurredAt" < ${to}
      `),
      this.prisma.$queryRaw<WashTypeRow[]>(Prisma.sql`
        SELECT
          l."washTypeId" AS "washTypeId",
          COALESCE(t."name", MAX(l."descriptionSnapshot")) AS "name",
          COUNT(DISTINCT s."id")::int AS "count",
          COALESCE(SUM(l."subtotal"), 0)::text AS "amount"
        FROM "sales" s
        JOIN "sale_lines" l ON l."saleId" = s."id" AND l."businessId" = s."businessId"
        LEFT JOIN "wash_types" t ON t."id" = l."washTypeId" AND t."businessId" = s."businessId"
        WHERE s."businessId" = ${businessId}::text
          AND s."status" = 'ACTIVE'
          AND s."source" = 'WASH'
          AND l."kind" = 'WASH'
          AND s."occurredAt" >= ${from}
          AND s."occurredAt" < ${to}
        GROUP BY l."washTypeId", t."name"
        ORDER BY COUNT(DISTINCT s."id") DESC, 2 ASC
      `),
      this.prisma.$queryRaw<MaintenanceRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "count",
          COUNT(s."id")::int AS "charged"
        FROM "maintenances" m
        LEFT JOIN "sales" s
          ON s."maintenanceId" = m."id"
         AND s."businessId" = m."businessId"
         AND s."status" = 'ACTIVE'
        WHERE m."businessId" = ${businessId}::text
          AND m."status" = 'ACTIVE'
          AND m."performedAt" >= ${from}
          AND m."performedAt" < ${to}
      `),
      this.prisma.$queryRaw<ProductsSoldRow[]>(Prisma.sql`
        SELECT COALESCE(SUM(l."quantity"), 0)::text AS "units"
        FROM "sales" s
        JOIN "sale_lines" l ON l."saleId" = s."id" AND l."businessId" = s."businessId"
        WHERE s."businessId" = ${businessId}::text
          AND s."status" = 'ACTIVE'
          AND s."source" = 'COUNTER'
          AND l."kind" = 'PRODUCT'
          AND s."occurredAt" >= ${from}
          AND s."occurredAt" < ${to}
      `),
      this.prisma.$queryRaw<TopProductRow[]>(Prisma.sql`
        WITH "sold" AS (
          SELECT l."productId", SUM(l."quantity") AS "units", SUM(l."subtotal") AS "amount"
          FROM "sales" s
          JOIN "sale_lines" l ON l."saleId" = s."id" AND l."businessId" = s."businessId"
          WHERE s."businessId" = ${businessId}::text
            AND s."status" = 'ACTIVE'
            AND s."source" = 'COUNTER'
            AND l."kind" = 'PRODUCT'
            AND l."productId" IS NOT NULL
            AND s."occurredAt" >= ${from}
            AND s."occurredAt" < ${to}
          GROUP BY l."productId"
        ),
        "used" AS (
          SELECT mv."productId", SUM(-mv."quantityDelta") AS "units"
          FROM "inventory_movements" mv
          JOIN "maintenances" m ON m."id" = mv."refId" AND m."businessId" = mv."businessId"
          WHERE mv."businessId" = ${businessId}::text
            AND mv."type" = 'MAINTENANCE_USE'
            AND mv."refType" = 'Maintenance'
            AND m."status" = 'ACTIVE'
            AND mv."occurredAt" >= ${from}
            AND mv."occurredAt" < ${to}
          GROUP BY mv."productId"
        ),
        "ranked" AS (
          SELECT
            p."id" AS "productId",
            p."name" AS "name",
            COALESCE(sold."units", 0) AS "soldUnits",
            COALESCE(sold."amount", 0) AS "soldAmount",
            COALESCE(used."units", 0) AS "maintenanceUnits"
          FROM (SELECT "productId" FROM "sold" UNION SELECT "productId" FROM "used") ids
          JOIN "products" p ON p."id" = ids."productId" AND p."businessId" = ${businessId}::text
          LEFT JOIN "sold" ON sold."productId" = ids."productId"
          LEFT JOIN "used" ON used."productId" = ids."productId"
        )
        SELECT
          "productId",
          "name",
          "soldUnits"::text AS "soldUnits",
          "soldAmount"::text AS "soldAmount",
          "maintenanceUnits"::text AS "maintenanceUnits"
        FROM "ranked"
        WHERE "soldUnits" + "maintenanceUnits" > 0
        ORDER BY "soldUnits" + "maintenanceUnits" DESC, "name" ASC, "productId" ASC
        LIMIT ${TOP_PRODUCTS_LIMIT}
      `),
      this.prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
        SELECT
          to_char(
            (date_trunc(${period.bucket}::text, ("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)
              AT TIME ZONE ${tz}::text) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'
          ) AS "bucket",
          COALESCE(SUM("total") FILTER (WHERE "source" = 'COUNTER'), 0)::text AS "counter",
          COALESCE(SUM("total") FILTER (WHERE "source" = 'WASH'), 0)::text AS "wash",
          COALESCE(SUM("total") FILTER (WHERE "source" = 'MAINTENANCE'), 0)::text AS "maintenance"
        FROM "sales"
        WHERE "businessId" = ${businessId}::text
          AND "status" = 'ACTIVE'
          AND "occurredAt" >= ${from}
          AND "occurredAt" < ${to}
        GROUP BY 1
      `),
    ]);

    // Agregados sin GROUP BY: Postgres siempre devuelve exactamente una fila.
    const [moneyRow] = money;
    const [maintenanceRow] = maintenances;
    const [productsSoldRow] = productsSold;
    if (!moneyRow || !maintenanceRow || !productsSoldRow) {
      throw new Error('El agregado del dashboard no devolvió fila.');
    }
    return {
      money: moneyRow,
      washTypes,
      maintenances: maintenanceRow,
      productsSold: productsSoldRow,
      topProducts,
      series,
    };
  }
}
