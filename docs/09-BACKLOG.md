# 09 — Backlog y registro de decisiones

**Versión:** 0.9 · **Actualizado:** 2026-09-28 (backend de R7 implementado, B-160 a B-166; pendientes la UI, B-167, y la validación final, B-168; contrato de R7: DEC-78 a DEC-87; antes, R4 y R5 cerrados; contrato de R6 cerrado sin implementar: DEC-69 a DEC-77)
Etiquetas: ver `03-BUSINESS-RULES.md`. Prioridad: **M** Must · **S** Should · **C** Could.

## 1. Lo que bloquea el inicio del desarrollo

| # | Bloqueo | Qué bloquea | Cómo se resuelve |
|---|---|---|---|
| 1 | **Aprobación del conjunto de documentos**, incluidas las decisiones [TÉCNICO] de §2 | Todo | Aprobación explícita (D-15) |
| 2 | **DEC-22:** cómo se modelan y descuentan los productos (presentaciones, unidad, litro o granel) | Solo los cortes C2 (catálogo) y C3 (inventario) en lo que toca `Product.unit`. **No bloquea C0 ni C1** | Transcribir C-10 (productos y presentaciones) y decidir con Brigith (P-07) |

Nada más bloquea el inicio. Las demás decisiones pendientes son configuración o proceso y se necesitan antes del piloto, no antes de programar (§2).

Los bloqueos 1 y 2 son del inicio del MVP. El MVP se construyó (`v1.0-mvp`) con el modelo provisional de DEC-22 (ver `STATUS.md`).

**Cortes de operación real (`10-OPERACION-REAL.md` §2.10):**

| Corte | Bloqueos | Estado |
|---|---|---|
| R3 — Recepción en lote, ajuste por cantidad física y alertas | Ninguno. Decisiones cerradas el 2026-09-25: DEC-36, DEC-39 y DEC-48 a DEC-52 (§2) | **Cerrado** (2026-09-26): commit `1588d85` en `origin/main`, migración `20260925214438_r3_inventory_receipts` aplicada en Supabase, CI en verde |
| R4 — Ventas de mostrador, consultas, anulación y su UI | Ninguno. Decisiones cerradas el 2026-09-26: DEC-30 y el alcance de R4 (§2) | **Cerrado** (2026-09-27): commit `9702197` en `origin/main`, migración `20260926175402_r4_sales` aplicada en Supabase (ver `STATUS.md`) |
| R5 — Lavados, su configuración y su UI | Ninguno. Contrato cerrado el 2026-09-26 (DEC-63 a DEC-67) y reparto con B-135 decidido (DEC-68) | **Cerrado** (2026-09-27): commit `9702197` en `origin/main`, migración `20260927023545_r5_washes` y seed de lavados de brigith aplicados en Supabase (ver `STATUS.md`) |
| R6 — Cobro de mantenimiento, anulación conjunta y mantenimiento sin vehículo (DEC-31) | Antes, el **Corte 0** (DEC-77): anulación condicional de mantenimiento. Contrato cerrado el 2026-09-28: DEC-69 a DEC-77 (§2) | **Contrato documentado, sin implementar** (B-150 a B-158). Sin migraciones de R6 |
| R7 — Dashboard, indicadores del piloto y throttler | Ninguno. Contrato cerrado el 2026-09-28: DEC-78 a DEC-87 (§2); DEC-40 resuelta por DEC-86 | **Backend implementado** (B-160 a B-166, con commit, sin push). Pendientes: UI (B-167) y validación final (B-168). Sin migraciones de R7 |

## 2. Registro de decisiones

**Estado:** `Aprobada` (por ti) · `Técnica` (se aprueba con los documentos) · `Pendiente` (falta decidir; ver "cuándo se necesita").

| ID | Decisión | Estado | Cuándo se necesita |
|---|---|---|---|
| DEC-01 | Regla por defecto cuando hay km y fecha: `ANY` o `ALL`. Hoy el usuario elige cada vez (BR-M5) | Pendiente (P-04) | Antes del piloto. No bloquea |
| DEC-02 | El km solo se evalúa contra el último km conocido; nunca se estima (BR-R4) | Técnica | — |
| DEC-03 | Días de anticipación del aviso. Hoy vacío (BR-R5) | Pendiente (P-05) | Antes del piloto. No bloquea |
| DEC-04 | El stock se actualiza mediante movimientos desde el MVP. Sin `inventoryEnabled` | **Aprobada** | — |
| DEC-05 | Política ante stock insuficiente | **Resuelta por DEC-26/DEC-27** (2026-09-23): la venta bloquea si un producto con conteo no alcanza; el mantenimiento avisa y continúa; sin conteo, avisa. Ver `10-OPERACION-REAL.md` §3.2c | — |
| DEC-06 | Aviso "¿marcar como compatible?" | Pendiente. **Fuera del MVP** | No se necesita |
| DEC-07 | Nivel de detalle de la compatibilidad (marca y modelo; año; motor) | Pendiente (P-08) | Al cargar compatibilidades. No bloquea |
| DEC-08 | Lavado y venta rápida en la Fase 2 | **Aprobada** | — |
| DEC-09 | Monorepo `apps/web` + `apps/api`, cliente generado desde OpenAPI | Técnica | — |
| DEC-10 | Hosting gratuito de web, API y PostgreSQL | **Resuelta por DEC-89** (2026-09-29) | — |
| DEC-11 | Un negocio por usuario; único rol `OWNER` en el MVP; sin auto-registro | Técnica (P-12 para más roles) | — |
| DEC-12 | Prácticas que dejan la puerta abierta a offline: UUID, idempotencia, `occurredAt`, operaciones completas. Sin implementar offline | Técnica | — |
| DEC-13 | Aislamiento por `businessId` del token, capa única de datos y pruebas. Sin RLS por ahora | Técnica | — |
| DEC-14 | Estados del recordatorio y paso a "contactado" al abrir el enlace, con deshacer | Técnica | — |
| DEC-15 | Cierre del día con conteos manuales de lavados | Pendiente (H-07, P-10) | Fase 2 |
| DEC-16 | Normalización de placa y unicidad por negocio; sin validar formato | Técnica (BR-C10 pendiente) | — |
| DEC-17 | Sin borrado físico; anulación; movimientos inmutables | Técnica | — |
| DEC-18 | Avisos de km y fechas sin bloquear | Técnica | — |
| DEC-19 | Recordatorios sin teléfono visibles como "sin teléfono" | Técnica | — |
| DEC-20 | Indicadores del piloto: adopción, mantenimiento, inventario | **Aprobada** (definiciones: Técnica; umbrales: Pendiente, BR-I4) | Umbrales, durante el piloto |
| DEC-21 | Proceso de carga del stock inicial: conteo completo previo o progresivo | Pendiente (negocio) | Antes del piloto. No bloquea |
| DEC-22 | Modelado de presentaciones, unidad de descuento y granel | Pendiente (P-07) | **Antes de C2/C3** |
| DEC-23 | Ingreso de mercadería incluido en el MVP (sin entradas, el stock solo baja; C-18) | Técnica. **Consecuencia de DEC-04; puedes vetarla** | — |
| DEC-24 | **Salidas por venta de producto.** El inventario ya las contempla (`SALE`, BR-P14). Falta decidir: (a) ¿el MVP incluye una salida solo de stock (producto y cantidad, sin precio ni pago) o se espera a la venta rápida de la Fase 2?; (b) ¿Brigith vende productos sin mantenimiento, y con qué frecuencia? *Recomendación:* incluir la salida solo de stock, porque no exige precios ni pagos y evita que el saldo pierda fiabilidad desde el primer día. Si se incluye, agrega un endpoint y un formulario, sin cambios de modelo. No es la venta rápida, que sigue en la Fase 2 | **Resuelta por R4** (2026-09-26): la salida de stock por venta se registra con la venta de mostrador de R4 (`POST /sales`, un `SALE` por línea), con precio y método de pago. No se implementa una salida solo de stock sin precio; B-904 se retira | — |
| DEC-25 | `username` único **globalmente** (no por negocio, a diferencia del resto de unicidades de `05-DATABASE.md` §1). `POST /auth/login` recibe `{ username, password }` sin negocio ni slug; el `businessId` se resuelve del usuario encontrado, nunca lo envía el cliente | **Aprobada** (por ti) | — |

