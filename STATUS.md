# STATUS — Estado del proyecto

**Actualizado:** 2026-09-21

## Corte actual

**C1 — Clientes y vehículos.** Backend completado, verificado localmente (typecheck, lint y tests unitarios en verde) y **commiteado**. No hay pantallas nuevas en `apps/web` para este corte (no las pide `docs/09-BACKLOG.md` §3 para C1; solo backend).

C0 sigue completo y commiteado (`fe6959e`, `34811be`); lo único que C1 tocó de C0 fue `business-scope.ts` (agregar los modelos nuevos a la lista de aislamiento), `app.module.ts` (registrar los módulos nuevos) y `schema.prisma` (agregar los modelos). Verificado con `git diff` antes de commitear: sin cambios fuera de lo anterior y de los archivos nuevos de `customers/`, `vehicles/`, `common/pagination.ts`, `common/dto/`, `test/support/` y los specs nuevos. `apps/web` no se tocó.

## Completado (C1)

Verificado en esta sesión: `apps/api` typecheck limpio, lint limpio, **50/50 tests unitarios en verde** (8 suites; eran 16/16 en 3 suites antes de este corte).

| ID | Ítem | Dónde |
|---|---|---|
| B-011 | Clientes: crear, listar (`search`, paginación `limit`/`cursor`), detalle con vehículos, editar, desactivar | `apps/api/src/customers/**` |
| B-012 | Vehículos: crear con solo placa, editar (incl. cliente y modelo), placa normalizada y única por negocio | `apps/api/src/vehicles/vehicles.*` |
| B-013 | Búsqueda rápida por placa (`GET /vehicles/lookup?plate=`), normalizada y parcial | `apps/api/src/vehicles/vehicles.service.ts` (`lookup`) |
| B-014 | Modelos de vehículo: crear, listar, editar (año y motor opcionales) | `apps/api/src/vehicles/vehicle-models.*` |

Además, de base para lo anterior:
- Esquema Prisma: modelos `Customer`, `VehicleModel`, `Vehicle` (`apps/api/prisma/schema.prisma`), siguiendo `docs/05-DATABASE.md` §3 y las convenciones de `04-ARCHITECTURE.md` §5 (todo con `businessId`, sin borrado físico).
- `business-scope.ts`: los tres modelos nuevos se agregaron a `BUSINESS_SCOPED_MODELS`, así que pasan por el mismo aislamiento por negocio que `User`/`RefreshToken` (BR-G1, BR-G3).
- Reglas de negocio aplicadas: BR-C3 (ningún campo de cliente obligatorio), BR-C4/BR-C5 (vehículo siempre con placa, cliente opcional), BR-C6 (placa normalizada — mayúsculas, sin espacios ni guiones — única por negocio), BR-C7 (cambiar el cliente de un vehículo vía `PATCH`), BR-G5 (desactivar, nunca borrar), BR-G3 (el `businessId` siempre sale del token, nunca del cuerpo).
- `apps/api/src/common/pagination.ts` y `common/dto/pagination-query.dto.ts`: helper `?limit=&cursor=` reutilizable (06-API.md §1), usado hoy por `GET /customers`.
- `apps/api/test/support/fake-scoped-prisma.ts`: fake de Prisma con alcance de negocio, reutilizable, para probar servicios de dominio sin una base real (mismo patrón que ya usaban `auth.service.spec.ts` y `business-scope.spec.ts`).

**Endpoints del MVP (`06-API.md`) que quedaron fuera a propósito**, porque dependen de tablas de cortes futuros que todavía no existen:
- `GET /vehicles/:id/maintenances` (necesita `Maintenance`, C4).
- `GET /vehicles/:id/compatible-products` (necesita `Product`/`ProductCompatibility`, C2/C4).
- `GET /vehicles/lookup` hoy devuelve vehículo + cliente + modelo; **no** incluye "último mantenimiento" ni "último km conocido" como pide `06-API.md` (dependen de `Maintenance`, C4).

## Pendiente

Reales, no hipotéticos — cada uno depende de algo concreto que falta:

