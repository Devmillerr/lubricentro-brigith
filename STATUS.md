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

- **Base de datos real** (decisión tomada 2026-09-21): el proyecto usará **Supabase** (PostgreSQL administrado) en vez de un PostgreSQL local. El usuario está preparando el proyecto en Supabase; no se instala PostgreSQL local. Hasta que Supabase esté listo, sigue sin poder ejecutarse ninguna migración real.
- **Migraciones de Prisma** (depende de Supabase): `apps/api/prisma/migrations/` **no existe todavía** — esto ya era cierto antes de C1 (C0 nunca llegó a generar una migración real). Se genera con `DATABASE_URL` apuntando a Supabase; no se ha podido ejecutar `prisma migrate dev` ni verificar que el esquema aplica limpio contra una base real.
- **`.env` de `apps/api`** (depende de Supabase): tampoco existe en este entorno (solo `.env.example`). Cuando Supabase esté listo, `DATABASE_URL` debe apuntar a la cadena de conexión de Supabase (revisar si hace falta el *connection pooler* de Supabase para Prisma, además de la conexión directa para migraciones). Sin él no se puede levantar la API, generar el OpenAPI (`openapi:generate` instancia `AppModule`, que conecta a la base en `onModuleInit`) ni correr los tests e2e (`test:e2e`, distinto de los 50 unitarios que sí corrieron).
- **Cliente OpenAPI del frontend** (depende de los dos puntos anteriores): `apps/web/src/lib/api/generated/` no se regeneró; sigue reflejando solo los endpoints de C0.
- **`GET /vehicles/:id/maintenances`** (depende de C4 — tabla `Maintenance`): no implementado. `06-API.md` lo lista, pero la tabla no existe hasta C4.
- **`GET /vehicles/:id/compatible-products`** (depende de C2/C4 — tablas `Product`, `ProductCompatibility`): no implementado por la misma razón.
- **`GET /vehicles/lookup`, campos "último mantenimiento" y "último km conocido"** (depende de C4): el endpoint existe y funciona (vehículo + cliente + modelo), pero sin esos dos campos que pide `06-API.md`, porque se calculan desde `Maintenance`.
- **B-010** (config abierta, de C0): configuración del negocio como valores editables. Sigue sin implementar; no bloquea nada.
- **Pantallas de C1 en `apps/web`**: no están en el backlog de C1 (`09-BACKLOG.md` §3 no las pide para este corte), pero tampoco están hechas. A decidir si entran antes de C2.
- **C2 en adelante**: ver `docs/08-ROADMAP.md` y `docs/09-BACKLOG.md` §3.

## Bloqueos

Ninguna regla de negocio ni decisión pendiente bloquea C1 (confirmado en `docs/09-BACKLOG.md` §1: C0 y C1 no dependen de ningún dato pendiente de Brigith).

- **Bloqueo operativo** (no de producto): sin una base de datos real ni `.env` no se puede generar la migración de C1 ni regenerar el OpenAPI. Se resuelve cuando el usuario termine de preparar el proyecto en **Supabase** y comparta la cadena de conexión (ver "Próximo paso"). No se instala PostgreSQL local para esto.
- **DEC-22** (modelado de presentaciones/unidad de producto): sigue bloqueando **C2** y **C3**. No afecta a C1.
- El resto de decisiones pendientes en `docs/09-BACKLOG.md` §2 son configuración de negocio o de proceso; se necesitan antes del piloto, no antes de programar.

## Último commit

`64f9c1b` — "feat(c1): add customers and vehicles", sobre `34811be` ("docs(status): record C0 commit and known tsbuildinfo artifact") y `fe6959e` (commit raíz de C0). **C1 queda cerrado aquí; no empezar C2 todavía.**

## Próximo paso

**Detenido a propósito, a la espera de que el usuario prepare Supabase.** No instalar PostgreSQL local, no tocar código, no commitear, hasta que continúe la configuración:

1. El usuario crea/prepara el proyecto en **Supabase** (PostgreSQL administrado) y comparte la cadena de conexión (`DATABASE_URL`; revisar si Prisma necesita el *connection pooler* de Supabase además de la conexión directa para migraciones — ver docs de Supabase + Prisma antes de configurar).
2. Crear `apps/api/.env` desde `.env.example` con esa `DATABASE_URL` (y los demás secretos: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SEED_OWNER_PASSWORD`).
3. `pnpm --filter @brigith/api prisma:migrate` — como no hay ninguna migración previa, esto genera **una sola migración inicial** que cubre C0 + C1 a la vez (negocio, usuarios, sesión, idempotencia, clientes, vehículos y modelos de vehículo), ya contra Supabase.
4. `pnpm --filter @brigith/api prisma:seed`, luego levantar la API y regenerar el OpenAPI/cliente tipado del frontend.
5. Validar C0 + C1 contra la base real (tests e2e, flujos de auth y de clientes/vehículos).
6. Recién después: decidir si C1 necesita pantallas en `apps/web`, o si se pasa directo a **C2 — Catálogo** una vez resuelto DEC-22.