Las decisiones DEC-26 a DEC-47 están en `10-OPERACION-REAL.md` §3. Aquí se registran las de R3 y las de R4 (DEC-30 se repite aquí porque la cierra R4):

| ID | Decisión | Estado | Cuándo se necesita |
|---|---|---|---|
| DEC-36 | Recepción sin costo de compra ni proveedor. Queda fuera de R3 | **Aprobada** (2026-09-25). **Reabierta el 2026-10-06** para el costo de compra: ver DEC-90 (el proveedor sigue fuera) | — |
| DEC-39 | Motivos de ajuste como chips: Conteo físico distinto, Producto dañado, Consumo interno, Otro, más texto libre; el motivo se guarda como texto (BR-P10) | **Aprobada** (2026-09-25) | — |
| DEC-48 | No se ajusta un producto sin conteo inicial: 409 `ADJUSTMENT_REQUIRES_COUNT`; se pide un `COUNT` antes. El ajuste no marca `isCounted` (BR-P7b) | **Aprobada** (2026-09-25) | — |
| DEC-49 | Ajuste con cantidad física igual al saldo: 400 `NO_DIFFERENCE` (BR-P7b) | **Aprobada** (2026-09-25) | — |
| DEC-50 | Alertas: agotados y negativos solo consideran productos con conteo; los que no tienen conteo van en `notCountedCount` (BR-P19) | **Aprobada** (2026-09-25) | — |
| DEC-51 | Recepción y ajuste rechazados sobre productos inactivos: 409 `PRODUCT_INACTIVE`; en una recepción, se rechaza el lote completo (BR-P21) | **Aprobada** (2026-09-25) | — |
| DEC-52 | La UI (Recibir, historial de recepciones, Ajustar y alertas) forma parte de R3 | **Aprobada** (2026-09-25) | — |

Decisiones de R4, aprobadas por el usuario el 2026-09-26 (detalle en `10-OPERACION-REAL.md` §3.2e):

| ID | Decisión | Estado | Cuándo se necesita |
|---|---|---|---|
| DEC-30 | Un solo método de pago por venta: `CASH` o `YAPE`. El pago mixto queda fuera de R4, como decisión futura | **Aprobada** (2026-09-26) | — |
| — | Alcance de R4: API de ventas de mostrador (crear, consultar, anular) **y su UI** (Vender, historial de ventas y anulación) | **Aprobada** (2026-09-26) | — |
| — | `ProductSaleUnit` (litro / balde completo) queda fuera de R4; `saleUnitId` no entra en el contrato | **Aprobada** (2026-09-26). Implementado después de R7 por DEC-91 | — |
| — | Stock insuficiente en la venta: `BLOCK` fijo (aplica DEC-26). La venta no lee `Business.insufficientStockPolicy` ni permite "confirmar igual"; la limpieza de esa configuración queda para después | **Aprobada** (2026-09-26) | — |

Decisiones de R5, aprobadas por el usuario el 2026-09-26 (detalle en `10-OPERACION-REAL.md` §3.2f):

