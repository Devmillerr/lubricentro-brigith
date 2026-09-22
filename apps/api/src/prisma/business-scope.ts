import { PrismaService } from './prisma.service';

/**
 * Modelos que llevan `businessId` y cuyas consultas deben pasar siempre por
 * {@link forBusiness}. Ver 04-ARCHITECTURE.md §5: "una capa única de acceso a
 * datos aplica el filtro por negocio; ningún servicio escribe el filtro a mano".
 *
 * Al agregar un modelo de negocio nuevo (Customer, Vehicle, ...) agrégalo aquí.
 */
const BUSINESS_SCOPED_MODELS = new Set([
  'User',
  'RefreshToken',
  'IdempotencyRecord',
  'Customer',
  'VehicleModel',
  'Vehicle',
  'ProductCategory',
  'Product',
  'ProductCompatibility',
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
export function forBusiness(prisma: PrismaService, businessId: string) {
  if (!businessId) {
    throw new Error('forBusiness requiere un businessId no vacío');
  }

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

export type ScopedPrismaClient = ReturnType<typeof forBusiness>;