- **Migraciones de Prisma** (depende de PostgreSQL local): `apps/api/prisma/migrations/` **no existe todavía** — esto ya era cierto antes de C1 (C0 nunca llegó a generar una migración real). Generarla requiere una base PostgreSQL local accesible; este entorno de trabajo no tiene Postgres, Docker ni `psql` disponibles, así que no se pudo ejecutar `prisma migrate dev` ni verificar que el esquema aplica limpio contra una base real.
- **`.env` de `apps/api`** (depende de PostgreSQL local): tampoco existe en este entorno (solo `.env.example`). Sin él no se puede levantar la API, generar el OpenAPI (`openapi:generate` instancia `AppModule`, que conecta a Postgres en `onModuleInit`) ni correr los tests e2e (`test:e2e`, distinto de los 50 unitarios que sí corrieron).
- **Cliente OpenAPI del frontend** (depende de los dos puntos anteriores): `apps/web/src/lib/api/generated/` no se regeneró; sigue reflejando solo los endpoints de C0.
- **`GET /vehicles/:id/maintenances`** (depende de C4 — tabla `Maintenance`): no implementado. `06-API.md` lo lista, pero la tabla no existe hasta C4.
- **`GET /vehicles/:id/compatible-products`** (depende de C2/C4 — tablas `Product`, `ProductCompatibility`): no implementado por la misma razón.
- **`GET /vehicles/lookup`, campos "último mantenimiento" y "último km conocido"** (depende de C4): el endpoint existe y funciona (vehículo + cliente + modelo), pero sin esos dos campos que pide `06-API.md`, porque se calculan desde `Maintenance`.
- **B-010** (config abierta, de C0): configuración del negocio como valores editables. Sigue sin implementar; no bloquea nada.
- **Pantallas de C1 en `apps/web`**: no están en el backlog de C1 (`09-BACKLOG.md` §3 no las pide para este corte), pero tampoco están hechas. A decidir si entran antes de C2.
- **C2 en adelante**: ver `docs/08-ROADMAP.md` y `docs/09-BACKLOG.md` §3.

## Bloqueos

Ninguna regla de negocio ni decisión pendiente bloquea C1 (confirmado en `docs/09-BACKLOG.md` §1: C0 y C1 no dependen de ningún dato pendiente de Brigith).

- **Bloqueo operativo de esta sesión** (no de producto): sin PostgreSQL/`.env` locales no se puede generar la migración de C1 ni regenerar el OpenAPI. Se resuelve preparando el entorno local según el `README.md` §"Desarrollo local" (`cp apps/api/.env.example apps/api/.env`, Postgres 16 corriendo, `pnpm --filter @brigith/api prisma:migrate`).
- **DEC-22** (modelado de presentaciones/unidad de producto): sigue bloqueando **C2** y **C3**. No afecta a C1.
- El resto de decisiones pendientes en `docs/09-BACKLOG.md` §2 son configuración de negocio o de proceso; se necesitan antes del piloto, no antes de programar.

## Último commit

`feat(c1): add customers and vehicles`, sobre `34811be` ("docs(status): record C0 commit and known tsbuildinfo artifact") y `fe6959e` (commit raíz de C0). Ver el hash exacto en el historial (`git log --oneline`); este archivo no lo fija para no quedar desactualizado en el próximo commit.

## Próximo paso

1. Preparar Postgres local (`README.md` §"Desarrollo local"): crear `apps/api/.env` desde `.env.example`, tener Postgres 16 corriendo.
2. `pnpm --filter @brigith/api prisma:migrate` — como no hay ninguna migración previa, esto genera **una sola migración inicial** que cubre C0 + C1 a la vez (negocio, usuarios, sesión, idempotencia, clientes, vehículos y modelos de vehículo).
3. `pnpm --filter @brigith/api prisma:seed`, luego levantar la API y regenerar el OpenAPI/cliente tipado del frontend.
4. Decidir si C1 necesita pantallas en `apps/web` antes de seguir, o si se pasa directo a **C2 — Catálogo** (categorías, productos, compatibilidad explícita) una vez resuelto DEC-22.