| ID | Decisión | Estado | Cuándo se necesita |
|---|---|---|---|
| DEC-53 | Sin tabla `Wash`: un lavado es una `Sale` `source = WASH` con una sola `SaleLine` `WASH` (`washTypeId` obligatorio, `productId = null`, `movesStock = false`). Historial, detalle y anulación por `/sales` | **Aprobada** (2026-09-26) | — |
| DEC-54 | El lavado no mueve stock: sin `StockLedger` al crearlo ni al anularlo | **Aprobada** (2026-09-26) | — |
| DEC-55 | Precio siempre de una `WashPriceOption` activa, sin monto libre. 409 `WASH_TYPE_INACTIVE` y 409 `WASH_PRICE_INACTIVE` | **Aprobada** (2026-09-26) | — |
| DEC-56 | Configuración de `WashType` y `WashPriceOption` en R5 (crear, editar, desactivar; `sortOrder` e `isActive`) | **Aprobada** (2026-09-26) | — |
| DEC-57 | `note` opcional en `POST /washes`, hasta 500, misma semántica que `Sale.note` | **Aprobada** (2026-09-26) | — |
| DEC-58 | `Sale.occurredAt` = momento real del cobro, enviable; sin `performedAt` en la venta | **Aprobada** (2026-09-26) | — |
| DEC-59 | Anulación por `POST /sales/:id/void`, siempre con motivo, sin endpoint propio y sin stock. Término: "Anular" | **Aprobada** (2026-09-26) | — |
| DEC-60 | La UI entra en R5 (lavado, historial, detalle, anulación, tipos y precios), con el patrón actual del frontend y sin TanStack Query | **Aprobada** (2026-09-26) | — |
| DEC-61 | Helper interno mínimo y compartido para escribir `Sale` y líneas (mostrador y lavado), sin cambiar el contrato de R4 | **Aprobada** (2026-09-26) | — |
| DEC-62 | Seed de tipos y precios preparado en código; migración y seed en Supabase solo con autorización explícita posterior | **Aprobada** (2026-09-26) | — |
| DEC-63 | Editar y desactivar un precio con `PATCH /wash-types/:id/prices/:priceId` (`amount`, `label`, `sortOrder`, `isActive`); sin borrado físico; el `priceId` debe ser del tipo y del negocio actuales | **Aprobada** (2026-09-26) | — |
| DEC-64 | `GET /wash-types?includeInactive=`: por defecto solo tipos y precios activos (flujo de cobro); con `true`, también los inactivos (Configuración). Mismo patrón que `/product-categories` | **Aprobada** (2026-09-26) | — |
| DEC-65 | Errores: 404 `WASH_TYPE_NOT_FOUND`, 404 `WASH_PRICE_NOT_FOUND`, 409 `WASH_TYPE_ALREADY_EXISTS`, 409 `WASH_PRICE_NOT_IN_TYPE` (además de 409 `WASH_TYPE_INACTIVE` y `WASH_PRICE_INACTIVE`, DEC-55) | **Aprobada** (2026-09-26) | — |
| DEC-66 | Validaciones: `amount` > 0; `name` obligatorio, `trim`, ≤ 100; `label` opcional, `trim`, ≤ 100; `sortOrder` entero ≥ 0. Sin otras restricciones | **Aprobada** (2026-09-26) | — |
| DEC-67 | `descriptionSnapshot` de la línea `WASH` = exactamente el `name` del `WashType` al cobrar, sin prefijos; conserva el nombre histórico | **Aprobada** (2026-09-26) | — |
| DEC-68 | R5 reutiliza el historial, detalle y anulación genéricos de ventas (B-135), filtrando `source=WASH`; sin pantallas duplicadas de historial de lavados | **Aprobada** (2026-09-26) | — |
| DEC-69 | Un mantenimiento tiene **como máximo una venta en toda su vida**: `Sale.maintenanceId` sigue `@unique` (sin índice parcial ni migración) y la relación queda aunque la venta pase a `VOIDED`. **No existe volver a cobrar.** Cobrar un mantenimiento `VOIDED` responde 409 `MAINTENANCE_VOIDED`; uno que ya tiene venta, 409 `MAINTENANCE_ALREADY_CHARGED` | **Aprobada** (2026-09-28) | R6 |
| DEC-70 | Una venta con `source = MAINTENANCE` **no se anula** con `POST /sales/:id/void`: 409 `SALE_MANAGED_BY_MAINTENANCE`. Su única vía es `POST /maintenances/:id/void`, que mantiene la consistencia mantenimiento ↔ venta | **Aprobada** (2026-09-28) | R6 |
| DEC-71 | `reason` **obligatorio** en `POST /maintenances/:id/void`, tenga o no cobro (vacío → 400 `VALIDATION_ERROR`). La venta asociada se anula con ese mismo motivo, sin texto fijo. Cambio incompatible: la UI se adapta dentro de R6 | **Aprobada** (2026-09-28) | R6 |
| DEC-72 | Dos formas de cobrar: el bloque `charge` en `POST /maintenances` (misma transacción) y `POST /maintenances/:id/charge` para cobrar después, con `Idempotency-Key`. El cobro es una `Sale` `MAINTENANCE` con una sola línea `SERVICE` por el total | **Aprobada** (2026-09-28) | R6 |
| DEC-73 | Mantenimiento sin vehículo (concreta DEC-31): `vehicleId` opcional (migración de R6). Sin vehículo, `odometerKm`, `nextDueKm`, `nextDueDate` y `dueRule` se rechazan con 400 `VALIDATION_ERROR` al crear (`POST`) y al corregir (`PATCH`), sin ignorarlos ni guardarlos; sin recordatorio, sin cerrar recordatorios previos y sin seguimiento por fecha ni km. Se puede registrar y cobrar. Sin asignación posterior de vehículo en R6 | **Aprobada** (2026-09-28) | R6 |
| DEC-74 | La venta del cobro de mantenimiento lleva `customerId = null` en R6; clientes en R8 | **Aprobada** (2026-09-28) | R6 |
| DEC-75 | `Sale.occurredAt` del cobro = hora real del cobro, fijada por el servidor; el cobro no acepta `occurredAt` del cliente. `Maintenance.performedAt` sigue siendo el momento del servicio | **Aprobada** (2026-09-28) | R6 |
| DEC-76 | R6 usa el `IdempotencyService` actual. La atomicidad entre la reserva de la clave y el efecto (hallazgo A2) queda como **deuda técnica** en un corte separado, fuera de R6 | **Aprobada** (2026-09-28) | Fuera de R6 |
| DEC-77 | **Corte 0, antes de R6:** `POST /maintenances/:id/void` hace la transición `ACTIVE → VOIDED` condicional en la misma transacción; si no cambia ninguna fila, 409 `MAINTENANCE_ALREADY_VOIDED` sin movimientos (hallazgo A1). En R6, orden de bloqueo **Maintenance → Sale**; si la venta ya está `VOIDED`, la anulación continúa sin generar movimientos | **Aprobada** (2026-09-28) | Antes de R6 |
| DEC-78 | **Dashboard de R7:** un único módulo y endpoint `GET /dashboard?period=today\|week\|month&date=YYYY-MM-DD`, de solo lectura. Muestra ingresos (total, efectivo, Yape, número de ventas y monto por origen), lavados (cantidad, monto y por tipo), mantenimientos del período (cobrados y sin cobro), productos más vendidos (hasta 10), stock que requiere atención y recordatorios por avisar. Período Hoy · Semana · Mes. **Sin** comparación con otro período, metas, stock mínimo ni métricas que el negocio no haya pedido (BR-D6) | **Aprobada** (2026-09-28) | R7 |
| DEC-79 | **Zona horaria y día operativo:** `Business.timezone` es la fuente de verdad (`America/Lima` en brigith). Día local `[00:00, 24:00)`; semana de lunes a domingo; mes calendario. Una venta a las 23:30 de Lima cae en ese día. Series por hora (Hoy) o por día (Semana, Mes) (BR-D1) | **Aprobada** (2026-09-28) | R7 |
| DEC-80 | **Agregación:** solo `Sale` y `Maintenance` `ACTIVE`. SQL crudo con `businessId` explícito, parametrizado y con prueba de aislamiento; montos y cantidades como `string` decimal, nunca `float`. Ingresos por `Sale.source` (`COUNTER`, `WASH`, `MAINTENANCE`) y `Sale.occurredAt` (el de mantenimiento, hora del cobro, DEC-75); mantenimientos contados por `performedAt`, cobrados o sin cobro; el cobro no genera un segundo conteo y su dinero solo vive en la venta `MAINTENANCE` (BR-D2 a BR-D4). Sin migración salvo que falte un índice necesario: con los existentes y el volumen del piloto, no falta ninguno | **Aprobada** (2026-09-28) | R7 |
| DEC-81 | **Productos más vendidos:** incluyen el consumo en mantenimientos, contado desde `inventory_movements` (`MAINTENANCE_USE` de mantenimientos `ACTIVE`) y mostrado aparte de lo vendido (líneas `PRODUCT` de ventas `ACTIVE`). El consumo es inventario: **no** suma a ventas ni a ingresos, y la pantalla lo dice (BR-D5) | **Aprobada** (2026-09-28) | R7 |
| DEC-82 | **Stock y recordatorios en el dashboard:** reutilizan la lógica de `GET /inventory/alerts` (BR-P19) y de `GET /reminders?due=now&status=PENDING`, sin criterios nuevos (BR-D7) | **Aprobada** (2026-09-28) | R7 |
| DEC-83 | **Gráficos:** cifras más barras simples con SVG o CSS propio, **sin dependencias nuevas** | **Aprobada** (2026-09-28) | R7 |
| DEC-84 | **Capa de datos:** TanStack Query (DEC-38) **no entra en R7**; se mantiene `useApiQuery`. El dashboard se vuelve a pedir al volver a la pestaña, cada 60 s mientras Inicio está visible y al volver a Inicio después de registrar una operación | **Aprobada** (2026-09-28) | R7 |
| DEC-85 | **BR-I1 (adopción) entra en R7:** `/pilot-indicators` cuenta por separado ventas de mostrador, lavados (ventas `ACTIVE` por `source`) y mantenimientos no anulados del período. El cobro de mantenimiento no se cuenta aparte. Datos reales, sin porcentajes objetivo ni metas (BR-I4 sigue pendiente). `/pilot-indicators` no cambia en nada más | **Aprobada** (2026-09-28) | R7 |
| DEC-86 | **Rate limit (resuelve DEC-40), [TÉCNICO]:** `GET` 120/min por usuario; `POST`/`PATCH` 30/min por usuario; login 5/min por IP y 5/min por `username`; refresh 20/min por IP. Ventana fija de 60 s, en memoria (una sola instancia de la API). Al exceder: 429 con `Retry-After` y `code: "RATE_LIMITED"`; la web no reintenta sola. Protección inicial, **revisable con datos del piloto**; el límite actual de 20/min por IP y endpoint fue solo la referencia | **Aprobada** (2026-09-28) | R7 |
| DEC-87 | **A2 (DEC-76) queda fuera de R7:** corte técnico separado, posterior a R7. No se toca el `IdempotencyService` en R7 | **Aprobada** (2026-09-28) | Después de R7 |
| DEC-89 | **Producción gratuita, [TÉCNICO]:** web y API en **Vercel (plan Hobby)**, dos proyectos del mismo repositorio (`apps/web`, `apps/api`), región `iad1`; base en **Supabase (plan Free)**, `us-east-1`. La API corre como una función (`apps/api/api/index.js`) sobre un bundle CommonJS hecho con esbuild (`scripts/bundle-serverless.mjs`), porque NestJS 12 es solo ESM y el runtime de Vercel no admite `require()` de ESM. Varias instancias posibles, así que el rate limit de DEC-86 guarda sus contadores en Postgres (`rate_limit_windows`, `RATE_LIMIT_STORE=database`), con respaldo en memoria si la base falla; `TRUST_PROXY=1` para la IP real. RLS activado en todas las tablas sin políticas: solo el dueño de las tablas (la conexión de Prisma) accede. Un cron diario de Vercel llama a `/health` para que Supabase Free no pause el proyecto por inactividad. Swagger UI no se expone en producción. Sin servicios de pago; migrable a cualquier hosting Node (`pnpm --filter @brigith/api start`) cambiando solo variables de entorno. Detalle en `README.md` §Producción | **Aprobada** (2026-09-29) | — |
| DEC-90 | **Monto pagado en recepciones (reabre DEC-36, aprobado por el usuario el 2026-10-06).** Cada línea de una recepción admite, opcional, el **total pagado por esa línea** (`InventoryMovement.purchaseCost`, solo en `PURCHASE_IN`); la cabecera guarda la suma (`InventoryReceipt.totalCost`, nulo si ninguna línea tiene monto). Las recepciones anteriores quedan sin monto: no se infiere ni se estima. `GET /inventory/receipts/summary?month=YYYY-MM` da el total comprado del mes en la zona del negocio (DEC-79) y cuenta aparte las recepciones y líneas sin monto. Se reutiliza la pantalla de Recepciones (ahora "Recepciones y compras", también en Más), sin pantalla de Compras aparte. Sin proveedor | **Aprobada** (2026-10-06) | — |
| DEC-91 | **Formas de venta por producto** (implementa `ProductSaleUnit`, 10-OPERACION-REAL.md §2.4, BR-P15). Un producto puede tener formas opcionales (`label`, `factor` = unidades de stock que descuenta una unidad vendida, `salePrice` opcional), configuradas en su ficha con `PUT /products/:id/sale-units` (la lista enviada reemplaza a las activas; las que salen se desactivan, nunca se borran). Para el aceite a granel la unidad de stock es el **galón** (octavo 0.125, cuarto 0.25, galón 1, balde = su capacidad, que cada producto define: no se asume 5). Solo en **Vender**: la línea lleva `saleUnitId`, el precio es el de esa forma y el stock descontado es `cantidad × factor` (debe caber en 3 decimales); la línea copia nombre y factor (`saleUnitLabel`, `saleUnitFactor`), así que anular devuelve lo mismo aunque la forma cambie. El mismo producto puede ir en varias líneas con formas distintas. Genérico: sin lógica por nombre de producto. Mantenimiento no usa formas (sigue en la unidad del producto). Los productos sin formas no cambian | **Aprobada** (2026-10-06) | — |
| DEC-92 | **Unidad de producto válida.** La unidad de stock es un nombre ("unidad", "galón", "litro"…), nunca solo un número: la API rechaza con 400 una unidad sin letras al crear o al cambiarla. El formulario la elige de una lista (las que ya usa el catálogo más unidad, galón y litro) con "Otra…". Los productos existentes con unidad "0" **no se corrigen automáticamente**: siguen funcionando, se pueden editar sin tocar la unidad y la ficha avisa. Configurar formas de venta exige una unidad válida (409 `PRODUCT_UNIT_INVALID`). La corrección de esos datos queda para el dueño (ver `STATUS.md`) | **Aprobada** (2026-10-06) | Corrección de los 23 productos: decisión del dueño |
| DEC-93 | **Aceite de balde como envase abierto (confirmado por el negocio el 2026-10-06; concreta DEC-91 para el granel).** Productos: Aceite Balde granel, Aceite Balde 25w60 diesel y Aceite Balde 15w40 diesel. Stock en **litros**; balde lleno = 5 galones = **20 L**; solo dos formas de venta: **1/4 de galón = 1 L** y **1/8 de galón = 0.5 L**, **sin precio fijo: el dueño escribe el precio de venta en cada operación** (`unitPrice` por línea, DEC-29); puede variar de una venta a otra, queda registrado en la venta y no depende de ventas anteriores. Un precio configurado en la forma es solo una sugerencia editable. El inventario no depende del precio. Nuevos campos opcionales `Product.containerCapacity` y `containerLabel` (envase "Balde", 20): el saldo sigue siendo el contenido disponible; el balde abierto y los cerrados se derivan del saldo (`ceil(saldo/capacidad) − 1` cerrados) sin guardarse aparte. Recibir ofrece "+1 Balde (20 L)". Al llegar a 0, el producto queda agotado con los avisos existentes y la venta se bloquea. Componente SVG del balde en Inventario, ficha, lista y Vender. No cambia ventas, anulación, recepción, conteos, ajustes ni mantenimiento. El saldo real del balde existente se registrará con un ajuste cuando se mida (pendiente); no se asume 20 L ni se reescribe el historial | **Aprobada** (2026-10-06); implementada en local, sin producción | Medición física del balde existente |
| DEC-88 | **Cuenta entregada y contraseña.** (1) **Cuenta preconfigurada:** el cliente recibe la cuenta ya creada y configurada, sin registro público (sigue BR-G4 y DEC-11: no hay "Crear cuenta"). (2) **Usuario actual:** la cuenta dueña del negocio `brigith` es el mismo usuario de siempre (mismo `id` y `businessId`), renombrado a `name` "Saúl" y `username` `saul` el 2026-09-29; no se creó otro usuario ni se movió ningún dato. La semilla reutiliza el dueño existente y solo crea `saul` en una base vacía. (3) **Contraseña temporal:** la entregada con la cuenta; el **cambio es opcional** (Más → Cambiar contraseña, `POST /auth/change-password`), no obligatorio en el primer ingreso. (4) **Recuperación sin correo, mediante código:** al cambiar la contraseña se genera un código de recuperación de un solo uso (se muestra una vez; solo se guarda su hash en `users.recoveryCodeHash`); con usuario + código + contraseña nueva se recupera en `/recuperar` (`POST /auth/recover`), que rota el código. Cambiar o recuperar cierra todas las sesiones y nunca crea usuarios ni toca los datos del negocio. Límites de intentos del login (DEC-86). Detalle en `06-API.md` §2 | **Aprobada** (2026-09-29) | Antes de entregar la cuenta |

