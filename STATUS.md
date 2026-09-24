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

## Sesión 2026-09-23

- **Publicado en GitHub** (hecho antes de esta sesión): `origin` = `https://github.com/Devmillerr/lubricentro-brigith.git`, rama `main` = `origin/main` (`ebc4c5e`), etiqueta `v1.0-mvp` en el remoto.
- **Lint de `apps/web` corregido**: `connectivity.tsx` y `use-form-draft.ts` usan `useSyncExternalStore` en vez de `setState` dentro de un efecto. El borrador del login se sigue leyendo de `localStorage` tras la hidratación; lo escrito en la pestaña tiene prioridad. No probado en navegador.
- **`docs/06-API.md`**: las filas agrupadas de `/vehicle-models` y `/products` se separaron en los 6 endpoints con sus campos.
- Commit `94a1a63` "fix(web): resolve lint issues and update API docs", ya en `origin/main`. Sin trackear: `apps/web/AGENTS.md` y `apps/web/CLAUDE.md` (los crea `next dev`; decidir si se versionan).

## Prueba manual en navegador (2026-09-23, negocio demo)

Hecha en Chrome contra la API local conectada a Supabase, con el usuario `demo`. Todos los módulos pasan: Inicio, Clientes, Productos, Inventario, Mantenimiento, Avisar, Configuración y Resumen. También se probaron los estados de carga, vacío y error (API detenida → "No se pudo cargar" + Reintentar) y el ancho de 390 px sin desborde. Auth: se probaron la recarga (mantiene la sesión), el logout y la redirección a `/login?next=`. **Falta que el usuario pruebe el login correcto e incorrecto** (la IA no escribe contraseñas).

Hallazgos (sin corregir):
- **Medio:** `PATCH /reminders/:id` permite reabrir (PENDING) un recordatorio descartado porque se anuló su mantenimiento (BR-M12); la UI ofrece "Reabrir recordatorio". Falta decidir si se bloquea.
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
- **DEC-26 en mantenimiento:** avisa y guarda aunque `Business.insufficientStockPolicy` sea `BLOCK`. El 422 queda para la venta (R4).
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

## Último commit

"fix(web): resolve lint issues and update API docs" (`94a1a63`), sobre `ebc4c5e`, `585fb5d` y `ba39d83` (`v1.0-mvp`). Ya en `origin/main`. Las migraciones `20260922200000_idempotency_key_per_endpoint` y `20260924001851_r1_stock_ledger` están aplicadas en Supabase: no borrarlas, renombrarlas ni modificarlas. **Ojo:** R1 está en Supabase, pero su código todavía no tiene commit.

## Próximo paso

0. Revisar R1 con el usuario (la migración ya está en Supabase) y hacer commit solo cuando lo pida. Después: R2 (catálogo). Pendiente para un corte de limpieza: retirar `Business.insufficientStockPolicy` de Configuración y de la API (hoy no tiene efecto).
1. Confirmar en GitHub Actions que CI pasa con `94a1a63` (incluido el paso "Lint" y `pnpm api:generate`).
2. Probar el login correcto e incorrecto con el usuario `demo` (lo único que falta de la prueba manual) y decidir si se bloquea reabrir recordatorios de mantenimientos anulados.
3. Decidir el estado del recordatorio en la búsqueda por placa y el rate limit antes del piloto.
