import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Fake mínimo de un cliente Prisma con alcance de negocio (ver forBusiness),
 * para probar servicios sin una base real. Sigue el mismo patrón que
 * test/auth.service.spec.ts y test/business-scope.spec.ts: cada modelo es un
 * Map en memoria y las operaciones pasan por `forBusiness` de verdad, así que
 * el filtro por `businessId` que se prueba es el mismo que corre en producción.
 *
 * Soporta lo que necesitan los servicios de C1 (customers, vehicles):
 * findMany (where con igualdad, OR y `contains`/`mode: insensitive`, cursor +
 * skip + take, orderBy de un campo), findFirst, create y update.
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
  if (condition !== null && typeof condition === 'object' && 'contains' in condition) {
    const needle = toComparable(condition.contains).toLowerCase();
    const mode = (condition as { mode?: string }).mode;
    const haystack = toComparable(value);
    return mode === 'insensitive'
      ? haystack.toLowerCase().includes(needle)
      : haystack.includes(toComparable(condition.contains));
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

function runFindMany(
  store: Store,
  args: {
    where?: WhereClause;
    cursor?: { id: string };
    skip?: number;
    take?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  },
) {
  let rows = [...store.values()].filter((record) => matchesWhere(record, args.where));

  const orderByEntry = args.orderBy && Object.entries(args.orderBy)[0];
  if (orderByEntry) {
    const [field, direction] = orderByEntry;
    rows = rows.sort((a, b) => {
      const av = toComparable(a[field]);
      const bv = toComparable(b[field]);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return direction === 'desc' ? -cmp : cmp;
    });
  }

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

  return rows;
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
) {
  switch (operation) {
    case 'findFirst':
      return [...store.values()].find((record) => matchesWhere(record, args.where)) ?? null;
    case 'findMany':
      return runFindMany(store, args);
    case 'create': {
      const id = (args.data?.id as string) ?? `id-${store.size + 1}`;
      const record: Record<string, unknown> = { isActive: true, ...args.data, id };

      for (const fields of uniqueFieldSets) {
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
      Object.assign(record, args.data);
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

  const prisma = {
    $extends(config: {
      query: { $allModels: { $allOperations: (ctx: unknown) => Promise<unknown> } };
    }) {
      const operations = config.query.$allModels.$allOperations;
      const client: Record<string, unknown> = {};

      for (const name of modelNames) {
        const model = name.charAt(0).toUpperCase() + name.slice(1);
        const store = stores.get(name)!;
        client[name] = {
          findFirst: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'findFirst',
              args,
              query: (a: unknown) => runOp(store, 'findFirst', a as never),
            }),
          findMany: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'findMany',
              args,
              query: (a: unknown) => runOp(store, 'findMany', a as never),
            }),
          create: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'create',
              args,
              query: (a: unknown) =>
                runOp(store, 'create', a as never, uniqueFieldSets[name] ?? []),
            }),
          update: (args: Record<string, unknown>) =>
            operations({
              model,
              operation: 'update',
              args,
              query: (a: unknown) => runOp(store, 'update', a as never),
            }),
        };
      }

      return client;
    },
  } as unknown as PrismaService;

  return { prisma, stores };
}
