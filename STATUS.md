# STATUS — Estado del proyecto

**Actualizado:** 2026-09-26

## Estado al 2026-09-26: R3 cerrado

- **R3 cerrado y publicado.** Commit `1588d85ad6fb6a0937314e777f604fa152ded7a2` "feat: termino la recepción, ajustes y alertas de inventario" (36 archivos, con la migración `20260925214438_r3_inventory_receipts`), con push a `origin/main` (`54f9488..1588d85`).
- `HEAD` = `origin/main` = `1588d85`, verificado también con `git ls-remote`. Árbol de trabajo limpio antes de este cambio de `STATUS.md`.
- **CI en verde** en GitHub Actions para `1588d85` (revisada por el usuario).
- **Migración de R3 aplicada en Supabase y Supabase alineado con `schema.prisma`** (detalle más abajo): 9 migraciones, `migrate status` al día y `migrate diff` sin diferencias.
- **Baseline estable: `1588d85`.** Lo que sigue en esta sección y en la del 2026-09-25 como "sin commit" o "siguiente" ya no aplica para R3.

### R4 definido en documentación (2026-09-26, sin código ni commit)

- **Decisiones aprobadas por el usuario:**
  - **DEC-30:** un solo método de pago por venta (`CASH` o `YAPE`). El pago mixto queda como decisión futura.
  - **Alcance:** R4 incluye la API de ventas de mostrador (crear, consultar, anular) y su UI (Vender, historial de ventas y anulación).
  - **`ProductSaleUnit`:** fuera de R4; `saleUnitId` no entra en el contrato.
  - **Stock insuficiente:** la venta aplica `BLOCK` fijo (DEC-26). No lee `Business.insufficientStockPolicy` ni permite "confirmar igual".
- **Fuera de R4:** lavados (R5), cobro de mantenimiento (R6), dashboard (R7), clientes (R8), pago mixto y la limpieza de `insufficientStockPolicy`.
- **Documentación:** `docs/09-BACKLOG.md` v0.6 (R3 cerrado; sección R4 con B-100, B-101 y B-130 a B-136; DEC-24 resuelta y B-904 retirado) y `docs/10-OPERACION-REAL.md` (§2.1, §2.5, §2.6, §2.7, §2.10 y §3.2e nueva). **Sin commit.**
- **R4 sin bloqueos y sin implementar:** el código empieza solo con autorización explícita del usuario. Antes, al prepararlo, el contrato va a `06-API.md` y las pantallas a `07-UI-UX.md`.

### Validación y migración de R3 (2026-09-26)

- **Validación final de R3 cerrada contra la base local `brigith_test`** (Postgres embebido en el puerto 55432, 9 migraciones con `r3_inventory_receipts`, `migrate status` al día). **Supabase no se tocó. Sin migraciones nuevas, sin commit ni push.**
- **Decisión del usuario aplicada:** `GET /inventory/alerts` excluye de `notCountedCount` los productos con `tracksStock = false` (el contador coincide con el filtro "Sin conteo"). Cubierto en `test/integration/inventory-alerts.int-spec.ts`.
- **Pruebas automáticas:** `typecheck`, `lint` (solo el warning de siempre en `apps/web/eslint.config.mjs`), `api:generate` y `build` OK. Unitarias 279/279, integración 49/49 y e2e 34/34 contra la base local.
- **Prueba manual a 390 px:** Chrome sin interfaz (Playwright en el scratchpad, porque la extensión de Chrome no estaba conectada), con la API compilada en el puerto 4000 y `next start` en el 3000, sobre un negocio desechable "R3 QA …" en `brigith_test`. Las 6 pasan, sin desborde horizontal:
  1. **Recibir:** chips "Aceite auto/moto", buscador sin inactivos, 3 líneas (+/−, decimal con coma), nota; la recepción guardada muestra "Saldo después". Validaciones: sin líneas y cantidad 0.
  2. **Recepciones:** historial y detalle correctos; id inexistente (404) e inválido (400) muestran "Recepción no encontrada".
  3. **Ingreso → Recibir:** abre Recibir con el producto agregado y el aviso; guarda y vuelve al producto con el movimiento `Ingreso`. Con un producto inactivo avisa y arranca vacío.
  4. **Ajustar:** "El sistema dice", vista previa (diferencia y resultante), botón deshabilitado sin diferencia, "Otro" exige detalle, motivo "Chip: detalle" y el historial "En el estante X · el sistema decía Y". Sin conteo ofrece Contar; un producto inactivo no se puede ajustar.
  5. **Alertas:** negativos y agotados salen después de recibir y de contar; "1 producto sin conteo" coincide con el chip "Sin conteo" (el producto que no controla stock no cuenta); "Ver y contar" activa el filtro y baja a la lista.
  6. **Inventario (regresión):** chips Todos / Sin conteo / Sin stock / Con stock, búsqueda, Contar y el historial de movimientos sin cambios.
- **Bugs encontrados:** ninguno en R3. Hallazgo menor, no corregido: falta `/favicon.ico` (404 en la consola, previo a R3). Detalle de formato: "Saldo después" muestra `4.5` con punto, aunque la cantidad se puede escribir con coma.
- En `brigith_test` quedan datos desechables (negocio "R3 QA aa651ff7", producto "Bujía sin conteo QA"). No van al seed ni a Supabase.
- **Migración de R3 aplicada en Supabase (2026-09-26, con autorización del usuario).** Destino confirmado antes de ejecutar: `DIRECT_URL` → `aws-0-us-east-1.pooler.supabase.com:5432/postgres` (pooler en modo sesión). Antes, `migrate status` mostraba solo `20260925214438_r3_inventory_receipts` pendiente. Se ejecutó únicamente `prisma migrate deploy`, que aplicó solo esa migración.
  - `_prisma_migrations`: 9 migraciones, 9 terminadas, 0 con rollback. Checksum de R3 `b5cb89d6…1a05e` = sha256 de `migration.sql`.
  - `inventory_receipts` existe con sus 6 columnas, la PK, el índice `inventory_receipts_businessId_occurredAt_idx` y las dos FK (`businessId` → `businesses`, `createdById` → `users`, `ON DELETE RESTRICT ON UPDATE CASCADE`). 0 filas.
  - `migrate status`: "Database schema is up to date!". `migrate diff` contra `schema.prisma`: "No difference detected".
  - Sin cambios de datos ni del seed, sin cambios de código, sin regenerar OpenAPI ni el cliente, sin commit ni push.
