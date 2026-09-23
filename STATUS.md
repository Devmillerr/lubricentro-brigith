# STATUS — Estado del proyecto

**Actualizado:** 2026-09-23

## Corte actual

**MVP funcional terminado y preparado para publicar.** Backend C0–C6 y todas las pantallas de 07-UI-UX.md §3 en `apps/web`. Etiqueta **`v1.0-mvp` → `ba39d83`** ("feat(web): complete MVP dashboard and business settings", ya con el historial limpio). Rama `mvp-v1` en el mismo commit.

Commits principales (hashes posteriores a la limpieza del historial): contrato OpenAPI + cliente tipado (`04ca1ad`), sesión y shell (`97ea903`), clientes y vehículos (`a31a1a9`), productos y compatibilidades (`ce596af`), inventario (`553d717`), mantenimientos (`0889bc2`), Avisar + WhatsApp (`1a58417`), Inicio con búsqueda por placa + Resumen del piloto + Configuración (`ba39d83`).

Últimas pantallas (`ba39d83`):

- **Inicio** (§3.1): búsqueda por placa mientras se escribe (`GET /vehicles/lookup`, misma normalización que BR-C6) con vehículo, cliente, último mantenimiento, último km, próximo km/fecha y **Nuevo mantenimiento**; sin coincidencia exacta, "Crear vehículo con esta placa" (`/vehiculos/nuevo?placa=`, vehículo sin cliente, BR-C4). Resumen del mes y accesos a Avisar y Clientes.
- **Resumen del piloto** (§3.8): `/resumen`, períodos predefinidos o fechas elegidas; conteos de BR-I1 a BR-I3 sin metas (BR-I4 pendiente).
- **Configuración** (§3.7): `/configuracion` con `GET /business` + `PATCH /business/settings` (solo campos cambiados; vacío = `null`); cada valor sin definir explica qué hace el sistema mientras tanto. Comprobado contra la API real sin escribir datos (200, 401, 400 por campo).

## Seguridad antes de publicar

- **Secretos reales rotados:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` y `SEED_OWNER_PASSWORD` coincidían con los de `apps/api/.env.example`. Se generaron valores aleatorios nuevos en `apps/api/.env` (no versionado) y se actualizó en Supabase solo el `passwordHash` del usuario `brigith` (argon2id), sin tocar datos del negocio. Las sesiones anteriores quedaron invalidadas. El seed no cambia contraseñas de usuarios existentes (`upsert` con `update: {}`).
- **`.env.example` con placeholders** (`replace-with-a-random-secret`, `replace-with-a-development-password`) y el comando para generar secretos: commit `585fb5d` "security: remove real secrets from env example".
- **Historial limpiado** con `git filter-branch` (solo esas 3 líneas de `apps/api/.env.example`, en los 22 commits previos; mismos mensajes, autores, fechas y código). Todos los hashes anteriores a `585fb5d` cambiaron (p. ej. `7eab816` → `ba39d83`). Respaldo del estado previo fuera del repo: `D:/dev/brigith-backup/` (bundle verificado; contiene los valores antiguos, ya inválidos: no publicarlo).
- **Escaneo final:** 0 apariciones de los valores antiguos y de los actuales (`.env`) en commits, mensajes y archivos trackeados; 0 coincidencias de patrones de secretos (JWT, claves de Supabase/GitHub, API keys, llaves privadas, URLs de Postgres con contraseña). `.env`, `.next`, `dist` y `node_modules` ignorados.

**Checks actuales:** API: unitarios **190/190** (21 suites), `typecheck` y `lint` limpios. Web: `typecheck`, `lint` (0 errores; 1 warning de `eslint.config.mjs`) y `next build` OK. Sin pruebas automáticas en `apps/web`. No probado en navegador contra la API real.

## Pendiente

- **Inicio — estado del recordatorio**: §3.1 pide mostrarlo en el resultado, pero `GET /vehicles/lookup` no lo devuelve. Opciones: agregarlo a la respuesta de lookup (cambio de API + contrato) o dejarlo en la ficha. Sin decidir.
- **Prueba manual en navegador** de todas las pantallas contra la API real (requiere usuario y datos en el negocio "demo"; escritura en Supabase pendiente de autorización).
- **Rate limit** (sin modificar): `ttl 60 s / limit 20` por IP y por endpoint, en memoria; 429 con `code: HTTP_ERROR` y texto en inglés, sin documentar; `Retry-After` no expuesto por CORS; `/auth/login` sin límite propio; sin `trust proxy` (DEC-10). La búsqueda por placa con debounce hace más llamadas a `/vehicles/lookup`: tenerlo en cuenta al decidir el límite.
- **Mensajes de validación 400 en inglés** (class-validator): los formularios los muestran junto al campo tal cual. Poco probable en Configuración (el formulario valida antes), pero visible si ocurre.
- **Paso de CI** `pnpm api:generate`: verificado localmente, no en CI real.
- **Sincronización del recordatorio** (`f9fd66b`): probada con el fake de Prisma, no contra Postgres real.
- Ítems que dependen de Brigith (no de código): B-021/B-030/B-042 (DEC-22), B-023 (P-07, P-08), B-046 (P-02, P-03), B-053 / BR-W5 (P-01), B-061 (P-01), B-063 / BR-I4 (umbrales).
- `docs/09-BACKLOG.md` marca B-010 como "Config abierta"; cambiar ese estado queda a criterio del usuario.

## Bloqueos

- Ninguno para publicar el repositorio. DEC-22 sigue abierto (descuento de productos por unidad/presentación); C2–C4 usan el modelo provisional.
- Antes del piloto: decisiones de `docs/09-BACKLOG.md` §2 (DEC-01, DEC-03, DEC-05, DEC-10 hosting, P-01, P-13) y el rate limit.

## Sesión 2026-09-23 (sin commit)

- **Publicado en GitHub** (hecho antes de esta sesión): `origin` = `https://github.com/Devmillerr/lubricentro-brigith.git`, rama `main` = `origin/main` (`ebc4c5e`), etiqueta `v1.0-mvp` en el remoto.
- **Lint de `apps/web` corregido**: `connectivity.tsx` y `use-form-draft.ts` usan `useSyncExternalStore` en vez de `setState` dentro de un efecto. El borrador del login se sigue leyendo de `localStorage` tras la hidratación; lo escrito en la pestaña tiene prioridad. No probado en navegador.
- **`docs/06-API.md`**: las filas agrupadas de `/vehicle-models` y `/products` se separaron en los 6 endpoints con sus campos.
- Sin commitear: `apps/web/src/lib/connectivity.tsx`, `apps/web/src/lib/use-form-draft.ts`, `docs/06-API.md`, este archivo. Sin trackear: `apps/web/AGENTS.md` y `apps/web/CLAUDE.md` (los crea `next dev`; decidir si se versionan).

## Último commit

"docs(status): sync final pre-release status" (`ebc4c5e`), sobre `585fb5d` y `ba39d83` (`v1.0-mvp`). Ya en `origin/main`. La migración `20260922200000_idempotency_key_per_endpoint` está aplicada en Supabase: no borrarla ni renombrarla.

## Próximo paso

1. Revisar y commitear los cambios de esta sesión (lint + docs) y hacer push para que CI pase el paso "Lint".
2. Prueba manual en navegador de todo el flujo contra la API real (incluido un guardado real de Configuración, con autorización). La contraseña del dueño está en `SEED_OWNER_PASSWORD` de `apps/api/.env`.
3. Decidir el estado del recordatorio en la búsqueda por placa y el rate limit antes del piloto.
