# STATUS — Estado del proyecto

**Actualizado:** 2026-09-22

## Corte actual

**Backend C0–C6 cerrado para empezar el frontend.** Implementado y commiteado:

- C0–C6: último commit de corte `b92beb8` (C6).
- Auditoría A-1/A-2 y configuración del negocio (B-010): `9d80f09`.
- Fix de `test:e2e` (ESM de `@nestjs/throttler` en Jest): `2018a11`.
- **Sincronización del recordatorio al corregir un mantenimiento**: `d269493`.
- **Contrato OpenAPI completo + cliente tipado de `apps/web`**: commit "feat(api): complete openapi contract and typed web client" (el mismo que incluye este archivo).

**Estado de verificación actual:** unitarios **190/190** (21 suites), `test:e2e` **1/1**, `typecheck` de API y web limpios, `lint` de API limpio, Prettier limpio en los archivos tocados. `lint` de web tiene **2 errores preexistentes** (ver Pendiente).

La base real existe: **Supabase** (proyecto `brigith-os`), `apps/api/.env` configurado, 6 migraciones aplicadas.

## Completado en esta sesión

### Sincronización del recordatorio (`d269493`)

`PATCH /maintenances/:id` sincroniza, en la misma transacción, el recordatorio que originó el mantenimiento (`apps/api/src/maintenances/maintenances.service.ts`, `syncOwnReminder`):

- Abierto (PENDING/CONTACTED) y sigue habiendo próximo km/fecha → se actualiza en el lugar (mismo id, estado y contactos).
- Abierto y ya no hay próximo km ni fecha (BR-M6) → DISMISSED con `closeReason` propio, sin borrado.
- DONE (BR-R2) o descartado por el usuario (BR-R9) → no se toca ni se reemplaza.
- Sin recordatorio abierto y ahora hay regla (BR-R1) → reabre el que la misma corrección había descartado, o crea uno, solo si no hay otro abierto del vehículo y tipo y no hay un mantenimiento activo posterior (por `performedAt`) del mismo tipo.
- Mantenimiento VOIDED → 409 `MAINTENANCE_VOIDED`.
- Bug corregido: con `transform: true` el DTO trae todas las claves, así que `'campo' in dto` siempre era true y corregir solo `notes` borraba `nextDueDate`/`dueRule`. Ahora "no enviado" es `!== undefined`; `null` quita el valor. `dueRule` se hereda si la combinación km/fecha no cambia.
- Criterios a confirmar con Brigith (no documentados explícitamente): un recordatorio CONTACTED sigue CONTACTED aunque cambie su fecha; "posterior" se decide por `performedAt`.

### Contrato OpenAPI + cliente tipado

- Los 45 endpoints documentan su respuesta (antes solo los cuerpos de entrada): clases `*.response.ts` por módulo que hacen `implements` del tipo de Prisma/servicio, así `tsc` falla si el modelo cambia y el contrato no. Anulables, enums, `Page<T>` tipado y `Decimal` como string (verificado: `"3.5"`).
- Errores documentados por endpoint con `ProblemDetailsDto` y la lista de `code` posibles (`apps/api/src/common/openapi/`).
- Configuración de Swagger compartida por `main.ts` y `scripts/generate-openapi.ts` (`openapi-document.ts`). Rutas relativas al servidor `/api/v1` (igual que `NEXT_PUBLIC_API_URL`); `/health` excluido del contrato por vivir fuera de `/api/v1`.
- `pnpm api:generate` (raíz) genera `openapi.json` y `apps/web/src/lib/api/generated/schema.d.ts`. No necesita base de datos. Ambos siguen en `.gitignore`; CI los genera antes de lint/typecheck.
- `apps/web` consume la API solo por `apps/web/src/lib/api/client.ts` (`openapi-fetch` + tipos generados; `Schemas['...']` para los esquemas). `ProblemDetails` de `errors.ts` sale del contrato. El frontend no accede a Supabase.
- Sin dependencias nuevas.

Validación del contrato contra la API real (Supabase): 18 respuestas (login, `/auth/me`, `/business`, listados, indicadores, 400/401/404) sin diferencias. **Limitada**: el negocio Brigith no tiene datos, así que las entidades (clientes, vehículos, productos, recordatorios) solo están verificadas en compilación.

## Pendiente

- **Rate limit** (revisado, sin modificar): `ttl 60 s / limit 20` **por IP y por endpoint**, en memoria. Problemas: 429 con `code: HTTP_ERROR` y texto en inglés, sin documentar en el contrato; `Retry-After` no expuesto por CORS; `/auth/login` sin límite propio; detrás de un proxy sin `trust proxy` todos compartirían contador (DEC-10). Propuesta a decidir: límite general más holgado, `@Throttle` estricto en login/refresh, `code` estable para 429, exponer `Retry-After`, registrarlo como decisión [TÉCNICO] en `09-BACKLOG.md`.
- **Validación del contrato con datos reales**: requiere un usuario en el negocio "demo" y datos de ejemplo en Supabase (escritura; pendiente de autorización).
- **`docs/06-API.md` no lista 6 endpoints que sí existen**: `GET/POST /vehicle-models`, `PATCH /vehicle-models/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`.
- **Lint de `apps/web`**: 2 errores preexistentes de `fe6959e` (`connectivity.tsx:15`, `use-form-draft.ts:21`, `setState` síncrono en un efecto). Hacen fallar el paso "Lint" de CI. No corregidos a propósito.
- **Paso nuevo de CI** (`pnpm api:generate`): verificado localmente, no en CI real.
- **Sincronización del recordatorio**: probada con el fake de Prisma, no contra Postgres real.
- **Pantallas en `apps/web`** para C1–C6: no hechas.
- Ítems del backlog que dependen de datos o decisiones de Brigith (no de código): B-021/B-030/B-042 (DEC-22), B-023 (P-07, P-08), B-046 (P-02, P-03), B-053 / BR-W5 (P-01), B-061 (P-01), B-063 / BR-I4 (umbrales). Los valores de DEC-01, DEC-03, DEC-05, P-13 ya se pueden **cargar** vía `PATCH /business/settings` cuando se decidan.
- `docs/09-BACKLOG.md` marca B-010 como "Config abierta"; cambiar ese estado queda a criterio del usuario.

## Bloqueos

- Ninguno para empezar el frontend. DEC-22 sigue abierto (descuento de productos por unidad/presentación); C2–C4 usan el modelo provisional.
- Antes del piloto: decisiones de `docs/09-BACKLOG.md` §2 (DEC-01, DEC-03, DEC-05, DEC-10 hosting, P-01, P-13) y el rate limit.

## Último commit

"feat(api): complete openapi contract and typed web client" (contrato OpenAPI, clases de respuesta, errores documentados, generación, cliente de `apps/web`, CI y este `STATUS.md`). Sobre `d269493` — "feat(api): sync reminder when a maintenance is corrected". Antes: `2018a11`, `9d80f09` (migración `20260922200000_idempotency_key_per_endpoint`, aplicada en Supabase; no borrarla ni renombrarla), `b92beb8` (C6). Sin push.

## Próximo paso

1. Decidir el rate limit (ver Pendiente) antes de usar el frontend contra la API real.
2. Decidir el orden de las pantallas del MVP en `apps/web` y empezar a consumir la API con `api` de `apps/web/src/lib/api/client.ts` (tras `pnpm api:generate`).
3. Opcional: validar el contrato con datos reales en el negocio "demo" y actualizar `06-API.md` con los 6 endpoints faltantes.