## 3. Backlog por corte

Estado: `Listo` (implementable tras aprobar) · `Requiere DEC-22` · `Requiere dato` (necesita datos de Brigith) · `Config abierta` (implementable; el valor lo decide el negocio) · `Fase 2`.

### C0 — Base
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-001 | Repositorio, lint, formato, CI | M | Listo |
| B-002 | Prisma, PostgreSQL, migraciones y semillas (Brigith y "demo") | M | Listo |
| B-003 | Autenticación JWT (acceso y refresco) | M | Listo |
| B-004 | Contexto de negocio y capa de datos aislada | M | Listo |
| B-005 | Pruebas de aislamiento entre negocios | M | Listo |
| B-006 | Swagger/OpenAPI y cliente tipado | M | Listo |
| B-007 | Formato uniforme de errores y avisos | M | Listo |
| B-008 | Idempotencia en escrituras críticas | M | Listo |
| B-009 | Carcasa PWA, detección de conexión y reintentos | M | Listo |
| B-010 | Configuración del negocio (campos abiertos como valores) | M | Config abierta |

### C1 — Clientes y vehículos
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-011 | Clientes, con nombre y teléfono opcionales | M | Listo |
| B-012 | Vehículos con solo placa; normalización y unicidad | M | Listo |
| B-013 | Búsqueda rápida por placa (parcial) | M | Listo |
| B-014 | Modelos de vehículo (año y motor opcionales) | M | Listo |

