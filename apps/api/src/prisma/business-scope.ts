import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaService } from './prisma.service';

/**
 * Modelos que llevan `businessId` y cuyas consultas deben pasar siempre por
 * {@link forBusiness}. Ver 04-ARCHITECTURE.md §5: "una capa única de acceso a
 * datos aplica el filtro por negocio; ningún servicio escribe el filtro a mano".
 *
 * Al agregar un modelo de negocio nuevo (Customer, Vehicle, ...) agrégalo aquí.
 *
 * Excepción: `MaintenanceItem` no tiene `businessId` propio (05-DATABASE.md
 * §3) — siempre se llega a través de `Maintenance`, que sí está aquí.
 */
export const BUSINESS_SCOPED_MODELS = new Set([
  'User',
  'RefreshToken',
  'IdempotencyRecord',
  'Customer',
  'VehicleModel',
  'Vehicle',
  'ProductCategory',
  'Product',
  'ProductCompatibility',
  'InventoryMovement',
  'InventoryReceipt',
  'Supplier',
  'SupplierPayable',
  'SupplierPayableDueDateChange',
  'SupplierPayment',
  'ProductSaleUnit',
  'Sale',
  'SaleLine',
  'WashType',
  'WashPriceOption',
  'MaintenanceType',
  'Maintenance',
  'Reminder',
]);

const BLOCKED_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow', 'upsert']);

type WhereArgs = { where?: Record<string, unknown> };
type DataArgs = { data?: Record<string, unknown> };

/**
 * Devuelve un cliente Prisma en el que toda operación sobre un modelo de
 * negocio incluye automáticamente `businessId`. Los servicios nunca deben
 * inyectar `PrismaService` sin pasar antes por esta función para leer o
 * escribir un modelo de la lista de arriba.
 *
 * `findUnique`/`findUniqueOrThrow`/`upsert` quedan bloqueados a propósito:
 * buscar solo por `id` no puede confirmar el negocio sin volverse `findFirst`,
 * y permitirlo sería el hueco de aislamiento exacto que esto existe para cerrar.
 * Usa `findFirst({ where: { id, ... } })` en su lugar.
 */
export function forBusiness(prisma: PrismaService, businessId: string): ScopedPrismaClient {
  if (!businessId) {
    throw new Error('forBusiness requiere un businessId no vacío');
  }

  const ambient = ambientTransaction.getStore();
  if (ambient) {
    if (ambient.businessId !== businessId) {
      throw new Error('forBusiness: otro negocio dentro de una transacción ambiente');
    }
    return joinAmbientTransaction(ambient.tx);
  }

  return scopedClient(prisma, businessId);
}

function scopedClient(prisma: PrismaService, businessId: string) {
  return prisma.$extends({
    name: 'business-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !BUSINESS_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (BLOCKED_OPERATIONS.has(operation)) {
            throw new Error(
              `${operation} está bloqueado para "${model}" por aislamiento de negocio. ` +
                'Usa findFirst/findFirstOrThrow con { where: { id, ... } }.',
            );
          }

          const scopedArgs = args as WhereArgs & DataArgs;

          switch (operation) {
            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
            case 'updateMany':
            case 'deleteMany':
              scopedArgs.where = { ...(scopedArgs.where ?? {}), businessId };
              break;
            case 'update':
            case 'delete':
              scopedArgs.where = { ...(scopedArgs.where ?? {}), businessId };
              break;
            case 'create':
              scopedArgs.data = { ...(scopedArgs.data ?? {}), businessId };
              break;
            case 'createMany':
              // createMany no soporta un where; se deja pasar tal cual y cada
              // fila debe traer businessId explícito desde el servicio.
              break;
            default:
              break;
          }

          return query(scopedArgs);
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof scopedClient>;

/** Cliente de una transacción interactiva abierta con `forBusiness(...).$transaction`. */
export type ScopedTransaction = Parameters<Parameters<ScopedPrismaClient['$transaction']>[0]>[0];

/**
 * Transacción "ambiente": mientras corre {@link runInAmbientTransaction},
 * todo `forBusiness(prisma, businessId)` del mismo negocio devuelve esa
 * transacción, y su `$transaction(cb)` corre `cb` dentro de ella en vez de
 * abrir otra. La usa `IdempotencyService`: la reserva de la clave, el efecto
 * (venta, recepción, pago…) y la respuesta guardada se confirman juntos o no
 * se confirma nada, sin cambiar cada servicio.
 */
const ambientTransaction = new AsyncLocalStorage<{
  businessId: string;
  tx: ScopedTransaction;
}>();

export function runInAmbientTransaction<T>(
  businessId: string,
  tx: ScopedTransaction,
  fn: () => Promise<T>,
): Promise<T> {
  return ambientTransaction.run({ businessId, tx }, fn);
}

function joinAmbientTransaction(tx: ScopedTransaction): ScopedPrismaClient {
  const joinedTransaction = (arg: unknown): Promise<unknown> =>
    typeof arg === 'function'
      ? (arg as (client: ScopedTransaction) => Promise<unknown>)(tx)
      : Promise.all(arg as Promise<unknown>[]);

  return new Proxy(tx, {
    get(target, prop): unknown {
      if (prop === '$transaction') return joinedTransaction;
      const value: unknown = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      const method = value as (...args: unknown[]) => unknown;
      return method.bind(target);
    },
  }) as unknown as ScopedPrismaClient;
}