- **Siguiente (cumplido):** commit final `1588d85` y push a `origin/main`; CI verde.

## Estado al 2026-09-25

- **R2 y las correcciones previas a R3 ya tienen commit y están en `origin/main`** (lo que sigue en las secciones del 2026-09-24 como "sin commit" ya no aplica):
  - `2e27013` feat(catalog): implement R2 product catalog foundation
  - `d933504` fix: complete pre-R3 auth reminders CI and repo cleanup
  - `368fa31` fix(ci): generate Prisma client before api generation
- **CI en verde** en GitHub Actions con `368fa31` (confirmado por el usuario). Repo: https://github.com/Devmillerr/lubricentro-brigith
- **R2 cerrado y consolidado. Baseline estable previa a R3: `368fa31`.**
- Verificado el 2026-09-25: `HEAD` = `origin/main` = `368fa31`; `prisma migrate status` contra Supabase dice "Database schema is up to date" (8 migraciones, la última es `20260924011039_r2_catalog`); unitarias 238/238. Integración (22/22) y e2e (4/4) no se volvieron a correr: son los últimos resultados válidos.
- **R3 no iniciado.** No se escribe código, no se crean migraciones ni se preparan commits de R3 sin autorización explícita del usuario.
- **Prueba manual del login con el usuario `demo` cerrada (2026-09-25).** Se hizo contra la API local (puerto 4000) conectada a Supabase y la web en `next dev` (puerto 3000):
  - **Login incorrecto: OK.** Lo probó la IA en Chrome con una contraseña inventada. Muestra "Usuario o contraseña incorrectos.", marca los campos en rojo y no entra.
  - **Login correcto: OK.** Lo probó el usuario a mano: desde `/login` entra a Inicio.
  - **Persistencia de sesión tras recarga: OK** (usuario).
- **Ya no queda ningún pendiente funcional antes de R3.**
- **Preparación de R3 (2026-09-25, solo documentación, sin commit).** El usuario aprobó DEC-36, DEC-39 y DEC-48 a DEC-52: sin costo ni proveedor; motivos de ajuste como chips; no se ajusta sin conteo (409); ajuste sin diferencia (400 `NO_DIFFERENCE`); las alertas solo cuentan productos con conteo; no se opera sobre productos inactivos; la UI entra en R3. Se actualizaron `03` (BR-P6, BR-P7b, BR-P10, BR-P19, BR-P21), `06` y `07` (en una sección "Cambios de R3 (sin implementar)"), `09` (bloqueos de R3, decisiones y B-120 a B-126) y `10` §3.2d. **R3 sigue sin implementar:** el código, la migración y cualquier cambio en Supabase requieren autorización explícita.
- **Pendientes del piloto (registrados, sin resolver):** rate limit (`429` con `HTTP_ERROR`), mensajes de validación en inglés, `trust proxy`, DEC-01, DEC-03, DEC-10 (hosting), P-01 y P-13.

## Corte anterior (2026-09-24)

- **R1 cerrado:** commit `3316de6` "feat(api): implement stock ledger and cached inventory", ya en `origin/main`. Migración `20260924001851_r1_stock_ledger` aplicada en Supabase.
- **R2 (Catálogo) implementado y validado localmente**, sin commit:
  - Pruebas automáticas (sesión 2026-09-23 e): unitarias 225/225, integración 18/18 y e2e 1/1.
  - Validación visual a 390 px (2026-09-24) contra un Postgres local con la migración y el seed de R2: los 7 flujos pasan (catálogo, crear, editar, inactivo/Reactivar, búsqueda `21050`/`yaris`, `/configuracion/categorias`, inventario y selector de mantenimiento sin inactivos). Sin cambios de código.
  - Unidad `unidad` para los 27 filtros aprobada por el usuario.
- **R2 aplicado y verificado en Supabase (2026-09-24)**, con autorización del usuario. **Sin commit ni push.**
  - `prisma migrate deploy` aplicó solo `20260924011039_r2_catalog`. Checksum `9e6076a7…3a84` = sha256 del archivo. Terminada, sin rollback. `migrate status`: "Database schema is up to date". `migrate diff` contra `schema.prisma`: "No difference detected".
  - `seedBrigithCatalog` (de `prisma/seed-catalog.ts`) ejecutado **solo** para brigith, en una transacción, con un script fuera del repo (no se corrió `seed.ts` completo).
  - Resultado en brigith: 16 categorías sin duplicados (se conservaron Lubricante y Filtro de C2), 13 filtros de aire, 14 de aceite, 11 modelos sin `make`, 11 compatibilidades (solo filtros de aire; 2001 y 0Y040 sin compatibilidad). Sin precio, marca, imagen, viscosidad, presentación ni conteo; unidad `unidad`; 0 movimientos. No se crearon aceites ni fluidos.
  - Demo: huella md5 de negocio, usuarios, categorías, productos, modelos, compatibilidades y movimientos idéntica antes y después del seed.
  - Detalle: Lubricante y Filtro ya existían y el seed no las modifica (`update: {}`), así que las dos quedaron con `sortOrder` 0 y se ordenan por nombre (Filtro primero). En una base nueva, el seed pone Lubricante 0 y Filtro 1. Se puede reordenar desde Configuración → Categorías.
  - Pruebas después de aplicar: unitarias 225/225, integración 18/18 (Postgres local), e2e 1/1 (Supabase), `typecheck` de api y web OK.
- **Siguiente para R2:** commit cuando el usuario lo pida. **No iniciar R3.**
- Hallazgos menores de la validación, fuera de R2 (no corregir ahora): las facetas no reflejan el filtro "Inactivos"; las categorías nuevas entran con `sortOrder` 0 y pueden quedar arriba; mover una categoría con subcategorías solo se rechaza al guardar; se ve la barra de scroll de los chips en Chrome de escritorio angosto.