### C2 — Catálogo
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-020 | Categorías (semilla Lubricante y Filtro) | M | Listo |
| B-021 | Productos: marca, código, nombre, unidad, control de stock | M | Requiere DEC-22 |
| B-022 | Compatibilidad explícita (crear y quitar) y consultas | M | Listo |
| B-023 | Carga de productos y códigos reales | M | Requiere dato (P-07, P-08) |

### C3 — Inventario
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-030 | Libro de movimientos inmutable y saldo por suma | M | Requiere DEC-22 |
| B-031 | Conteo físico (stock inicial y recuentos) | M | Listo |
| B-032 | Ingreso de mercadería | M | Listo |
| B-033 | Ajuste manual con motivo | M | Listo |
| B-034 | Detección de stock insuficiente y política configurable | M | Config abierta (DEC-05) |
| B-035 | Estado "sin conteo inicial" | M | Listo |
| B-036 | Pantallas de inventario y carga del stock inicial | M | Config abierta (DEC-21) |
| B-037 | Prueba de invariantes de stock | M | Listo |

### C4 — Mantenimiento
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-040 | Tipos de mantenimiento (semilla "Cambio de aceite") | M | Listo |
| B-041 | Módulo `due-rules` con pruebas (`KM`, `DATE`, `ANY`, `ALL`) | M | Listo |
| B-042 | Mantenimiento indivisible: productos, movimientos, stock y recordatorio | M | Requiere DEC-22 |
| B-043 | Anulación con movimientos inversos | M | Listo |
| B-044 | Corrección de campos que no afectan el stock | S | Listo |
| B-045 | Avisos de km y fechas | S | Listo |
| B-046 | Campos del registro según lo que lleva el sticker | M | Requiere dato (P-02, P-03) |

