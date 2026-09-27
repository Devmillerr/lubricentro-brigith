import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Fake mínimo de un cliente Prisma con alcance de negocio (ver forBusiness),
 * para probar servicios sin una base real. Sigue el mismo patrón que
 * test/auth.service.spec.ts y test/business-scope.spec.ts: cada modelo es un
 * Map en memoria y las operaciones pasan por `forBusiness` de verdad, así que
 * el filtro por `businessId` que se prueba es el mismo que corre en producción.
 *
 * Soporta lo que necesitan los servicios de C1 a C4 (customers, vehicles,
 * products, inventory, maintenances): findMany (where con igualdad, OR y
 * `contains`/`mode: insensitive`, cursor + skip + take, orderBy de un
 * campo), findFirst, create, update, delete e `include` de un nivel por
 * convención de nombre (relación `foo` resuelta desde el campo `fooId`
 * contra el store `foo`). `$transaction` corre el callback contra el mismo
 * cliente (sin aislamiento real: los servicios validan todo antes de
 * escribir, así que nunca queda nada a medias que probar). `$queryRaw` es
 * un no-op: en el fake no hace falta bloquear filas (04-ARCHITECTURE.md
 * §7.2 solo importa contra Postgres real). `business` vive fuera de
 * `stores`: no es un modelo de negocio, es el propio tenant.
 */

export type Store = Map<string, Record<string, unknown>>;

type WhereClause = Record<string, unknown>;

/** Compara valores de tipo desconocido sin arriesgar "[object Object]" (no-base-to-string). */
function toComparable(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

function fieldMatches(value: unknown, condition: unknown): boolean {
  // Como Prisma: `{ campo: null }` coincide con NULL (en el fake, también sin definir).
  if (condition === null) return value === null || value === undefined;
  if (condition !== null && typeof condition === 'object') {
    if ('equals' in condition) {
      const mode = (condition as { mode?: string }).mode;
      const expected = toComparable(condition.equals);
      const actual = toComparable(value);
      return value !== null && value !== undefined && mode === 'insensitive'
        ? actual.toLowerCase() === expected.toLowerCase()
        : value === condition.equals;
    }
    if ('contains' in condition) {
      const needle = toComparable(condition.contains).toLowerCase();
      const mode = (condition as { mode?: string }).mode;
      const haystack = toComparable(value);
      return mode === 'insensitive'
        ? haystack.toLowerCase().includes(needle)
        : haystack.includes(toComparable(condition.contains));
    }
    if ('in' in condition) {
      const list = (condition as { in: unknown[] }).in;
      return list.includes(value);
    }
    if ('not' in condition) {
      return value !== condition.not;
    }
    // Comparaciones numéricas y de fechas (Decimal real, number del fake y Date
    // coercen con Number()).
    if ('lte' in condition || 'lt' in condition || 'gte' in condition || 'gt' in condition) {
      if (value === null || value === undefined) return false;
      const n = Number(value);
      const { lte, lt, gte, gt } = condition as {
        lte?: unknown;
        lt?: unknown;
        gte?: unknown;
        gt?: unknown;
      };
      return (
        (lte === undefined || n <= Number(lte)) &&
        (lt === undefined || n < Number(lt)) &&
        (gte === undefined || n >= Number(gte)) &&
        (gt === undefined || n > Number(gt))
      );
    }
  }
  return value === condition;
}

function matchesWhere(record: Record<string, unknown>, where?: WhereClause): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR' && Array.isArray(condition)) {
      return (condition as WhereClause[]).some((sub) => matchesWhere(record, sub));
    }
    return fieldMatches(record[key], condition);
  });
}

/** Resuelve `include: { relationName: true }` por convención `relationName` + "Id". */
function resolveIncludes(
  record: Record<string, unknown>,
  include: Record<string, boolean> | undefined,
  stores: Map<string, Store>,
): Record<string, unknown> {
  if (!include) return record;

  const resolved = { ...record };
  for (const [relation, wanted] of Object.entries(include)) {
    if (!wanted) continue;
    const fkField = `${relation}Id`;
    if (!(fkField in record)) continue;
    const targetStore = stores.get(relation);
    const fkValue = record[fkField] as string | null | undefined;
    resolved[relation] = fkValue && targetStore ? (targetStore.get(fkValue) ?? null) : null;
  }
  return resolved;
}