## Sesión 2026-09-24 (b): correcciones previas a R3 (sin commit ni push)

No se inició R3 ni se tocó el catálogo R2. El login correcto quedó pendiente de la prueba manual del usuario, que se hizo el 2026-09-25 (OK).

- **CI:** `.github/workflows/ci.yml` ya no pasa `with: version: 10` a `pnpm/action-setup@v4`. La versión sale de `packageManager` (`pnpm@10.15.0`). No se probó en GitHub Actions.
- **Recordatorios (`PATCH /reminders/:id`):** no se reabre uno `DONE` (409 `REMINDER_DONE`) ni uno cuyo mantenimiento de origen está `VOIDED` (409 `REMINDER_SOURCE_VOIDED`). Si ya hay otro abierto para el mismo vehículo y tipo, responde 409 `REMINDER_OPEN_EXISTS`, tanto por la verificación previa como si falla el único parcial (P2002). Ya no devuelve 500. Descartar uno ya cerrado devuelve 409 `REMINDER_ALREADY_CLOSED` para no pisar el motivo "mantenimiento anulado" ni "cumplido". `GET /reminders/:id` agrega `closeReason` y `reopenBlockedBy`. La web oculta "Reabrir" cuando `reopenBlockedBy` no es null y explica el motivo.
- **Inicio → búsqueda por placa:** `GET /vehicles/lookup` agrega `lastMaintenanceReminder {id, status}`, que es el recordatorio que generó el último mantenimiento. Se muestra como la insignia "Aviso: Pendiente/Contactado/Cumplido/Descartado" junto a "Próximo". El debounce pasó de 250 a 400 ms (`useDebouncedValue`).
- **Rate limit:** se mantiene el global (20/min por IP y endpoint). `/auth/login` tiene un límite propio de 5/min por IP (`LOGIN_THROTTLE`).
- **Pruebas:** unitarias 238/238, integración 22/22 (Postgres local embebido, puerto 55432, `brigith_test`), e2e 4/4 contra la base local y 3 + 1 omitida contra Supabase (el login correcto solo corre en bases `_test`). `typecheck`, `lint` (solo el warning de siempre), `build` y `api:generate` OK. También se verificó por HTTP contra la API local. **La UI no se probó en navegador** porque la extensión de Chrome no estaba conectada.
- **Decisiones del usuario:** se mantiene `REMINDER_ALREADY_CLOSED` (un recordatorio ya cerrado no se vuelve a descartar, BR-R12). La búsqueda por placa muestra solo el estado del recordatorio del último mantenimiento activo, sin historial (BR-R13).
- **Documentación:** `docs/03-BUSINESS-RULES.md` agrega BR-R11 (reapertura), BR-R12 y BR-R13. `docs/06-API.md` documenta los 409 nuevos, `closeReason`, `reopenBlockedBy`, `lastMaintenanceReminder`, el debounce de 400 ms, el límite de login y el rate limit en §4. No se tocó la documentación de R2.
- En la base local `brigith_test` quedaron datos desechables (negocio "UI QA …", placas QA*). No van al seed ni al repositorio, y no se tocaron en Supabase.
- **Higiene del repo:** `.gitignore` agrega `*.tsbuildinfo` y los archivos de instrucciones para agentes (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.cursorrules`, `.cursor/`, `.github/copilot-instructions.md`). Se sacaron del índice, con `git rm --cached` (la copia local sigue en disco), el `CLAUDE.md` de la raíz y `apps/web/tsconfig.tsbuildinfo`. `apps/web/AGENTS.md` y `apps/web/CLAUDE.md` los genera `next dev` y ahora quedan ignorados. Revisión de secretos sobre lo que entraría al commit: 0 valores reales de `.env`, 0 datos QA y ningún patrón de secreto real.
- **Siguiente:** el usuario prueba el login correcto a mano y revisa el diff. Después, commit si lo pide. **No iniciar R3.**

## Estado anterior (MVP)

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

- ~~Inicio — estado del recordatorio~~: resuelto en la sesión 2026-09-24 (b) (BR-R13).
- **Prueba manual en navegador** de todas las pantallas contra la API real (requiere usuario y datos en el negocio "demo"; escritura en Supabase pendiente de autorización).
- **Rate limit**: global de 20/min por IP y por endpoint, más un límite de 5/min por IP en `/auth/login` (sesión 2026-09-24 (b), documentado en 06-API §4). Todo en memoria. Sigue pendiente: 429 con `code: HTTP_ERROR` y texto en inglés, `Retry-After` no expuesto por CORS y sin `trust proxy` (DEC-10).
- **Mensajes de validación 400 en inglés** (class-validator): los formularios los muestran junto al campo tal cual. Poco probable en Configuración (el formulario valida antes), pero visible si ocurre.
- **Paso de CI** `pnpm api:generate`: verificado localmente, no en CI real.
- **Sincronización del recordatorio** (`f9fd66b`): probada con el fake de Prisma, no contra Postgres real.
- Ítems que dependen de Brigith (no de código): B-021/B-030/B-042 (DEC-22), B-023 (P-07, P-08), B-046 (P-02, P-03), B-053 / BR-W5 (P-01), B-061 (P-01), B-063 / BR-I4 (umbrales).
- `docs/09-BACKLOG.md` marca B-010 como "Config abierta"; cambiar ese estado queda a criterio del usuario.

## Bloqueos

- Ninguno para publicar el repositorio. DEC-22 sigue abierto (descuento de productos por unidad/presentación); C2–C4 usan el modelo provisional.
- Antes del piloto: decisiones de `docs/09-BACKLOG.md` §2 (DEC-01, DEC-03, DEC-05, DEC-10 hosting, P-01, P-13) y el rate limit.

## Sesión 2026-09-23

- **Publicado en GitHub** (hecho antes de esta sesión): `origin` = `https://github.com/Devmillerr/lubricentro-brigith.git`, rama `main` = `origin/main` (`ebc4c5e`), etiqueta `v1.0-mvp` en el remoto.
- **Lint de `apps/web` corregido**: `connectivity.tsx` y `use-form-draft.ts` usan `useSyncExternalStore` en vez de `setState` dentro de un efecto. El borrador del login se sigue leyendo de `localStorage` tras la hidratación; lo escrito en la pestaña tiene prioridad. No probado en navegador.
- **`docs/06-API.md`**: las filas agrupadas de `/vehicle-models` y `/products` se separaron en los 6 endpoints con sus campos.
- Commit `94a1a63` "fix(web): resolve lint issues and update API docs", ya en `origin/main`. `apps/web/AGENTS.md` y `apps/web/CLAUDE.md` (los crea `next dev`) quedaron ignorados en la sesión 2026-09-24 (b).

## Prueba manual en navegador (2026-09-23, negocio demo)

Hecha en Chrome contra la API local conectada a Supabase, con el usuario `demo`. Todos los módulos pasan: Inicio, Clientes, Productos, Inventario, Mantenimiento, Avisar, Configuración y Resumen. También se probaron los estados de carga, vacío y error (API detenida → "No se pudo cargar" + Reintentar) y el ancho de 390 px sin desborde. Auth: se probaron la recarga (mantiene la sesión), el logout y la redirección a `/login?next=`. **Falta que el usuario pruebe el login correcto e incorrecto** (la IA no escribe contraseñas).

Hallazgos (sin corregir):
- ~~**Medio:** reabrir un recordatorio cuyo mantenimiento se anuló~~: corregido en la sesión 2026-09-24 (b) (BR-R11, 409 `REMINDER_SOURCE_VOIDED`).
- **Menor:** la lista de Inventario incluye productos inactivos con el botón "Contar".
- **Menor:** en el detalle del aviso, el banner "¿No se abrió WhatsApp? Toca aquí" sigue visible después de Deshacer o Descartar.
- **Menor:** un producto inactivo no tiene "Reactivar" en su ficha.
- **Menor:** tras registrar un ingreso o un ajuste, el formulario de inventario vuelve a la pestaña "Contar".
- **Menor:** el precio se muestra sin moneda (`currency` no se usa todavía, según lo previsto).

Datos de prueba que quedan en demo (no se borraron: la UI solo desactiva, y borrar en Supabase requiere autorización): cliente "Cliente QA Editado" (tel. 999 000 111), vehículos ZZT-901 y QAA-222, modelo "PruebaQA ModeloQA", categoría "Categoria QA", productos "Aceite QA 20W50 Editado" (stock 14) y "Filtro QA desactivar" (inactivo), tipo "Cambio QA", 1 mantenimiento anulado, 1 recordatorio descartado, 6 movimientos de stock. Configuración de demo restaurada (días de anticipación vacío).

## Sesión 2026-09-23 (b) — Evolución a operación real (análisis y diseño, sin código)

- Pedido nuevo: pasar de MVP técnico a herramienta operativa (venta, recepción en lote, ajuste, lavado, cobro de mantenimiento, dashboard vivo, catálogo visual). Datos nuevos del dueño (viscosidades, presentaciones, precios de lavado, etc.) resumidos en `docs/10-OPERACION-REAL.md` §0; **aún no pasados** a `research/BRIGITH-DISCOVERY.md`.
- Entregadas Fase 1 (análisis) y Fase 2 (diseño) en **`docs/10-OPERACION-REAL.md`** (propuesta, sin aprobar). Ningún cambio de código.
- Base verificada al empezar: API 190/190 tests, `typecheck` limpio (api y web).
- Hallazgo: los códigos de filtros y compatibilidades que el pedido da por documentados **no están** en `research/` (P-08 sigue abierto).
- Sin commit.
- **v0.2 del documento** (misma sesión): respuestas confirmadas del dueño (cobro único del cambio de aceite, aceite de balde por litro o completo, criterios de lavado, códigos de filtros de aire y aceite) y rediseño de Clientes + Avisar (§2.11). Resueltas DEC-32 y DEC-22 (aceite de balde). Nuevas: DEC-41 a DEC-44 (incorporadas) y DEC-45 a DEC-47 (pendientes). §4 lista contradicciones con Discovery y `03-BUSINESS-RULES.md`, que **no** se actualizaron. Sin código y sin commit.

## Sesión 2026-09-23 (c) — Alineación al mapa funcional (solo documentación)

- El usuario entregó un **mapa funcional**. A partir de ahora es la referencia principal de cómo debe funcionar Brigith OS.
- `docs/10-OPERACION-REAL.md` pasa a la **v0.3**: el lavado ya no pide placa (DEC-33 retirada); ya no hay cierre del día (DEC-15 resuelta); se quitó el stock mínimo (DEC-28 resuelta) y el intervalo preferido por vehículo (DEC-35 retirada). Además: la búsqueda de Inicio es por cliente, vehículo o placa; el mantenimiento puede empezar desde el cliente; se agregó §2.12 Historial, con `GET /customers/:id/contacts`.
- Contradicciones corregidas en `01-VISION.md`, `02-PRD.md`, `03-BUSINESS-RULES.md` (BR-C10, BR-P15, BR-F5, BR-V1, BR-V3, BR-L2, BR-L3, BR-L4, BR-L6), `04-ARCHITECTURE.md` y `06-API.md` (se retiró `daily-close`).
- Sin tocar: `research/BRIGITH-DISCOVERY.md` (faltan los datos del dueño de §0), `docs/09-BACKLOG.md` (DEC-15, DEC-22, DEC-24 y las nuevas DEC-26 a DEC-47 aún no están en §2) y `docs/07-UI-UX.md`.
- Sin código, sin R1 y sin commit.

## Sesión 2026-09-23 (d) — Corte R1: StockLedger + saldo en caché (sin commit)

- Aprobados por el usuario: el mapa funcional y las decisiones DEC-26, DEC-27, DEC-29, DEC-31 y DEC-38 (`docs/10-OPERACION-REAL.md` §3.2c). DEC-05 queda resuelta por DEC-26/27.
- **`src/inventory/stock-ledger.ts`** (`applyStockMovements`): es el único escritor de movimientos. Bloquea los productos con `FOR UPDATE` en orden de id, evalúa la política `BLOCK`/`WARN` antes de escribir y, en la misma transacción, inserta los movimientos (con `resultingBalance` y `createdById`) y actualiza `Product.stockQuantity`/`isCounted`. Lo usan `InventoryService` (conteo, ingreso y ajuste) y `MaintenancesService` (uso y anulación).
- **DEC-26 en mantenimiento:** avisa y guarda aunque `Business.insufficientStockPolicy` sea `BLOCK`. El 422 queda para la venta (R4), que aplica `BLOCK` fijo sin leer esa configuración (decisión del 2026-09-26).
- **Deadlock encontrado y corregido:** el mantenimiento insertaba los ítems (su FK toma un lock compartido sobre el producto) antes del `FOR UPDATE`. Ahora el stock se aplica primero, con el id del mantenimiento generado de antemano.
- `GET /inventory/stock` y `GET /products?includeStock=true` leen la caché (se eliminó el N+1). `ProductsService` ya no depende de `InventoryService`.
- Contrato: se agregaron `stockQuantity`/`isCounted` en `ProductResponse` y `resultingBalance`/`createdById` en `InventoryMovementResponse`. `openapi.json` y el cliente web están regenerados; no hay cambios incompatibles.
- **Migración nueva `20260924001851_r1_stock_ledger`** (aditiva): columnas nuevas, FK a `users` y backfill de la caché desde los movimientos existentes. Probada **solo en un Postgres local de prueba**. **No aplicada en Supabase** (requiere autorización). Las migraciones existentes no se tocaron.
- Pruebas: unitarias 205/205 (23 suites; nuevas: `stock-ledger.spec.ts` y `stock-ledger.single-writer.spec.ts`). Integración 11/11 (`test/integration/`, `pnpm --filter @brigith/api test:integration` con `TEST_DATABASE_URL` apuntando a una base `*_test`). E2E 1/1. `typecheck`, `lint` y `build` OK. CI ahora corre el paso de integración.
- Docs: `03-BUSINESS-RULES.md` (BR-P11, BR-P12), `05-DATABASE.md`, `06-API.md`, `09-BACKLOG.md` (DEC-05) y `10-OPERACION-REAL.md` §3.
- Sin commit ni push.
- **Migración R1 aplicada en Supabase** con autorización del usuario (`prisma migrate deploy`). Antes de aplicarla se comprobó que el checksum del archivo (`6ba12e9c…a3e8`) es el mismo que se aplicó en la prueba local. Verificación posterior:
  - la migración quedó terminada y sin rollback;
  - columnas y FK presentes;
  - `migrate diff` contra `schema.prisma` no muestra diferencias;
  - backfill correcto en los 2 productos de demo: "Aceite QA 20W50 Editado" con caché 14 = suma de 6 movimientos e `isCounted` = true; "Filtro QA desactivar" con 0, sin movimientos e `isCounted` = false. Sin movimientos modificados.
  - Pruebas posteriores: unitarias 205/205, integración 11/11 y e2e 1/1 (local y contra Supabase).
- Decisiones del usuario: `resultingBalance` se mantiene en **todos** los movimientos. `Business.insufficientStockPolicy` **no** se retira por ahora; queda para un corte de limpieza.

## Sesión 2026-09-23 (e) — Corte R2: Catálogo (sin commit, sin aplicar en Supabase)

- Plan R2 aprobado con ajustes (`docs/10-OPERACION-REAL.md` §2.2b). DEC-34: solo `imageKey` y placeholder, sin subida. DEC-37: árbol de 2 niveles debajo de Lubricante y Filtro, sin renombrar nada.
- **API:**
  - Categorías con `parentId`/`sortOrder`/`isActive` (máximo 2 niveles, sin ciclos) y `PATCH /product-categories/:id` nuevo. Errores `CATEGORY_DEPTH_EXCEEDED` y `CATEGORY_IN_USE`.
  - `GET /product-categories` devuelve `productCount` y acepta `?includeInactive`.
  - Productos con `viscosity`/`presentation`/`imageKey` opcionales. `GET /products` filtra por `isActive`, marca, viscosidad, presentación y `missingPrice`; `categoryId` incluye sus subcategorías; la búsqueda cubre el vehículo compatible.
  - `GET /products/facets` nuevo. El PATCH acepta `null` para dejar valores pendientes, y reactivar = `isActive: true`.
  - `VehicleModel.make` opcional. Corregido el parseo de `includeStock` (`QueryBoolean`).
- **Web:**
  - `/productos` es ahora un catálogo visual: chips de categoría y subcategoría, filtros por facetas, "Sin precio", "Inactivos" y tarjetas con placeholder.
  - `ProductForm` usa chips (`CategoryPicker`, `AttributePicker`) y permite borrar precio, marca y código.
  - La ficha tiene "Reactivar". Pantalla nueva `/configuracion/categorias`.
  - Inventario y el selector del mantenimiento piden solo productos activos. El modelo de vehículo acepta marca vacía.
- **Migración nueva `20260924011039_r2_catalog`** (aditiva). Probada en el Postgres local. **No aplicada en Supabase.**
- **Seed** `prisma/seed-catalog.ts` (solo brigith): 16 categorías, 13 filtros de aire, 14 de aceite y 11 compatibilidades; 2001 y 0Y040 sin compatibilidad. Probado dos veces en local (idempotente). **No ejecutado en Supabase.**
- Pruebas: unitarias 225/225, integración 18/18 (nuevo `test/integration/catalog.int-spec.ts`), e2e 1/1. `typecheck`, `lint` y `build` OK. **UI no probada en navegador** (la extensión de Chrome no estaba conectada): solo se verificó que las páginas compilan y responden 200 en `next dev`.
- Docs: `03` (BR-P18, BR-P19b, BR-F6), `05`, `06` y `10` (§2.2b, R2, DEC-34/37).
- Sin commit ni push.

## Último commit

`368fa31` "fix(ci): generate Prisma client before api generation", sobre `d933504` (pre-R3), `2e27013` (R2), `3316de6` (R1) y `ba39d83` (`v1.0-mvp`). Todo en `origin/main`, CI en verde. Las migraciones `20260922200000_idempotency_key_per_endpoint`, `20260924001851_r1_stock_ledger` y `20260924011039_r2_catalog` están aplicadas en Supabase: no borrarlas, renombrarlas ni modificarlas.

## Próximo paso

1. ~~Probar el login correcto e incorrecto con el usuario `demo`~~: hecho el 2026-09-25 (correcto, incorrecto y recarga OK).
2. R3: la documentación ya está alineada (sin commit). **Paso 2 hecho (2026-09-25, sin commit):** `stock-ledger.ts` acepta `ADJUSTMENT` con `physicalQuantity`. La diferencia se calcula contra el saldo con la fila bloqueada, y se guardan `previousBalance`, `countedQuantity` (la cantidad física) y `resultingBalance`. Rechazos: `PRODUCT_INACTIVE` (409), luego `ADJUSTMENT_REQUIRES_COUNT` (409) y luego `NO_DIFFERENCE` (400). No marca `isCounted`. El ajuste por delta sigue igual porque la API todavía lo usa. 9 pruebas nuevas en `test/stock-ledger.spec.ts`: unitarias 247/247, `typecheck` y `lint` OK. **Concurrencia del ajuste físico probada contra Postgres real (2026-09-25, sin commit):** 6 pruebas nuevas en `test/integration/stock-ledger.int-spec.ts`. Cubren el ajuste esperando el bloqueo de una transacción sin confirmar (parte del saldo confirmado, 15, y no del 10 obsoleto), `NO_DIFFERENCE` cuando el saldo llegó a lo físico mientras esperaba, dos ajustes simultáneos al mismo valor (uno escribe), ajustes mezclados con entradas (caché = suma), rollback completo ante `ADJUSTMENT_REQUIRES_COUNT` con dos productos, y `PRODUCT_INACTIVE`. Sin cambios en `StockLedger`. Integración 28/28 (tres corridas), unitarias 247/247, `lint` y `typecheck` OK. Postgres local: `embedded-postgres` en el puerto 55432, base `brigith_test`, datos en el scratchpad de la sesión (el directorio de la sesión anterior estaba incompleto), con las 8 migraciones existentes aplicadas solo ahí. **Persistencia de `InventoryReceipt` (2026-09-25, sin commit):** modelo nuevo en `schema.prisma` (tabla `inventory_receipts`: `id`, `businessId`, `occurredAt`, `note?`, `createdById`, `createdAt`; índice `[businessId, occurredAt]`; FK a `businesses` y `users` con `RESTRICT`). Las líneas son `PURCHASE_IN` con `refType = 'InventoryReceipt'` y `refId`, sin FK, como en `Maintenance`. `InventoryMovement` no cambió. `InventoryReceipt` se agregó a `BUSINESS_SCOPED_MODELS` (`src/prisma/business-scope.ts`). Migración aditiva `20260925214438_r3_inventory_receipts`, aplicada **solo** en la base local `brigith_test`: `migrate status` al día y `migrate diff` sin diferencias. **No aplicada en Supabase.** `prisma validate`, `prisma format --check` y `prisma generate` OK; `typecheck`, `lint`, unitarias 247/247 e integración 28/28 OK. **Servicio de recepción en lote (2026-09-25, sin commit, sin endpoint):** `InventoryService.createReceiptBatch(businessId, userId, { id?, occurredAt?, note?, lines })`, con tipo de entrada interno (`ReceiptBatchInput`); no hay DTO público todavía. El `receipt()` actual sigue sirviendo al endpoint existente. Antes de la transacción valida de 1 a 100 líneas (`VALIDATION_ERROR`), cantidad > 0 (`VALIDATION_ERROR` por línea) y productos sin repetir (`DUPLICATE_PRODUCT_LINE`). Dentro de una sola `forBusiness(...).$transaction` llama primero al `StockLedger` (bloqueo por id; `PRODUCT_NOT_FOUND` para inexistentes o de otro negocio; `PRODUCT_INACTIVE` con la opción nueva `requireActiveProduct` de `StockEntry`, evaluada con la fila bloqueada) y después crea la cabecera, igual que el mantenimiento. El `id` del cliente se usa si viene (`?? randomUUID()`). La idempotencia sigue en la capa HTTP (`IdempotencyService`). En `stock-ledger.ts`, `assertAdjustable` se separó en `assertActive` y `assertCounted`. Pruebas: 14 unitarias nuevas en `test/inventory.service.spec.ts` y 10 de integración en `test/integration/inventory-receipts.int-spec.ts` (rollback por producto inactivo, por inexistente y por fallo de la cabecera después de escribir las líneas; aislamiento; idempotencia; espera del bloqueo; recepciones y consumos simultáneos sin deadlock). Unitarias 261/261, integración 38/38 (tres corridas), `lint` y `typecheck` OK. **Endpoint `POST /inventory/receipts` con el contrato de R3 (2026-09-25, sin commit):**
  - `CreateReceiptDto`/`ReceiptLineDto` con mensajes en español (1–100 líneas, `quantity > 0`, `id`/`occurredAt`/`note` opcionales); los duplicados los rechaza el servicio con `DUPLICATE_PRODUCT_LINE`.
  - El controlador delega en `createReceiptBatch()` dentro de `IdempotencyService`, como el resto de `POST /inventory/*`, y responde 201 `InventoryReceiptResponse` `{ id, businessId, occurredAt, note, createdById, createdAt, lines }` (forma aprobada por el usuario, anotada en `06-API.md`).
  - `@ApiErrors` documenta `DUPLICATE_PRODUCT_LINE`, `PRODUCT_NOT_FOUND` y `PRODUCT_INACTIVE`. El `id` repetido conserva el error genérico (decisión del usuario).
  - `InventoryService.receipt()` (un producto, sin cabecera) ya no tiene endpoint: solo lo usan las pruebas.
  - Web, adaptación mínima autorizada: la pestaña "Ingreso" de `stock-operation-form.tsx` envía `{ lines: [{ productId, quantity }], occurredAt? }` y sigue mostrando el `PURCHASE_IN` creado; el error de cantidad se lee de `lines.0.quantity`, con un mensaje propio para `PRODUCT_INACTIVE`. Sin pantalla Recibir, historial ni alertas.
  - `pnpm api:generate` OK (`openapi.json` y el cliente están en `.gitignore`: los regenera CI).
  - Pruebas: e2e nuevo `test/inventory-receipts.e2e-spec.ts` (11 casos: 201 con la forma exacta, `InventoryReceipt` + `PURCHASE_IN` + saldo, idempotencia, falta de `Idempotency-Key`, validación en español, contrato viejo rechazado, duplicado, inexistente, otro negocio, inactivo, 401). Unitarias 261/261, integración 38/38 y e2e 15/15 contra la base local; `lint` (solo el warning de siempre), `typecheck` y `build` OK. **No probado en navegador.**
  - **`GET /inventory/receipts` y `GET /inventory/receipts/:id` (2026-09-25, sin commit).** El usuario aprobó las formas: la lista devuelve `InventoryReceiptSummaryPage` `{ items, nextCursor }`, donde cada elemento es la cabecera más `lineCount`, sin líneas. El detalle devuelve el mismo `InventoryReceiptResponse` que el `POST`.
    - Servicio: `listReceipts()` ordena por `occurredAt` desc con `id` desc como desempate y usa el cursor por `id` de siempre (`paginate`). Hace dos consultas por página: cabeceras y un `groupBy` de `PURCHASE_IN` por `refId`, sin N+1. `getReceipt()` busca por `id` con `forBusiness` y devuelve las líneas por `refType`/`refId`, ordenadas por `productId`, porque el orden de envío no se guarda. Si no existe o es de otro negocio, 404 `RECEIPT_NOT_FOUND`. `:id` pasa por `ParseUUIDPipe`. `createReceiptBatch()` no cambió.
    - Fake de pruebas (`test/support/fake-scoped-prisma.ts`): ahora acepta `orderBy` como lista (desempate) y `groupBy` con `_count._all`.
    - Pruebas: 8 unitarias nuevas (lista vacía, orden, cursor con empates, dos consultas por página, aislamiento, detalle, inexistente, otro negocio), 5 de integración contra Postgres y 5 e2e (forma de la lista y del detalle, paginación, 404, 400, 401). Resultados: unitarias 269/269, integración 43/43 (dos corridas), e2e 20/20 contra la base local. `typecheck`, `lint` (solo el warning de siempre), `build` y `api:generate` OK. Sin migraciones nuevas y sin cambios en Supabase.
  - **`POST /inventory/adjustments` con cantidad física (2026-09-25, sin commit).** Cambio incompatible: `CreateAdjustmentDto` pasa a `{ productId, physicalQuantity ≥ 0, reason }`, con mensajes en español y un motivo que no puede quedar en blanco. `InventoryService.adjustment()` le pasa `physicalQuantity` al StockLedger, que ya tenía la lógica física, y el StockLedger no cambió. Responde 201 `InventoryMovementResponse`, que incluye los campos documentados más `countedQuantity`, `id`, `productId` y `type`. `@ApiErrors` agrega `NO_DIFFERENCE` (400), `ADJUSTMENT_REQUIRES_COUNT` y `PRODUCT_INACTIVE` (409).
    - Web, adaptación mínima elegida por el usuario: la pestaña "Ajuste" mantiene Entra/Sale + cantidad y envía `physicalQuantity = saldo mostrado ± cantidad`, redondeado a 3 decimales. Si el resultado da negativo, se rechaza antes de enviar, porque la API ya no admite un físico negativo. Tiene mensajes para `ADJUSTMENT_REQUIRES_COUNT` y `NO_DIFFERENCE`. Riesgo aceptado: si el saldo en pantalla está desactualizado, el estante queda en ese valor calculado. Se reemplaza con la pantalla Ajustar.
    - Pruebas: los tests que usaban `quantityDelta` pasan a `physicalQuantity`. La prueba de concurrencia mixta llama directo al ledger con ajustes por delta. Hay 5 unitarias nuevas (subir y bajar a 0, sin conteo, sin diferencia, inactivo, otro negocio), 2 de integración más una verificación de aislamiento, y un e2e nuevo `test/inventory-adjustments.e2e-spec.ts` con 11 casos. Resultados: unitarias 274/274, integración 45/45 y e2e 31/31 contra la base local. `typecheck`, `lint` (solo el warning de siempre), `build` y `api:generate` OK. Sin migraciones ni cambios en Supabase. **No probado en navegador.**
  - **`GET /inventory/alerts` (2026-09-25, sin commit).** Aplica DEC-50 y BR-P19: solo productos activos del negocio. `outOfStock` (saldo = 0) y `negative` (saldo < 0) solo incluyen productos con conteo; los que no tienen conteo solo suman en `notCountedCount`. Lee la caché de `Product` con dos consultas: `findMany` con saldo ≤ 0, por nombre y luego `id`, y un `count`. El usuario aprobó la forma de cada elemento: `{ productId, name, unit, balance }`, sin paginar. Responde `StockAlertsResponse`. El fake de pruebas ahora acepta `lte`/`lt` y `count`.
    - Pruebas: 4 unitarias (vacío, clasificación, inactivos, aislamiento), un archivo de integración nuevo `test/integration/inventory-alerts.int-spec.ts` (4 casos con saldos que salen de conteo, consumo, recepción y ajuste físico reales) y un e2e nuevo `test/inventory-alerts.e2e-spec.ts` (3 casos: vacío, forma y clasificación con inactivos y otro negocio, 401). Resultados: unitarias 278/278, integración 49/49 y e2e 34/34 contra la base local. `typecheck`, `lint` (solo el warning de siempre), `build` y `api:generate` OK. Sin migraciones, sin cambios en Supabase y sin UI.
  - **UI de R3, primer bloque: Recibir e historial de recepciones (2026-09-25, sin commit).** Autorizado por el usuario; sin Ajustar ni alertas.
    - Rutas nuevas: `/inventario/recepciones` (historial, `GET /inventory/receipts`, 20 por página con "Cargar más"; fecha, cantidad de productos y nota), `/inventario/recepciones/nueva` (Recibir, `POST /inventory/receipts`) y `/inventario/recepciones/[id]` (detalle, `GET /inventory/receipts/:id`; producto, `+cantidad` y "Saldo después"; 404/400 como "Recepción no encontrada"). Inventario tiene en su cabecera **Recibir** y **Recepciones** (solo ícono en 390 px).
    - Recibir: buscador del catálogo (solo activos, `includeStock`) con chips de categoría y subcategoría, más los chips rápidos "Aceite auto" y "Aceite moto" (se buscan por nombre en las categorías; si no existen, no aparecen). La lista aparece al buscar o elegir un chip. Tocar un producto ya agregado le suma 1. Cada línea tiene −/+ y teclado (decimales con coma o punto, hasta 3). Fecha y nota opcionales. Valida antes de enviar: sin líneas, cantidad ≤ 0 o inválida, más de 100 líneas, repetidos y nota > 500. Los errores `lines.N.*` de la API se marcan en su línea; `PRODUCT_INACTIVE`, `PRODUCT_NOT_FOUND`, `DUPLICATE_PRODUCT_LINE` e idempotencia tienen mensaje propio. `Idempotency-Key` por cuerpo, como el resto. Al guardar, se muestra la recepción guardada con "Nueva recepción" y "Ver inventario".
    - Archivos: `lib/inventory/receipts.ts`, `components/inventory/receipt-form.tsx`, `receipt-product-picker.tsx`, `receipt-detail.tsx`, las tres páginas y la cabecera de `inventario/page.tsx`. **"Ingreso" lleva a Recibir (2026-09-25, sin commit, decisión del usuario):** la pestaña sigue visible en el inventario del producto, pero ahora es un enlace (con flecha) a `/inventario/recepciones/nueva?producto=<id>`. Recibir carga el producto (`findProduct` + saldo fresco de `GET /inventory/stock`), lo deja agregado con cantidad 1 y muestra un aviso "Los ingresos se registran como recepción". Si el producto está inactivo o no existe, lo avisa y el formulario arranca vacío. "Volver al producto" reemplaza al enlace de vuelta. Se quitó de `stock-operation-form.tsx` el envío de una línea a `POST /inventory/receipts`: toda recepción pasa por `ReceiptForm`. Las pestañas pasan de `role="tab"` a botones con `aria-pressed` porque una de ellas ahora es un enlace. Sin cambios en la API. `apps/web` no tiene pruebas automatizadas (su `test` es un placeholder), así que no se agregaron. `typecheck`, `lint` y `build` OK. No probado en navegador.
    - Validación: `typecheck`, `lint` (solo el warning de siempre) y `build` OK. **No probado en navegador** (ni a 390 px): la tabla `inventory_receipts` solo existe en la base local de pruebas, no en Supabase.
  - **UI de R3, segundo bloque: Ajustar y stock que requiere atención (2026-09-25, sin commit).** Sin cambios en la API ni en Recepciones.
    - **Ajustar** es la pestaña "Ajuste" del inventario del producto (`stock-operation-form.tsx`); no hay otra pantalla. Se reemplazó Entra/Sale + cantidad por: "El sistema dice: N", "Lo que hay en el estante" (≥ 0, decimales), motivo con chips (Conteo físico distinto · Producto dañado · Consumo interno · Otro) y un detalle opcional (obligatorio con "Otro"). Vista previa con la diferencia y el stock resultante. Se envía `{ productId, physicalQuantity, reason }`, con `reason` = "Chip: detalle", el chip solo, o el detalle con "Otro". Si la cantidad es igual al saldo, se avisa y el botón queda deshabilitado (DEC-49). Si no hay conteo, en vez del formulario se ofrece **Contar** (DEC-48). Si el producto está inactivo, se explica que no se puede ajustar (BR-P21; la página pasa `productActive`). Siguen los mensajes para `NO_DIFFERENCE`, `ADJUSTMENT_REQUIRES_COUNT` y `PRODUCT_INACTIVE` por si el saldo cambió en el servidor. El atajo que calculaba `saldo ± cantidad` ya no existe (se cierra el riesgo aceptado del saldo desactualizado). Contar no cambió.
    - **Historial de movimientos:** un `ADJUSTMENT` con cantidad física muestra "En el estante X · el sistema decía Y".
    - **Stock que requiere atención** (`components/inventory/stock-alerts.tsx`), arriba de la lista de Inventario, con `GET /inventory/alerts`: negativos y agotados en grupos separados (5 filas y "Ver todos"), cada fila con enlace al inventario del producto. `notCountedCount` va aparte, con "Ver y contar", que activa el filtro "Sin conteo" y baja a la lista. Si no hay agotados ni negativos, lo dice. Si falla, muestra un error con reintento sin bloquear la lista.
    - **Hallazgo (corregido el 2026-09-26 por decisión del usuario):** `GET /inventory/alerts` no filtraba por `tracksStock`, así que `notCountedCount` incluye productos que no controlan stock (BR-P16). El filtro "Sin conteo" de la web sí los excluye, y los números pueden no coincidir. Hoy la siembra solo crea productos con `tracksStock: true`. Hay que decidir si es un bug de la API.
    - `typecheck`, `lint` (solo el warning de siempre) y `build` OK. **No probado en navegador.**
  - ~~Prueba manual en navegador de toda la UI de R3 a 390 px~~: hecha el 2026-09-26 (ver "Estado al 2026-09-26"). Migración aplicada en Supabase y commit `1588d85` publicado (2026-09-26): **R3 cerrado.**
3. Antes del piloto: rate limit (`429`, `Retry-After`), mensajes en inglés, `trust proxy` y decisiones DEC-01, DEC-03, DEC-10 (hosting), P-01 y P-13.
4. Corte de limpieza: retirar `Business.insufficientStockPolicy` de Configuración y de la API (hoy no tiene efecto, y la venta de R4 tampoco lo leerá: usa `BLOCK` fijo), y los hallazgos menores de UI.
5. **R4 (ventas de mostrador + su UI):** definido en documentación el 2026-09-26 (ver "R4 definido en documentación"). Sin bloqueos; empieza solo con autorización explícita del usuario.