### C5 — Recordatorios y WhatsApp
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-050 | Ciclo del recordatorio (crear, cerrar, descartar, revertir) | M | Listo |
| B-051 | Lista "Avisar" con motivo | M | Config abierta (DEC-03) |
| B-052 | Plantilla y vista previa del mensaje | M | Config abierta (P-13) |
| B-053 | Enlace `wa.me` y normalización de teléfono | M | Requiere dato (P-01) |
| B-054 | Historial de avisos abiertos | S | Listo |

### C6 — Piloto
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-060 | Indicadores del piloto (endpoint y pantalla) | M | Listo |
| B-061 | Importación de clientes y vehículos | C | Requiere dato (P-01) |
| B-062 | Medición de tiempos y toques | S | Listo |
| B-063 | Acuerdo de umbrales de éxito (BR-I4) | M | Config abierta |

### R3 — Recepción en lote, ajuste por cantidad física y alertas
Diseño: `10-OPERACION-REAL.md` §2.5 y §2.7 · contrato: `06-API.md` §2 (Inventario, "Cambios de R3") · pantallas: `07-UI-UX.md` §3.6. Reemplaza el comportamiento de B-032 y B-033.

**Estado:** cerrado el 2026-09-26 (commit `1588d85`, migración aplicada en Supabase, CI en verde).

| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-120 | Modelo `InventoryReceipt` y migración aditiva | M | Hecho (`1588d85`; migración aplicada en Supabase) |
| B-121 | `POST /inventory/receipts` en lote, atómico e idempotente | M | Hecho (`1588d85`) |
| B-122 | `GET /inventory/receipts` y `GET /inventory/receipts/:id` | M | Hecho (`1588d85`) |
| B-123 | Ajuste por cantidad física en el `StockLedger` y `POST /inventory/adjustments` | M | Hecho (`1588d85`) |
| B-124 | `GET /inventory/alerts` | M | Hecho (`1588d85`) |
| B-125 | Web: Recibir, historial de recepciones, Ajustar y stock que requiere atención | M | Hecho (`1588d85`); prueba manual a 390 px OK (2026-09-26) |
| B-126 | Pruebas: lote atómico, idempotencia, ajuste concurrente, invariante de la caché y aislamiento entre negocios | M | Hecho (`1588d85`) |

### R4 — Ventas de mostrador, consultas, anulación y su UI
Diseño: `10-OPERACION-REAL.md` §2.1, §2.3 (Dinero), §2.5 (Venta de productos), §2.7 y §2.10 · decisiones: §2 (DEC-30 y alcance de R4) y `10` §3.2e. Aplica DEC-26, DEC-27, DEC-29 y DEC-44. El contrato detallado va a `06-API.md` y las pantallas a `07-UI-UX.md` al preparar R4.

**Estado:** sin bloqueos. API implementada y validada localmente, **sin commit**; migración solo en `brigith_test`, no en Supabase. Historial, detalle y anulación genéricos (B-135) hechos sin commit, adelantados con R5 (2026-09-26). **Vender (B-134) hecho sin commit** (2026-09-26). R4 queda implementado localmente; no se cierra hasta el commit y la migración en Supabase.

| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-100 | Venta rápida con descuento de stock (venta de mostrador, `source = COUNTER`). Se implementa con B-130 a B-136 | M | API y UI hechas (sin commit) |
| B-101 | Métodos de pago Efectivo y Yape: **uno por venta** (`CASH` o `YAPE`, DEC-30) | M | API y UI hechas (sin commit) |
| B-130 | Modelo `Sale` y `SaleLine` (enums `PaymentMethod`, `SaleSource`, `SaleStatus`, `SaleLineKind`) con snapshots de descripción, código y precio; migración aditiva; ambos en `BUSINESS_SCOPED_MODELS` | M | Hecho (sin commit; migración solo local) |
| B-131 | `POST /sales`: venta de mostrador atómica e idempotente, sin cliente ni placa (DEC-44). Un método de pago (DEC-30), precio aplicado editable por línea (DEC-29), total calculado en el servidor, un `SALE` por línea a través del `StockLedger` con `BLOCK` fijo: si un producto con conteo no alcanza, 422 `INSUFFICIENT_STOCK` y no se guarda nada (DEC-26); sin conteo, se vende con aviso (DEC-27). No lee `Business.insufficientStockPolicy` | M | Hecho (sin commit) |
| B-132 | `GET /sales` (período, estado, método de pago, cursor) y `GET /sales/:id` con líneas | M | Hecho (sin commit) |
| B-133 | `POST /sales/:id/void`: anulación con motivo; genera `SALE_VOID` de las líneas con stock; `SALE_ALREADY_VOIDED` si ya estaba anulada | M | Hecho (sin commit) |
| B-134 | Web: **Vender** (catálogo y búsqueda, carrito con −/+, cobro con Efectivo / Yape y precio editable, 422 por stock con corrección de cantidad, confirmación con Deshacer) | M | Hecho (sin commit): `/ventas/nueva`. Sin "Deshacer": se anula con motivo desde el detalle (B-135) |
| B-135 | Web: **historial de ventas** con detalle y **anulación** con motivo. Genérico para todas las fuentes: R5 lo reutiliza con `source=WASH` (DEC-68) | M | Hecho (sin commit, 2026-09-26, adelantado con R5 con autorización del usuario): `/ventas` y `/ventas/[id]` |
| B-136 | Pruebas: total calculado en el servidor, el stock baja una sola vez, la anulación lo revierte, idempotencia, 422 con rollback de toda la venta, concurrencia contra Postgres real y aislamiento entre negocios | M | Hecho (sin commit): unitarias, e2e e integración contra Postgres (T3, T4, bloqueos del ledger, aislamiento) |

