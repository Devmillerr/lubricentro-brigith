# STATUS — Estado del proyecto

**Actualizado:** 2026-09-22

## Corte actual

**Backend C0–C6 implementado y commiteado** (último commit de corte: `b92beb8`, C6). Las **correcciones de auditoría A-1/A-2 y la configuración del negocio (B-010)** están verificadas y **commiteadas** en `9d80f09`. El fix de `test:e2e` (compatibilidad ESM de `@nestjs/throttler` en Jest) está **commiteado** en `2018a11`.

**Estado de verificación actual:** `test:e2e` **1/1**, unitarios **176/176** (21 suites), `typecheck` y `lint` limpios.

La base real ya existe: **Supabase** (proyecto `brigith-os`), `apps/api/.env` configurado, migraciones aplicadas. El bloqueo operativo de sesiones anteriores ("sin base de datos") está resuelto.

## Completado después de C6 (commit `9d80f09`)

| Ítem | Qué | Dónde |
|---|---|---|
| Auditoría A-1 | Idempotencia sin carrera (TOCTOU): la fila se **reserva antes** de correr el handler; el unique impide doble efecto; la petición concurrente espera y replica; si el handler falla, la reserva se borra. Nuevo error `IDEMPOTENCY_KEY_IN_PROGRESS` (409) si sigue en curso tras ~3 s | `apps/api/src/idempotency/idempotency.service.ts` |
| Auditoría A-2 | Unique de `IdempotencyRecord` pasa de `(businessId, key)` a `(businessId, key, endpoint)`: la misma clave en endpoints distintos ya no da 500. `responseStatus`/`responseBody` ahora nulables ("en curso") | `schema.prisma` + migración `20260922200000_idempotency_key_per_endpoint` (**aplicada en Supabase**) |
| B-010 | `GET /business` y `PATCH /business/settings` con los 6 campos de `06-API.md`: `whatsappTemplate`, `reminderLeadDays`, `defaultDueRuleWhenBoth` (solo `ANY`/`ALL`), `insufficientStockPolicy`, `defaultCountryCode`, `currency`. Campo omitido = no se toca; `null` = vuelve a sin definir. `businessId` siempre del token | `apps/api/src/business/**` |
| Tests | `idempotency.service.spec.ts` reescrito sobre el fake compartido (endpoints distintos, aislamiento entre negocios, liberación tras fallo); nuevo `business.service.spec.ts`; `fake-scoped-prisma.ts` soporta `business.update` | `apps/api/test/**` |

Verificación hecha antes del commit:
- `typecheck` limpio, `lint` limpio, **176/176 tests unitarios** (21 suites).
- `prisma migrate status`: al día (6 migraciones).
- Smoke test contra Supabase con la API levantada: `GET /business`, `PATCH /business/settings` (valida `ANY`/`ALL`, rechaza campos extra como `name`, 401 sin token; se probó `currency` y se revirtió a `null`).
- **A-1 contra Postgres real**: 10 peticiones simultáneas con la misma clave → 1 ejecución + 9 réplicas con el mismo resultado; mismo key con otro cuerpo → 409. Filas de prueba (`smoke-%`) borradas.

## Pendiente

- **`PATCH /maintenances/:id`** no resincroniza el `Reminder` ya creado si cambian `nextDueKm`/`nextDueDate`/`dueRule` (gap documentado en el commit de C6).
- **Cliente OpenAPI del frontend** (`apps/web/src/lib/api/generated/`): no se ha regenerado desde C0; no incluye C1–C6 ni `/business`.
- **Pantallas en `apps/web`** para C1–C6: no hechas (`apps/web` no se toca desde `fe6959e`).
- Ítems del backlog que dependen de datos o decisiones de Brigith (no de código): B-021/B-030/B-042 (DEC-22), B-023 (P-07, P-08), B-046 (P-02, P-03), B-053 / BR-W5 (P-01), B-061 (P-01), B-063 / BR-I4 (umbrales). Los valores de DEC-01, DEC-03, DEC-05, P-13 ya se pueden **cargar** vía `PATCH /business/settings` cuando se decidan.
- `docs/09-BACKLOG.md` marca B-010 como "Config abierta" (implementable; el valor lo decide el negocio). El endpoint ya existe; los valores siguen pendientes de decisión. Cambiar ese estado queda a criterio del usuario.

## Bloqueos

- Ninguno para seguir programando. DEC-22 sigue abierto (afecta cómo se descuentan productos por unidad/presentación), pero C2–C4 ya se implementaron con el modelo provisional; revisar cuando se decida.
- Antes del piloto: decisiones de `docs/09-BACKLOG.md` §2 (DEC-01, DEC-03, DEC-05, DEC-10 hosting, P-01, P-13).

## Último commit

`2018a11` — "fix(test): bridge throttler esm compatibility": transformer de Jest solo para `@nestjs/throttler/dist` (`test/support/nestjs-esm-bridge.cjs` + `nestjs-esm-bridge.setup.ts`), porque Jest 30 no soporta `require(esm)` en Node 22. Se puede quitar al pasar a Node >= 24.9 o si throttler publica ESM.

Antes: `9d80f09` — "fix(api): close audit findings and add business settings" (A-1, A-2, B-010 y la migración `20260922200000_idempotency_key_per_endpoint`, ya aplicada en Supabase; no borrarla ni renombrarla). Sobre `b92beb8` (C6).

## Próximo paso

1. Resincronizar el `Reminder` en `PATCH /maintenances/:id` (editar un mantenimiento debe actualizar su recordatorio).
2. Regenerar/definir el contrato que consumirá el frontend (OpenAPI + cliente tipado de `apps/web`) y decidir el orden de las pantallas del MVP.