/** Compartida por `findMany` y `findFirst`: Prisma también ordena antes de tomar la primera fila. */
type OrderBy = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];

function applyOrderBy(
  rows: Record<string, unknown>[],
  orderBy?: OrderBy,
): Record<string, unknown>[] {
  // Como Prisma: un objeto o una lista de objetos; en la lista, los siguientes desempatan.
  const entries = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o) =>
    Object.entries(o),
  );
  if (entries.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const [field, direction] of entries) {
      const av = toComparable(a[field]);
      const bv = toComparable(b[field]);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

/** `groupBy({ by, where, _count: { _all: true } })`: lo único que usan los servicios. */
function runGroupBy(store: Store, args: { by: string[]; where?: WhereClause }) {
  const groups = new Map<string, { keys: Record<string, unknown>; count: number }>();
  for (const record of store.values()) {
    if (!matchesWhere(record, args.where)) continue;
    const keys = Object.fromEntries(args.by.map((field) => [field, record[field]]));
    const groupKey = JSON.stringify(keys);
    const group = groups.get(groupKey) ?? { keys, count: 0 };
    group.count += 1;
    groups.set(groupKey, group);
  }
  return [...groups.values()].map(({ keys, count }) => ({ ...keys, _count: { _all: count } }));
}

function runFindMany(
  store: Store,
  args: {
    where?: WhereClause;
    cursor?: { id: string };
    skip?: number;
    take?: number;
    orderBy?: OrderBy;
    include?: Record<string, boolean>;
  },
  stores: Map<string, Store>,
) {
  let rows = [...store.values()].filter((record) => matchesWhere(record, args.where));
  rows = applyOrderBy(rows, args.orderBy);

  if (args.cursor) {
    const index = rows.findIndex((r) => r.id === args.cursor?.id);
    rows = index === -1 ? [] : rows.slice(index);
  }
  if (args.skip) {
    rows = rows.slice(args.skip);
  }
  if (args.take !== undefined) {
    rows = rows.slice(0, args.take);
  }

  return rows.map((row) => resolveIncludes(row, args.include, stores));
}

function throwUniqueViolation(): never {
  throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function runOp(
  store: Store,
  operation: string,
  args: { where?: WhereClause; data?: Record<string, unknown> } & Record<string, unknown>,
  uniqueFieldSets: string[][] = [],
  stores: Map<string, Store> = new Map(),
) {
  switch (operation) {
    case 'findFirst': {
      const matches = [...store.values()].filter((r) => matchesWhere(r, args.where));
      const [record] = applyOrderBy(matches, args.orderBy as never);
      return record ? resolveIncludes(record, args.include as never, stores) : null;
    }
    case 'findMany':
      return runFindMany(store, args, stores);
    case 'groupBy':
      return runGroupBy(store, args as never);
    case 'count':
      return [...store.values()].filter((r) => matchesWhere(r, args.where)).length;
    case 'create': {
      const id = (args.data?.id as string) ?? `id-${store.size + 1}`;
      const record: Record<string, unknown> = { isActive: true, ...args.data, id };

      for (const fields of uniqueFieldSets) {
        // Como en Postgres: si algún campo del set es NULL, esta fila no
        // cuenta como duplicado de ninguna otra (NULL nunca es igual a NULL
        // para una restricción única compuesta).
        const hasNullField = fields.some(
          (field) => record[field] === null || record[field] === undefined,
        );
        if (hasNullField) continue;

        const conflict = [...store.values()].some((existing) =>
          fields.every((field) => existing[field] === record[field]),
        );
        if (conflict) throwUniqueViolation();
      }

      store.set(id, record);
      return record;
    }
    case 'update': {
      const record = [...store.values()].find((r) => matchesWhere(r, args.where));
      if (!record) throw new Error('registro no encontrado para update');
      // Como Prisma: un campo en `undefined` no se toca (`null` sí lo borra).
      for (const [field, value] of Object.entries(args.data ?? {})) {
        if (value !== undefined) record[field] = value;
      }
      return record;
    }
    case 'updateMany': {
      // Como Prisma: actualiza todas las que coinciden y devuelve cuántas.
      const records = [...store.values()].filter((r) => matchesWhere(r, args.where));
      for (const record of records) {
        for (const [field, value] of Object.entries(args.data ?? {})) {
          if (value !== undefined) record[field] = value;
        }
      }
      return { count: records.length };
    }
    case 'delete': {
      const record = [...store.values()].find((r) => matchesWhere(r, args.where));
      if (!record) throw new Error('registro no encontrado para delete');
      store.delete(record.id as string);
      return record;
    }
    default:
      throw new Error(`operación no soportada en el fake: ${operation}`);
  }
}

/**
 * Construye un fake de PrismaService con los modelos indicados (nombre tal
 * como aparece en `schema.prisma`, en camelCase para el cliente: "customer",
 * "vehicle", "vehicleModel", ...). El fake implementa `$extends` como lo hace
 * Prisma de verdad, así que se puede inyectar en un servicio tal cual: el
 * servicio sigue llamando a `forBusiness(this.prisma, businessId)` él mismo,
 * y ese filtro por negocio corre de verdad contra este fake.
 */
export function buildFakeScopedPrisma(
  modelNames: string[],
  uniqueFieldSets: Record<string, string[][]> = {},
) {
  const stores = new Map<string, Store>(modelNames.map((name) => [name, new Map()]));
  const businesses: Store = new Map();

  const prisma = {
    business: {
      findUnique: ({ where }: { where: WhereClause }) => {
        const record = [...businesses.values()].find((r) => matchesWhere(r, where));
        return Promise.resolve(record ?? null);
      },
      findUniqueOrThrow: ({ where }: { where: WhereClause }) => {
        const record = [...businesses.values()].find((r) => matchesWhere(r, where));
        if (!record) throw new Error('business no encontrado en el fake');
        return Promise.resolve(record);
      },
      update: ({ where, data }: { where: WhereClause; data: Record<string, unknown> }) => {
        const record = [...businesses.values()].find((r) => matchesWhere(r, where));
        if (!record) throw new Error('business no encontrado en el fake');
        for (const [field, value] of Object.entries(data)) {
          if (value !== undefined) record[field] = value;
        }
        return Promise.resolve(record);
      },
    },
    $extends(config: {
      query: { $allModels: { $allOperations: (ctx: unknown) => Promise<unknown> } };
    }) {
      const operations = config.query.$allModels.$allOperations;
      const client: Record<string, unknown> = {
        $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(client),
        $queryRaw: () => Promise.resolve([]),
      };

      for (const name of modelNames) {
        const model = name.charAt(0).toUpperCase() + name.slice(1);
        const store = stores.get(name)!;
        client[name] = {
          findFirst: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'findFirst',
              args,
              query: (a: unknown) => runOp(store, 'findFirst', a as never, [], stores),
            }),
          findMany: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'findMany',
              args,
              query: (a: unknown) => runOp(store, 'findMany', a as never, [], stores),
            }),
          count: (args: Record<string, unknown> = {}) =>
            operations({
              model,
              operation: 'count',
              args,
              query: (a: unknown) => runOp(store, 'count', a as never, [], stores),
            }),
          groupBy: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'groupBy',
              args,
              query: (a: unknown) => runOp(store, 'groupBy', a as never, [], stores),
            }),
          create: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'create',
              args,
              query: (a: unknown) =>
                runOp(store, 'create', a as never, uniqueFieldSets[name] ?? [], stores),
            }),
          update: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'update',
              args,
              query: (a: unknown) => runOp(store, 'update', a as never, [], stores),
            }),
          updateMany: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'updateMany',
              args,
              query: (a: unknown) => runOp(store, 'updateMany', a as never, [], stores),
            }),
          delete: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'delete',
              args,
              query: (a: unknown) => runOp(store, 'delete', a as never, [], stores),
            }),
        };
      }

      return client;
    },
  } as unknown as PrismaService;

  return { prisma, stores, businesses };
}