**Fuera de R4:** `ProductSaleUnit` (formas de venta litro / balde completo; `saleUnitId` no entra en el contrato) · lavados, `source = WASH` (R5) · cobro de mantenimiento, `source = MAINTENANCE` y líneas `SERVICE` (R6) · dashboard (R7) · clientes y Avisar desde un cliente (R8) · pago mixto (decisión futura) · limpieza de `Business.insufficientStockPolicy` (corte de limpieza).

### R5 — Lavados, su configuración y su UI
Diseño: `10-OPERACION-REAL.md` §0.3, §2.3, §2.5, §2.7 y §3.2f · contrato: `06-API.md` §2, Lavados · pantallas: `07-UI-UX.md` §3.9 · decisiones: DEC-53 a DEC-68 (§2). Aplica DEC-30, DEC-44 y BR-V7.

**Estado:** implementado el 2026-09-26, **sin commit** (B-140 a B-149). El historial de lavados no es una pantalla propia: reutiliza el historial genérico de ventas `/ventas?source=WASH`, con su detalle y anulación (B-135, DEC-68). Migración y seed solo en `brigith_test`; nada en Supabase sin autorización explícita (DEC-62).

**Mejora futura (registrada, no implementada):** mostrar el nombre del tipo de lavado en cada fila del historial. `GET /sales` (`SaleSummaryResponse`) no trae las líneas, así que requiere un cambio de backend; hoy el nombre se ve en el detalle.

| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-102 | Lavado rápido (antes "opcional", Fase 2). Se implementa con B-140 a B-149 | M | Implementado (sin commit) |
| B-140 | Modelos `WashType` y `WashPriceOption`, FK de `SaleLine.washTypeId` hacia `WashType`, ambos en `BUSINESS_SCOPED_MODELS`; migración aditiva aplicada solo en `brigith_test` | M | Hecho (sin commit): `20260927023545_r5_washes`, solo en `brigith_test`, no en Supabase |
| B-141 | API de configuración: `GET /wash-types?includeInactive=`, `POST /wash-types`, `PATCH /wash-types/:id`, `POST /wash-types/:id/prices` y `PATCH /wash-types/:id/prices/:priceId` (DEC-56, DEC-63 a DEC-66) | M | Hecho (sin commit): `src/washes/`, unitarias y e2e; sin `POST /washes` |
| B-142 | Helper interno compartido `writeSale` (cabecera, líneas, total y snapshots) en `sales.service.ts`, usado por la venta de mostrador (DEC-61) | M | Hecho (sin commit); R4 sin cambios de comportamiento |
| B-143 | `POST /washes`: una `Sale` `WASH` con una línea `WASH`, precio de la opción activa (DEC-55), `note` (DEC-57), `occurredAt` (DEC-58), idempotente, sin `StockLedger` (DEC-54), errores de DEC-65 y `descriptionSnapshot` según DEC-67 | M | Hecho (sin commit): `src/washes/washes.service.ts` y `washes.controller.ts`; unitarias, e2e e integración |
| B-144 | Lavados por `/sales`: `GET /sales?source=WASH`, `GET /sales/:id` y `POST /sales/:id/void` sin `SALE_VOID` (DEC-59). Sin cambios de código previstos; se cubre con pruebas | M | Cubierto por las pruebas de B-143 (sin commit), sin cambios en `/sales` |
| B-145 | Seed de los tipos y precios de §0.3 en código; se prueba en local. Supabase solo con autorización (DEC-62) | M | Hecho (sin commit): `prisma/seed-washes.ts`, 9 tipos (Minibán, Combi y Moto carguera activos sin precio) y 8 montos; probado en `brigith_test` con `test/integration/seed-washes.int-spec.ts`. No aplicado en Supabase |
| B-146 | Web: **Lavado** (tipo → precio → Efectivo / Yape → Confirmar), sin cliente ni placa | M | Hecho (sin commit): `/lavado`; oculta los tipos sin precio activo |
| B-147 | Web: lavados en el historial, detalle y **Anular** con motivo, **reutilizando** las pantallas genéricas de ventas de B-135 con el filtro `source=WASH`; sin pantallas duplicadas (DEC-68) | M | Hecho (sin commit): `/ventas?source=WASH` y `/ventas/[id]` |
| B-148 | Web: **Configuración → Tipos de lavado** (tipos y precios, orden, activo/inactivo) | M | Hecho (sin commit): `/configuracion/lavados` |
| B-149 | Pruebas: precio de la opción, 409 por tipo o precio inactivo, ningún `InventoryMovement` al crear ni al anular, idempotencia, rollback y aislamiento entre negocios (unitarias, e2e e integración Postgres) | M | Hecho (sin commit): `wash-types.*`, `washes.*` y `integration/washes.int-spec.ts` |

**Fuera de R5:** momento real del cobro y quién cobra (BR-L7, P-11) · dashboard, gráficos e indicadores, incluido BR-I1 con lavados (R7) · cobro de mantenimiento (R6) · estados, cola o Kanban de lavado (BR-L1) · cliente o placa en el lavado (DEC-44).

### R6 — Cobro de mantenimiento, anulación conjunta y mantenimiento sin vehículo
Diseño: `10-OPERACION-REAL.md` §2.2, §2.3 y §2.7 · contrato: `06-API.md` §2, Mantenimientos ("Cambios de R6") · decisiones: DEC-31 y DEC-69 a DEC-77 (§2).

**Estado:** contrato cerrado el 2026-09-28, **sin implementar**. Primero el Corte 0 (B-150).

| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-150 | **Corte 0:** anulación de mantenimiento con transición condicional y 409 `MAINTENANCE_ALREADY_VOIDED`; prueba de concurrencia contra Postgres con dos solicitudes independientes (DEC-77) | M | Pendiente (antes de R6) |
| B-151 | Migración: `maintenances.vehicleId` nullable (DEC-73) | M | Pendiente |
| B-152 | `POST /maintenances` con `vehicleId` opcional, rechazo 400 de `odometerKm`/`nextDueKm`/`nextDueDate`/`dueRule` sin vehículo (también en `PATCH /maintenances/:id`) y bloque `charge` en la misma transacción (DEC-72, DEC-73) | M | Pendiente |
| B-153 | `POST /maintenances/:id/charge`: una `Sale` `MAINTENANCE` con una línea `SERVICE`, `customerId = null`, `occurredAt` del servidor, idempotente; 409 `MAINTENANCE_VOIDED` y `MAINTENANCE_ALREADY_CHARGED` (DEC-69, DEC-72, DEC-74, DEC-75) | M | Pendiente |
| B-154 | Anulación conjunta: `reason` obligatorio, orden Maintenance → Sale, la venta se anula con el mismo motivo; si ya está `VOIDED`, continúa (DEC-71, DEC-77) | M | Pendiente |
| B-155 | `POST /sales/:id/void` rechaza `source = MAINTENANCE` con 409 `SALE_MANAGED_BY_MAINTENANCE` (DEC-70) | M | Pendiente |
| B-156 | Lecturas de mantenimiento con `sale` (`GET /maintenances/:id`, `GET /vehicles/:id/maintenances`) y respuesta de la anulación `{ maintenance, sale }` | M | Pendiente |
| B-157 | Web: cobro en el formulario de mantenimiento y cobro posterior desde su detalle, motivo obligatorio al anular, mantenimiento sin vehículo. Sin pantalla separada de cobros | M | Pendiente |
| B-158 | Pruebas: ninguna venta `MAINTENANCE` mueve stock; un solo cobro por mantenimiento; anulación conjunta sin doble `MAINTENANCE_VOID`; rechazo 400 sin vehículo; aislamiento entre negocios (unitarias, e2e e integración Postgres) | M | Pendiente |

**Fuera de R6:** volver a cobrar un mantenimiento (DEC-69) · asignar un vehículo después (DEC-73) · clientes en la venta (R8, DEC-74) · atomicidad de la idempotencia (A2, DEC-76) · dashboard (R7).

### R7 — Dashboard, indicadores del piloto y throttler
Diseño: `10-OPERACION-REAL.md` §2.5, §2.7 y §2.8 · contrato: `06-API.md` §2, Dashboard, y §4 (rate limit) · pantallas: `07-UI-UX.md` §3.1, §3.8 y §5 · reglas: BR-I1 y BR-D1 a BR-D7 · decisiones: DEC-78 a DEC-87 (§2).

**Estado:** backend implementado el 2026-09-28 (B-160 a B-166, commits locales sin push); **pendientes** la UI (B-167) y la validación final y cierre (B-168). Sin migraciones ni seed.

| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-160 | Módulo `dashboard` y `GET /dashboard`: validación de `period` y `date` (400), rango `[from, to)` calculado en `Business.timezone` (DEC-78, DEC-79) | M | Hecho: `57eea87` |
| B-161 | Agregaciones en SQL parametrizado con `businessId` explícito: `totals` (con `bySource`), `washes` (con `byType`), `maintenances` (cobrados y sin cobro) y `series` con buckets vacíos (DEC-80) | M | Hecho: `57eea87` |
| B-162 | `productsSold` y `topProducts`: vendido desde líneas `PRODUCT`, consumo de mantenimiento desde `MAINTENANCE_USE`, aparte y sin monto (DEC-81) | M | Hecho: `bef87e5` |
| B-163 | `stock` y `reminders.dueNow` reutilizando la lógica de `GET /inventory/alerts` y de recordatorios vencidos (DEC-82) | M | Hecho: `14190e7` (deuda B-905 detectada, fuera de R7) |
| B-164 | Pruebas del dashboard: integración con Postgres real (23:30 y 00:10 de Lima, semana que empieza en lunes, mes, anuladas excluidas, cobro de mantenimiento en otro día, consumo de mantenimiento sin monto, aislamiento entre negocios en cada consulta cruda, montos como `string`); e2e (forma, 400, 401) | M | Hecho: `57eea87`, `bef87e5` y `14190e7` (`dashboard*.spec`, `integration/dashboard*.int-spec`) |
| B-165 | BR-I1 en `/pilot-indicators`: ventas de mostrador, lavados y mantenimientos por separado, sin quitar campos actuales (DEC-85) | M | Hecho: `14aff9c` (`counterSales` y `washes` en `adoption`) |
| B-166 | Rate limit de DEC-86: por usuario en `GET` y en `POST`/`PATCH`, login por IP y por `username`, refresh por IP; 429 con `Retry-After` y `RATE_LIMITED`; pruebas | M | Hecho: `0f4d7c9` (`src/rate-limit/`, reemplaza `@nestjs/throttler`) |
| B-167 | Web: Inicio con el dashboard (`07` §3.1), barras en SVG/CSS propio (DEC-83), refresco de DEC-84, adopción en el Resumen del piloto y mensaje de 429 sin reintento automático (`07` §5) | M | Pendiente |
| B-168 | Validación final: `typecheck`, `lint`, `build`, unitarias, integración y e2e; prueba en navegador a 390 × 844 | M | Pendiente |

**Fuera de R7:** comparación con otro período, metas y porcentajes objetivo (BR-I4), stock mínimo, TanStack Query (DEC-38, DEC-84), librerías de gráficos, WebSocket/SSE, cifras por empleado (P-12) y la atomicidad de la idempotencia (A2, DEC-76 y DEC-87: corte técnico posterior).

### Fase 2
B-100 (venta rápida) y B-101 (métodos de pago) pasaron a R4 el 2026-09-26; B-102 (lavado) pasó a R5.

| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-103 | Cierre/resumen del día | M | Fase 2 (DEC-15) |

### Sin aprobar (no entran hasta decidir)
| ID | Ítem | Origen |
|---|---|---|
| B-900 | "Repetir productos de la última vez" | H sin validar |
| B-901 | Aviso "¿marcar como compatible?" | DEC-06 |
| B-902 | Alertas de stock mínimo | No aprobado |
| B-903 | Roles adicionales | P-12 |
| B-904 | ~~Salida de stock por venta, sin precio ni pago~~ **Retirado** (2026-09-26): lo cubre la venta de mostrador de R4 (B-131) | DEC-24 |
| B-905 | **Deuda técnica:** `checkReminderDue` (`src/reminders/reminder-due.ts`) calcula "hoy" con la medianoche de la zona horaria del **servidor**, no con `Business.timezone`. En un servidor en UTC, un recordatorio por fecha puede vencer unas horas antes o después que en Lima. Corregirlo cambia `GET /reminders`, Avisar y `reminders.dueNow` del dashboard: va en un corte separado, fuera de R7 | Detectado en R7 (B-163), 2026-09-28 |

## 4. Explícitamente fuera del backlog

Offline, IndexedDB y sincronización · WhatsApp API · facturación electrónica · IA o aprendizaje automático de compatibilidades · Kanban o estados de lavado · SaaS con planes y facturación · intervalos de mantenimiento predeterminados · módulo de citas o turnos.
