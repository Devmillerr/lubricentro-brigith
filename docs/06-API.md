# 06 — API REST

**Versión:** 0.8 · **Actualizado:** 2026-09-28 (backend de R7 implementado: §2, Dashboard e Indicadores del piloto, y §4, rate limit; la UI de R7 sigue pendiente; contrato de R6 cerrado en §2, Mantenimientos, sin implementar; R4 y R5 en §2)
Etiquetas: ver `03-BUSINESS-RULES.md`. Todo lo de este documento es [TÉCNICO] salvo lo indicado. La documentación viva será Swagger/OpenAPI generada por NestJS en `/api/docs`; este documento fija el diseño.

## 1. Convenciones

| Tema | Convención |
|---|---|
| Base | `/api/v1` |
| Formato | JSON, campos en `camelCase` |
| Autenticación | `Authorization: Bearer <JWT>`. El negocio sale del token; nunca aparece en rutas ni cuerpos (BR-G3) |
| Identificadores | UUID. En creaciones, el cliente puede enviar el `id` |
| Idempotencia | `Idempotency-Key` **obligatoria** en `POST /maintenances`, `POST /maintenances/:id/void`, `POST /inventory/*`, `POST /sales`, `POST /sales/:id/void` (R4) y `POST /maintenances/:id/charge` (R6). Repetir la clave devuelve el resultado original |
| Paginación | `?limit=&cursor=` |
| Errores | Problem details: `type`, `title`, `status`, `detail`, `code` estable, `errors[]` por campo |
| Avisos | Las respuestas de escritura incluyen `warnings[]`. Los avisos no bloquean |
| Validación | DTOs validados; campos desconocidos rechazados |
| Fechas | ISO 8601 UTC |

Códigos: 200/201 éxito · 400 validación · 401 sin sesión · 403 sin permiso · 404 no existe (también para recursos de otro negocio) · 409 conflicto de unicidad, idempotencia o estado (p. ej. reabrir un recordatorio que no se puede reabrir) · 429 demasiadas peticiones · 422 regla de negocio · 5xx servidor.

## 2. Endpoints del MVP

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | Token de acceso y de refresco. Límite propio (DEC-86): 5 intentos por minuto por IP **y** 5 por minuto por `username`; al superarlo, 429 `RATE_LIMITED` (ver §4) |
| POST | `/auth/refresh` | Renueva el acceso. Límite propio (DEC-86): 20 por minuto por IP |
| POST | `/auth/logout` | Invalida el refresco |
| GET | `/auth/me` | Usuario y negocio actuales |

### Negocio y configuración
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/business` | Datos y configuración |
| PATCH | `/business/settings` | `reminderLeadDays`, `defaultDueRuleWhenBoth`, `insufficientStockPolicy`, `whatsappTemplate`, `defaultCountryCode`, `currency` |

### Clientes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/customers?search=` | Buscar por nombre o teléfono |
| POST | `/customers` | Crear. Nada es obligatorio (BR-C3) |
| GET | `/customers/:id` | Detalle con sus vehículos |
| PATCH | `/customers/:id` | Editar |
| DELETE | `/customers/:id` | Desactivar |

### Vehículos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/vehicles/lookup?plate=` | **Búsqueda rápida por placa**: normalizada, coincidencia parcial. Devuelve vehículo, cliente, último mantenimiento, último km conocido y `lastMaintenanceReminder` (`{ id, status }` del recordatorio que generó el último mantenimiento activo, o `null`; BR-R13). La web consulta cuando se deja de escribir (debounce de 400 ms), no en cada tecla |
| POST | `/vehicles` | Crear con solo la placa (BR-C5). Cliente y modelo opcionales |
| GET | `/vehicles/:id` | Detalle |
| PATCH | `/vehicles/:id` | Editar, incluido el cliente |
| GET | `/vehicles/:id/maintenances` | Historial |
| GET | `/vehicles/:id/compatible-products` | Productos con compatibilidad confirmada |
| GET | `/vehicle-models` | Modelos del negocio |
| POST | `/vehicle-models` | `{ make?, model, yearFrom?, yearTo?, engineNote?, id? }`. `make` es opcional (R2) |
| PATCH | `/vehicle-models/:id` | Editar los mismos campos. `isActive: false` desactiva (BR-G5) |

### Productos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/product-categories?includeInactive=` | Categorías con `parentId`, `sortOrder`, `isActive` y `productCount` (productos activos). Por defecto solo las activas |
| POST | `/product-categories` | `{ name, parentId?, sortOrder?, id? }`. Máximo 2 niveles |
| PATCH | `/product-categories/:id` | `{ name?, parentId? (null = subir a categoría), sortOrder?, isActive? }`. Errores: `CATEGORY_DEPTH_EXCEEDED`, `CATEGORY_IN_USE` (desactivar con productos o subcategorías activos) |
| GET | `/products?search=&code=&categoryId=&isActive=&brand=&viscosity=&presentation=&missingPrice=&includeStock=` | La búsqueda cubre nombre, marca, código, viscosidad, presentación y vehículo compatible. `categoryId` incluye sus subcategorías. Sin `isActive` devuelve activos e inactivos |
| GET | `/products/facets?categoryId=` | Marcas, viscosidades y presentaciones de los productos activos (con conteo) más las sugerencias confirmadas |
| POST | `/products` | `{ name, unit, categoryId?, brand?, code?, viscosity?, presentation?, salePrice?, tracksStock?, id? }`. `unit` es texto libre (BR-P15) |
| PATCH | `/products/:id` | Editar los mismos campos; `null` borra los opcionales. `isActive: false` desactiva y `true` reactiva (BR-G5) |
| DELETE | `/products/:id` | Desactivar (no borra) |
| GET | `/products/:id/compatible-models` | Modelos con compatibilidad confirmada |

### Compatibilidad (explícita) [DECISIÓN] D-12
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/compatibilities` | `{ productId, vehicleModelId, note? }`. Acción explícita del usuario |
| DELETE | `/compatibilities/:id` | Quitar |

No existe ningún endpoint ni efecto lateral que cree compatibilidades a partir de mantenimientos o ventas (BR-F2).

### Inventario [DECISIÓN] DEC-04
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/inventory/stock?productId=` | Saldo por producto, con `isCounted` (BR-P8). Lee la caché de `Product` (R1) |
| GET | `/inventory/movements?productId=&type=` | Historial de movimientos |
| POST | `/inventory/counts` | `{ productId, countedQuantity, occurredAt? }`. Conteo físico; sirve como stock inicial (BR-P7). Guarda la diferencia contra el saldo |
| POST | `/inventory/receipts` | ~~`{ productId, quantity, occurredAt? }`~~. Reemplazado el 2026-09-25 por el contrato de R3 de abajo (ya implementado) |
| POST | `/inventory/adjustments` | ~~`{ productId, quantityDelta, reason }`~~. Reemplazado el 2026-09-25 por el contrato de R3 de abajo (ya implementado) |

No existen endpoints para editar ni borrar movimientos (BR-G5).

#### Cambios de R3 (aprobados el 2026-09-25, sin implementar)

Recepción en lote, ajuste por cantidad física y alertas de stock. Los dos `POST` son **cambios incompatibles**. El único cliente es `apps/web`, así que la API y la web se despliegan juntas. Las escrituras siguen exigiendo `Idempotency-Key` y aceptan un `id` UUID generado por el cliente (DEC-12).

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/inventory/receipts` | `{ id?, occurredAt?, note? (≤500), lines: [{ productId, quantity > 0 }] }`, de 1 a 100 líneas y sin productos repetidos. Crea una cabecera `InventoryReceipt` y un `PURCHASE_IN` por línea en una transacción: si una línea es inválida, no se guarda nada (BR-P6). Sin proveedor ni costo (DEC-36). **Implementado (2026-09-25).** Responde 201 `InventoryReceiptResponse`: `{ id, businessId, occurredAt, note, createdById, createdAt, lines }`, con `lines` = los `InventoryMovementResponse` (`PURCHASE_IN`, `refType: "InventoryReceipt"`, `refId` = id de la recepción) en el orden enviado |
| GET | `/inventory/receipts?limit=&cursor=` | Historial de recepciones, de la más reciente a la más antigua por `occurredAt`, con `id` como desempate estable. **Implementado (2026-09-25).** Responde 200 `InventoryReceiptSummaryPage` `{ items, nextCursor }`; cada elemento es la cabecera `{ id, businessId, occurredAt, note, createdById, createdAt, lineCount }`, sin las líneas (forma aprobada por el usuario). Dos consultas por página: cabeceras y un conteo agrupado de líneas |
| GET | `/inventory/receipts/:id` | Recepción con sus líneas (producto, cantidad, saldo resultante). **Implementado (2026-09-25).** Responde 200 `InventoryReceiptResponse`, la misma forma que el `POST` (aprobada por el usuario), con `lines` = sus `PURCHASE_IN` ordenados por `productId` (el orden de envío no se guarda). 404 `RECEIPT_NOT_FOUND` si no existe o es de otro negocio; 400 si `:id` no es UUID |
| POST | `/inventory/adjustments` | `{ productId, physicalQuantity ≥ 0, reason }`. La diferencia se calcula en el servidor con el producto bloqueado (BR-P7b). Responde `{ previousBalance, quantityDelta, resultingBalance, reason, createdById, occurredAt }`. **Implementado (2026-09-25).** Responde 201 `InventoryMovementResponse`, el movimiento `ADJUSTMENT` completo: trae esos campos, más `countedQuantity` (la cantidad física enviada), `id`, `productId` y `type`. `reason` es obligatorio (sin texto → 400, máx. 500). Sin `id` ni `occurredAt` del cliente: `occurredAt` es la hora del servidor. Errores: 400 `NO_DIFFERENCE`, 404 `PRODUCT_NOT_FOUND` (inexistente o de otro negocio), 409 `ADJUSTMENT_REQUIRES_COUNT` y 409 `PRODUCT_INACTIVE`. El ajuste no marca `isCounted` |
| GET | `/inventory/alerts` | `{ outOfStock[], negative[], notCountedCount }`. Solo productos activos. `outOfStock` (saldo = 0) y `negative` (saldo < 0) solo incluyen productos con conteo; los que no tienen conteo solo suman en `notCountedCount` (BR-P19). Lee la caché de `Product`. **Implementado (2026-09-25).** Responde 200 `StockAlertsResponse`. Cada elemento de `outOfStock` y `negative` es `{ productId, name, unit, balance }` (forma aprobada por el usuario), ordenado por nombre y sin paginar. Hace dos consultas: la lista de productos con saldo ≤ 0 y el conteo de los que no tienen conteo inicial. Solo cubre el negocio autenticado. Sin stock mínimo |

Errores de R3:

| Código | Estado | Cuándo |
|---|---|---|
| `DUPLICATE_PRODUCT_LINE` | 400 | La recepción repite un producto |
| `NO_DIFFERENCE` | 400 | La cantidad física del ajuste es igual al saldo del sistema (DEC-49) |
| `PRODUCT_NOT_FOUND` | 404 | El producto no existe o es de otro negocio. En una recepción, rechaza el lote completo |
| `RECEIPT_NOT_FOUND` | 404 | La recepción no existe o es de otro negocio |
| `ADJUSTMENT_REQUIRES_COUNT` | 409 | El producto no tiene conteo inicial; se pide un `POST /inventory/counts` antes (DEC-48) |
| `PRODUCT_INACTIVE` | 409 | Recepción o ajuste sobre un producto inactivo. En una recepción, rechaza el lote completo (DEC-51) |

### Mantenimientos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/maintenance-types` | Tipos disponibles |
| POST | `/maintenance-types` | Crear tipo |
| POST | `/maintenances` | Crea un mantenimiento **completo** en una sola petición: `vehicleId`, `maintenanceTypeId`, `performedAt`, `odometerKm?`, `items[]`, `nextDueKm?`, `nextDueDate?`, `dueRule?`, `notes?`. Requiere `Idempotency-Key`. Es una transacción (BR-M10): crea movimientos, evalúa stock y actualiza recordatorios |
| GET | `/maintenances/:id` | Detalle |
| PATCH | `/maintenances/:id` | Corrige solo campos que no afectan el stock (BR-M11). Desde R6, sin vehículo: 400 con `odometerKm`, `nextDueKm`, `nextDueDate` o `dueRule` (DEC-73). Un mantenimiento `VOIDED` no se corrige: 409 `MAINTENANCE_VOIDED`, también si una anulación concurrente se confirma mientras el `PATCH` está en curso (la escritura está condicionada a `status = ACTIVE`; no se escribe nada) |
| POST | `/maintenances/:id/void` | `{ reason }` **obligatorio desde R6** (DEC-71; hoy opcional). Anula, revierte movimientos, descarta el recordatorio y anula el cobro asociado si existe (BR-M12). Ver "Cambios de R6" |
| POST | `/maintenances/:id/charge` | **R6, sin implementar.** Cobro posterior de un mantenimiento. Ver "Cambios de R6" |

**Respuesta de `POST /maintenances`:** el mantenimiento, el recordatorio resultante (si aplica) y `warnings[]`. Códigos de aviso:

| Código | Cuándo |
|---|---|
| `INSUFFICIENT_STOCK` | Un producto con conteo inicial queda con saldo negativo. Se guarda igual (DEC-26). Incluye producto, saldo y cantidad pedida |
| `PRODUCT_NOT_COUNTED` | Un producto sin conteo inicial: se registra el movimiento, no se evalúa stock |
| `ODOMETER_LOWER_THAN_PREVIOUS` | El km es menor al último conocido |
| `NEXT_KM_NOT_ABOVE_CURRENT` | El próximo km no supera al km actual |
| `NEXT_DATE_BEFORE_PERFORMED` | La próxima fecha es anterior a la del mantenimiento |

**DEC-26:** el mantenimiento nunca se rechaza por stock, aunque `Business.insufficientStockPolicy` sea `BLOCK`: el producto ya se usó. El 422 `INSUFFICIENT_STOCK` queda para la venta de mostrador (R4), cuando un producto **con conteo** no alcanza. Un producto sin conteo nunca se bloquea (DEC-27).

Si se ingresan próximo km y próxima fecha sin `dueRule` y el negocio no definió `defaultDueRuleWhenBoth`, la respuesta es **400** con el campo `dueRule` requerido (BR-M5).

#### Cambios de R6 (contrato cerrado el 2026-09-28, sin implementar)

Cobro de mantenimiento, anulación conjunta y mantenimiento sin vehículo (DEC-31). Decisiones: DEC-69 a DEC-77 (`09-BACKLOG.md` §2). Diseño: `10-OPERACION-REAL.md` §2.2. El cobro es una `Sale` con `source = MAINTENANCE` y **una sola línea `SERVICE`** por el total (monto único, BR-V3); el stock sigue siendo del mantenimiento (`MAINTENANCE_USE`), la venta no mueve stock.

**Antes de R6 — Corte 0 (DEC-77):** `POST /maintenances/:id/void` pasa a una transición condicional `ACTIVE → VOIDED` dentro de la misma transacción; si no cambia ninguna fila, 409 `MAINTENANCE_ALREADY_VOIDED` sin generar movimientos. Corrige la anulación doble concurrente (hallazgo A1). No cambia el contrato HTTP.

**`POST /maintenances` (cambios):**

- `vehicleId` pasa a ser **opcional** (DEC-31, DEC-73). Requiere una migración de R6 (`maintenances.vehicleId` nullable).
- **Sin `vehicleId`** (DEC-73): `odometerKm`, `nextDueKm`, `nextDueDate` y `dueRule` se **rechazan con 400** `VALIDATION_ERROR` (un `errors[]` por campo); no se aceptan ni se guardan en silencio. No se crea recordatorio, no se cierra ningún recordatorio previo y no hay seguimiento por fecha ni km. Con `vehicleId`, esos campos siguen las reglas de siempre (BR-M2 a BR-M7).
- `charge?: { paymentMethod: CASH | YAPE, totalAmount }` opcional (DEC-72): `totalAmount` > 0 con hasta 2 decimales. Si viene, el cobro se crea en la **misma transacción** que el mantenimiento; si falla, no se guarda nada (BR-M10).
- Respuesta: `{ maintenance, reminder, sale, warnings }`, con `sale` = `SaleResponse` o `null`.

**`PATCH /maintenances/:id` (cambios, DEC-73):** la regla sin vehículo es simétrica a la creación. Si el mantenimiento **no tiene `vehicleId`**, enviar cualquiera de `odometerKm`, `nextDueKm`, `nextDueDate` o `dueRule` responde **400** `VALIDATION_ERROR` (un `errors[]` por campo); no se ignoran ni se guardan. `PATCH` no asigna ni quita el vehículo en R6. Con `vehicleId`, rigen las reglas de siempre (BR-M11).

**`POST /maintenances/:id/charge`** (DEC-72): cobro posterior de un mantenimiento sin cobro. Requiere `Idempotency-Key` (mecanismo actual, DEC-76).

- Request: `{ paymentMethod: CASH | YAPE, totalAmount }`, `totalAmount` > 0 con hasta 2 decimales. **No acepta `occurredAt`** (DEC-75).
- Crea en una transacción la `Sale`: `source = MAINTENANCE`, `status = ACTIVE`, `maintenanceId` = el mantenimiento, `vehicleId` = el del mantenimiento (o `null`), `customerId = null` (DEC-74; clientes en R8), `occurredAt` = hora del servidor al cobrar (DEC-75, D10), `total = totalAmount`. Una línea `SERVICE`: `productId = null`, `washTypeId = null`, `quantity = 1`, `unitPrice = subtotal = totalAmount`, `movesStock = false`, `descriptionSnapshot` = nombre del tipo de mantenimiento.
- Un mantenimiento tiene **como máximo una venta en toda su vida** (DEC-69): `Sale.maintenanceId` es único y la relación queda aunque la venta pase a `VOIDED`. No existe volver a cobrar.
- Response: 201 `SaleResponse`.

**`POST /maintenances/:id/void` (cambios):**

- `reason` **obligatorio** (DEC-71), tenga o no cobro: vacío o solo espacios → 400 `VALIDATION_ERROR`. Cambio incompatible: la web se adapta dentro de R6.
- Anulación conjunta, en una transacción y con el orden de bloqueo **Maintenance → Sale** (DEC-77, D8): transición condicional del mantenimiento (Corte 0); `MAINTENANCE_VOID` por cada `MAINTENANCE_USE`; descarte del recordatorio propio; si hay una venta `ACTIVE`, pasa a `VOIDED` con el **mismo `reason`**. La línea `SERVICE` no genera movimientos. Si la venta ya estaba `VOIDED`, la anulación continúa y la venta queda como estaba.
- Una segunda anulación (otra clave, concurrente o posterior): 409 `MAINTENANCE_ALREADY_VOIDED`.
- Response: 200 `{ maintenance, sale }`, con `sale` = la venta asociada o `null`.

**Lecturas (P8, sin número de DEC):** `GET /maintenances/:id` y `GET /vehicles/:id/maintenances` exponen `sale` (`SaleResponse` o `null`). No hay una pantalla separada de cobros de mantenimiento.

**Errores de R6:**

| Código | Estado | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `POST /maintenances` sin `vehicleId`, o `PATCH /maintenances/:id` de un mantenimiento sin vehículo, con `odometerKm`, `nextDueKm`, `nextDueDate` o `dueRule` (DEC-73); `POST /maintenances/:id/void` sin `reason` (DEC-71); `charge`/cobro con `totalAmount` inválido |
| `MAINTENANCE_NOT_FOUND` | 404 | `POST /maintenances/:id/charge` sobre un mantenimiento inexistente o de otro negocio |
| `MAINTENANCE_VOIDED` | 409 | `POST /maintenances/:id/charge` sobre un mantenimiento `VOIDED`: no se cobra ni se vuelve a cobrar (DEC-69). `PATCH /maintenances/:id` sobre un mantenimiento `VOIDED`, incluido el que se anula mientras el `PATCH` está en curso: no se escribe nada |
| `MAINTENANCE_ALREADY_CHARGED` | 409 | `POST /maintenances/:id/charge` sobre un mantenimiento que ya tiene una venta, `ACTIVE` o `VOIDED` (DEC-69) |
| `MAINTENANCE_ALREADY_VOIDED` | 409 | Segunda anulación del mismo mantenimiento (Corte 0, DEC-77) |
| `SALE_MANAGED_BY_MAINTENANCE` | 409 | `POST /sales/:id/void` sobre una venta con `source = MAINTENANCE` (DEC-70) |

**Deuda técnica (DEC-76):** R6 usa el `IdempotencyService` actual. La atomicidad entre la reserva de la clave y el efecto (hallazgo A2) no se resuelve en R6; queda como corte separado.

### Recordatorios y WhatsApp
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/reminders?due=now\|upcoming\|all&status=` | Lista con motivo (`DATE_REACHED`, `KM_REACHED_BY_LAST_KNOWN`, `NO_PHONE`). Sin días de anticipación configurados, `now` significa desde la fecha exacta (BR-R5) |
| GET | `/reminders/:id` | Detalle, con el texto que se enviaría según la plantilla. Incluye `closeReason` (motivo del cierre: `cumplido`, `descartado`, `mantenimiento anulado`…, o `null`) y `reopenBlockedBy` (`DONE`, `SOURCE_VOIDED`, `OPEN_EXISTS`, o `null` si se puede reabrir o ya está abierto; BR-R11) |
| POST | `/reminders/:id/contacts` | Registra que se abrió el aviso y devuelve el enlace `wa.me`. Pasa el recordatorio a `CONTACTED`. Error 422 si no hay teléfono (BR-W6, BR-R10) |
| PATCH | `/reminders/:id` | Cambiar el estado: volver a `PENDING`, o `DISMISSED` explícito (BR-R9). Errores 409: `REMINDER_DONE` (cumplido, no se reabre), `REMINDER_SOURCE_VOIDED` (su mantenimiento fue anulado, no se reabre), `REMINDER_OPEN_EXISTS` (ya hay otro abierto para el mismo vehículo y tipo; también si la base rechaza la escritura por el único parcial, nunca 500), `REMINDER_ALREADY_CLOSED` (descartar uno ya cerrado; BR-R12). Un 409 no modifica el recordatorio |

### Indicadores del piloto [DECISIÓN] Visión §6
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/pilot-indicators?from=&to=` | **Adopción:** mantenimientos, ventas de mostrador y lavados `ACTIVE`, por separado (R7, DEC-85; ver abajo). **Mantenimiento:** mantenimientos con próximo km/fecha y avisos abiertos. **Inventario:** movimientos por tipo y productos con conteo y movimientos. Solo lectura (BR-I1 a BR-I3) |

**BR-I1 desde R7 (DEC-85, implementado en B-165):** `adoption` devuelve tres conteos, sin quitar el campo que ya existía:

| Campo | Qué cuenta | Fecha que se filtra |
|---|---|---|
| `adoption.activeMaintenances` | `Maintenance` `ACTIVE` (campo previo, sin cambios) | `performedAt` |
| `adoption.counterSales` | `Sale` `ACTIVE` con `source = COUNTER` | `Sale.occurredAt` |
| `adoption.washes` | `Sale` `ACTIVE` con `source = WASH` | `Sale.occurredAt` |

- **Período:** los tres reutilizan exactamente los `from`/`to` del endpoint (ISO 8601, ambos **opcionales** e **inclusivos**: `>= from` y `<= to`; sin `from` no hay límite inferior y sin `to` no hay superior). La respuesta repite `from`/`to` tal como llegaron, o `null`. No usa `Business.timezone` ni la semántica `[from, to)` del dashboard.
- El cobro de mantenimiento (`source = MAINTENANCE`) no se cuenta aparte: el mantenimiento ya está en `activeMaintenances`. Las anuladas no cuentan.
- Solo conteos (enteros): sin porcentajes ni metas (BR-I4). `maintenance` (BR-I2) e `inventory` (BR-I3) no cambian.

### Dashboard (R7: backend implementado el 2026-09-28, B-160 a B-164; UI pendiente, B-167)

Decisiones: DEC-78 a DEC-84 (`09-BACKLOG.md` §2). Reglas: BR-D1 a BR-D7 (`03`). Un único módulo `dashboard` y un único endpoint, de solo lectura (sin `Idempotency-Key`).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/dashboard?period=today|week|month&date=YYYY-MM-DD` | Cifras del período en la zona horaria del negocio |

**Parámetros:**
- `period`: `today` (por defecto), `week` (lunes a domingo que contiene `date`) o `month` (mes calendario que contiene `date`). Otro valor → 400 `VALIDATION_ERROR`.
- `date`: opcional, `YYYY-MM-DD` interpretado en `Business.timezone`; por defecto, hoy en esa zona. Formato o fecha inválidos → 400 `VALIDATION_ERROR`.

**Response 200 (`DashboardResponse`):**

```ts
DashboardResponse {
  period: { kind: 'today'|'week'|'month'; date: 'YYYY-MM-DD'; from: ISO8601; to: ISO8601; timezone: string }; // [from, to)
  totals: { total; cash; yape; salesCount; bySource: { counter; wash; maintenance } };                      // montos
  washes: { count; amount; byType: [{ washTypeId: string|null; name; count; amount }] };
  maintenances: { count; charged; uncharged };
  productsSold: { units };                                        // líneas PRODUCT de ventas ACTIVE
  topProducts: [{ productId; name; soldUnits; soldAmount; maintenanceUnits }];   // máx. 10
  series: [{ bucket: ISO8601; counter; wash; maintenance }];     // por hora (today) o por día (week, month)
  stock: { outOfStock; negative; notCounted; items: StockAlertProduct[] };       // items máx. 10
  reminders: { dueNow };                                          // no depende del período
}
```

Tipos: `salesCount`, `washes.count`, `byType[].count`, `maintenances.*`, `stock.outOfStock`, `stock.negative`, `stock.notCounted` y `reminders.dueNow` son enteros. Todos los montos (`totals.*`, `bySource.*`, `washes.amount`, `byType[].amount`, `soldAmount`, `series[].counter|wash|maintenance`) y las cantidades de producto (`productsSold.units`, `soldUnits`, `maintenanceUnits`) son `string` decimal. `StockAlertProduct` es el mismo elemento de `GET /inventory/alerts` (`productId`, `name`, `unit`, `balance`).

**Reglas de cálculo:**
- **Rango:** `from` y `to` son los límites local 00:00 del primer día y 00:00 del día siguiente al último, convertidos a UTC; se filtra `occurredAt >= from AND occurredAt < to`. Las series agrupan con `date_trunc(..., occurredAt AT TIME ZONE timezone)` e incluyen los buckets vacíos en cero (BR-D1).
- **Ingresos (`totals`, `series`):** solo `Sale` `ACTIVE` (BR-D2), por `Sale.occurredAt`. `cash`/`yape` por `paymentMethod`; `bySource` por `source` (BR-D3). `salesCount` = número de ventas `ACTIVE` de todos los orígenes.
- **Lavados:** ventas `ACTIVE` con `source = WASH`; `byType` agrupa por `SaleLine.washTypeId` con el nombre actual del tipo. `washTypeId` es `null` si el tipo ya no existe (FK `ON DELETE SET NULL`).
- **Mantenimientos:** `Maintenance` `ACTIVE` por `performedAt` en el rango; `count` = `charged` + `uncharged`, con `charged` = con venta asociada `ACTIVE` y `uncharged` = sin venta (BR-D4). El cobro no suma otro mantenimiento. Su ingreso está solo en `bySource.maintenance` (y en `totals`/`series`), fechado por `Sale.occurredAt`, la hora real del cobro.
- **Productos:** `productsSold.units` y `soldUnits`/`soldAmount` salen de las líneas `PRODUCT` de ventas `ACTIVE` (en la práctica, de mostrador), por `Sale.occurredAt`, controlen stock o no. `maintenanceUnits` sale de `inventory_movements` `MAINTENANCE_USE` (`refType = 'Maintenance'`) de mantenimientos `ACTIVE`, como cantidad positiva; **no** suma a ningún monto (BR-D5). Orden: `soldUnits + maintenanceUnits` descendente, luego nombre e `id`; máximo 10.
- **Stock:** el mismo método que `GET /inventory/alerts` (BR-P19), así que las dos pantallas coinciden. `outOfStock` y `negative` cuentan productos activos con **`tracksStock = true`** y conteo inicial, con saldo `= 0` y `< 0`; `notCounted` cuenta los activos con `tracksStock = true` sin conteo. Un producto con `tracksStock = false` nunca es alerta (BR-P16). `items` toma hasta 10 (primero negativos, luego agotados, cada grupo por nombre). Es el saldo actual: no depende del período.
- **Recordatorios:** `dueNow` = cantidad que devolvería `GET /reminders?due=now&status=PENDING` (el mismo método del servicio, sin duplicar la lógica). No depende del período. Hereda la deuda B-905 (`09-BACKLOG.md` §3): el "hoy" de `checkReminderDue` usa la zona del servidor, no `Business.timezone`.
- **Montos y cantidades:** `string` decimal calculado en Postgres (`numeric`) y serializado sin pasar por `float` (como el resto de la API).
- **Aislamiento y SQL:** las consultas SQL crudas no pasan por `forBusiness`: llevan `businessId` explícito, son parametrizadas (`$queryRaw` con plantilla, sin `$queryRawUnsafe` ni texto interpolado) y cada una tiene una prueba de aislamiento entre negocios.
- **Índices:** alcanzan los existentes (`sales [businessId, status, occurredAt]`, `inventory_movements [businessId, productId, occurredAt]`, `maintenances` por `businessId`). Sin migración en R7 (`prisma/` no cambió en R7); se revisa si el piloto muestra lentitud.

**Errores:** 400 `VALIDATION_ERROR` · 401 · 429 `RATE_LIMITED`.

**Fuera de R7:** comparación con otro período, metas o porcentajes objetivo, stock mínimo, cifras por empleado (P-12), exportar, tiempo real (WebSocket/SSE).

### Ventas (R4: aprobado el 2026-09-26; API y UI implementadas sin commit)

Venta de mostrador: productos, un método de pago y confirmación, sin cliente ni placa (DEC-44). Diseño: `10-OPERACION-REAL.md` §2.1, §2.3, §2.5 y §2.7. Decisiones: DEC-26, DEC-27, DEC-29, DEC-30 y el alcance de R4 (`09-BACKLOG.md` §2 y §3, ítems B-100, B-101 y B-130 a B-136; `10` §3.2e). Las pantallas se documentan en `07-UI-UX.md`.

**Fuera de R4:** formas de venta (`ProductSaleUnit`, `saleUnitId`), pago mixto, lavados (`source = WASH`, R5), cobro de mantenimiento (`source = MAINTENANCE`, líneas `SERVICE`, R6), dashboard (R7) y clientes o vehículos en la venta (R8). Tampoco hay `GET /payment-methods`: el método de pago es el enum `PaymentMethod` publicado en OpenAPI.

#### Modelos y enums

| Enum | Valores | En R4 |
|---|---|---|
| `PaymentMethod` | `CASH`, `YAPE` | Ambos. Un solo método por venta (DEC-30) |
| `SaleSource` | `COUNTER`, `WASH`, `MAINTENANCE` | Solo se crea `COUNTER` |
| `SaleStatus` | `ACTIVE`, `VOIDED` | Ambos |
| `SaleLineKind` | `PRODUCT`, `WASH`, `SERVICE` | Solo se crea `PRODUCT` |

`Sale` (una por venta; con `businessId`, aislada por negocio):

| Campo | Tipo | En R4 |
|---|---|---|
| `id` | UUID | El cliente puede enviarlo (DEC-12) |
| `source` | `SaleSource` | `COUNTER` |
| `status` | `SaleStatus` | `ACTIVE` al crear; `VOIDED` al anular |
| `paymentMethod` | `PaymentMethod` | Obligatorio |
| `total` | decimal (10,2) | Suma de los subtotales de las líneas, calculada en el servidor |
| `occurredAt` | fecha y hora | La enviada, o la hora del servidor |
| `note` | texto, opcional | Hasta 500 caracteres |
| `vehicleId`, `customerId`, `maintenanceId` | UUID, opcionales | Siempre `null` en R4 |
| `createdById` | UUID | Usuario del token |
| `voidedAt`, `voidedById`, `voidReason` | opcionales | Se llenan al anular |
| `createdAt`, `updatedAt` | fecha y hora | Del servidor |

`SaleLine` (con `businessId`):

| Campo | Tipo | En R4 |
|---|---|---|
| `id`, `saleId` | UUID | — |
| `kind` | `SaleLineKind` | `PRODUCT` |
| `productId` | UUID | Obligatorio en R4 |
| `washTypeId` | UUID, opcional | Siempre `null` en R4 |
| `descriptionSnapshot` | texto | Nombre del producto al momento de la venta (BR-G6) |
| `codeSnapshot` | texto, opcional | Código del producto al momento de la venta |
| `quantity` | decimal (12,3) | En la unidad del producto (sin formas de venta) |
| `unitPrice` | decimal (10,2) | Precio aplicado en esta venta |
| `subtotal` | decimal (10,2) | `quantity × unitPrice`, redondeado half-up a 2 decimales |
| `movesStock` | booleano | `true` si el producto controla stock; `false` si `tracksStock = false` |

#### `POST /sales`

Crea una venta completa en una sola transacción. Requiere `Idempotency-Key`.

**Request (`CreateSaleDto`):**

```ts
{
  id?: uuid;                       // DEC-12
  paymentMethod: 'CASH' | 'YAPE';  // uno solo (DEC-30)
  occurredAt?: ISO8601;            // si falta, la hora del servidor
  note?: string;                   // ≤ 500
  lines: [                         // de 1 a 50, sin productos repetidos
    { productId: uuid; quantity: number /* > 0, hasta 3 decimales */; unitPrice: number /* ≥ 0, hasta 2 decimales */ }
  ];
}
```

**Validación (antes de tocar el stock):**

- Campos desconocidos rechazados (§1), incluidos `saleUnitId`, `total`, `customerId` y `vehicleId`: 400.
- `paymentMethod` fuera de `CASH | YAPE`, `lines` vacío o con más de 50, `quantity ≤ 0`, `unitPrice < 0` o con más decimales de los permitidos, `note` > 500: 400 con `errors[]` por campo (p. ej. `lines.0.quantity`).
- Un producto repetido en `lines`: 400 `DUPLICATE_PRODUCT_LINE`.

**Cálculo en el servidor:**

- `subtotal` de cada línea = `quantity × unitPrice`, redondeado **half-up a 2 decimales** por línea.
- `total` = suma de los `subtotal`. El cliente no envía el total: no hay error de total distinto.
- **Precio editable (DEC-29):** `unitPrice` es el precio aplicado en esta venta. Puede diferir de `Product.salePrice` y sirve para vender un producto que todavía no tiene precio en el catálogo. Queda guardado en la línea; cambiar después el precio del catálogo no altera la venta (BR-V8). La venta no modifica `Product.salePrice`.

**Productos y stock (una transacción; si algo falla, no se guarda nada):**

- Producto inexistente o de otro negocio: 404 `PRODUCT_NOT_FOUND`; se rechaza la venta completa.
- Producto inactivo: 409 `PRODUCT_INACTIVE`; se rechaza la venta completa.
- Producto con `tracksStock = true`: la línea queda con `movesStock = true` y genera un movimiento `SALE` (`quantityDelta = −quantity`, `refType = 'Sale'`, `refId` = id de la venta) a través del `StockLedger`, con el producto bloqueado y el saldo en caché actualizado en la misma transacción.
- Producto con `tracksStock = false`: la línea queda con `movesStock = false`, **sin** movimiento de stock y sin evaluar saldo.
- **Stock insuficiente: `BLOCK` fijo (DEC-26).** Si un producto **con conteo inicial** quedaría con saldo negativo, responde **422 `INSUFFICIENT_STOCK`** con el producto, su saldo y la cantidad pedida, y **no se guarda nada**: ni la venta, ni las líneas, ni los movimientos. La venta no lee `Business.insufficientStockPolicy` y no existe la opción de "confirmar igual".
- Producto **sin conteo inicial**: se vende y se registra el `SALE`, sin evaluar el saldo, con el aviso `PRODUCT_NOT_COUNTED` (DEC-27).

**Idempotencia:** la misma `Idempotency-Key` con el mismo cuerpo devuelve la respuesta original sin crear otra venta. La misma clave con otro cuerpo: 409 `IDEMPOTENCY_KEY_REUSED`. Mientras la primera petición sigue en curso: 409 `IDEMPOTENCY_KEY_IN_PROGRESS`. Sin la cabecera: 400 `IDEMPOTENCY_KEY_REQUIRED`.

**Response:** 201 `CreateSaleResult` = `SaleResponse` + `warnings[]`. Cada aviso tiene la misma forma que en mantenimiento: `{ code, message, productId }`. En R4 el único aviso es `PRODUCT_NOT_COUNTED`.

```ts
SaleResponse {
  id; source; status; paymentMethod;
  total: string;                 // decimal como texto, nunca float
  occurredAt; note | null;
  vehicleId | null; maintenanceId | null;   // null en mostrador y lavado; solo el cobro de mantenimiento (R6) los llena
  createdById; createdAt;
  voidedAt | null; voidReason | null;
  lines: SaleLineResponse[];
}
SaleLineResponse {
  id; kind;                           // PRODUCT en mostrador (COUNTER); WASH en lavado (R5)
  productId | null; washTypeId | null;   // PRODUCT: productId y washTypeId null; WASH (R5): washTypeId y productId null
  descriptionSnapshot; codeSnapshot | null;
  quantity: string; unitPrice: string; subtotal: string;
  movesStock: boolean;
}
```

#### `GET /sales`

`?from=&to=&source=&paymentMethod=&status=&limit=&cursor=`. Todos los filtros son opcionales.

- `from` y `to` (ISO 8601) se comparan contra `occurredAt`: `from` **incluido** y `to` **excluido** (`from ≤ occurredAt < to`).
- `source`: `COUNTER | WASH | MAINTENANCE` (R4 crea `COUNTER`; R5 agrega `WASH`; `MAINTENANCE` llega con R6).
- `paymentMethod`: `CASH | YAPE`.
- `status`: `ACTIVE | VOIDED`. Sin `status`, devuelve las dos.
- Paginación por cursor (§1).
- Orden: de la más reciente a la más antigua por `occurredAt`, con `id` como desempate estable.
- Solo ventas del negocio autenticado.

**Response:** 200 `SaleSummaryPage` `{ items, nextCursor }`. Cada elemento es la cabecera de la venta sin las líneas, más `lineCount`: `{ id, source, status, paymentMethod, total, occurredAt, note, vehicleId, maintenanceId, createdById, createdAt, voidedAt, voidReason, lineCount }`.

#### `GET /sales/:id`

Venta con sus líneas. **Response:** 200 `SaleResponse` (la misma forma que el `POST`, sin `warnings`).

- 404 `SALE_NOT_FOUND` si no existe o es de otro negocio (aislamiento: nunca revela ventas ajenas).
- 400 si `:id` no es UUID.

#### `POST /sales/:id/void`

Anula una venta. Requiere `Idempotency-Key`.

**Request:** `{ reason: string }`. Obligatorio (BR-V7): vacío o solo espacios → 400; máximo 500 caracteres.

**Efecto (una transacción):**

- Por cada línea con `movesStock = true`, genera un movimiento `SALE_VOID` que devuelve la cantidad al stock (`quantityDelta = +quantity`, `refType = 'Sale'`, `refId` = id de la venta), a través del `StockLedger`. Las líneas con `movesStock = false` no generan movimientos.
- **Producto desactivado después de la venta:** la venta se anula igual y su `SALE_VOID` se genera. La validación de producto inactivo (409 `PRODUCT_INACTIVE`) aplica al crear la venta, no al anularla (BR-P21).
- La venta pasa a `VOIDED` y guarda `voidedAt`, `voidedById` y `voidReason`. Nada se borra ni se edita (BR-G5): la venta y sus movimientos originales quedan.

**Idempotencia y anulación repetida:**

- La misma `Idempotency-Key` con el mismo cuerpo devuelve la respuesta original, sin generar otro `SALE_VOID`.
- Otra clave sobre una venta ya anulada: 409 `SALE_ALREADY_VOIDED`, sin cambios.
- **Cobro de mantenimiento (R6, DEC-70, sin implementar):** una venta con `source = MAINTENANCE` no se anula por aquí: 409 `SALE_MANAGED_BY_MAINTENANCE`, sin cambios. Su única vía es `POST /maintenances/:id/void`.
- Errores de la cabecera: los mismos que en `POST /sales` (`IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_KEY_IN_PROGRESS`).

**Response:** 200 `SaleResponse` con `status: VOIDED`, `voidedAt` y `voidReason`.

Errores: 404 `SALE_NOT_FOUND` (inexistente o de otro negocio), 400 si `:id` no es UUID.

#### Errores y avisos de R4

| Código | Estado | Cuándo |
|---|---|---|
| `DUPLICATE_PRODUCT_LINE` | 400 | La venta repite un producto |
| `PRODUCT_NOT_FOUND` | 404 | Un producto de la venta no existe o es de otro negocio. Rechaza la venta completa |
| `SALE_NOT_FOUND` | 404 | La venta no existe o es de otro negocio (`GET /sales/:id`, `POST /sales/:id/void`) |
| `PRODUCT_INACTIVE` | 409 | Un producto de la venta está inactivo. Rechaza la venta completa |
| `SALE_ALREADY_VOIDED` | 409 | Se intenta anular una venta que ya está anulada |
| `SALE_MANAGED_BY_MAINTENANCE` | 409 | **R6 (DEC-70), sin implementar.** Se intenta anular con `POST /sales/:id/void` una venta con `source = MAINTENANCE`; se anula con `POST /maintenances/:id/void` |
| `INSUFFICIENT_STOCK` | 422 | Un producto con conteo inicial quedaría con saldo negativo. Rollback completo (DEC-26) |
| `PRODUCT_NOT_COUNTED` | aviso (201) | Un producto sin conteo inicial: se vende sin evaluar el saldo (DEC-27) |

`SALE_TOTAL_MISMATCH` no forma parte de R4: el total lo calcula siempre el servidor.

### Lavados (R5: decisiones cerradas el 2026-09-26; API implementada sin commit, UI pendiente)

Registro rápido de un lavado: tipo, precio (de sus opciones), pago y confirmación, sin cliente ni placa (BR-L2, DEC-44). Diseño: `10-OPERACION-REAL.md` §0.3, §2.3, §2.5 y §2.7. Decisiones: DEC-53 a DEC-68 (`09-BACKLOG.md` §2; `10` §3.2f).

**No hay tabla `Wash` (DEC-53).** Un lavado es una `Sale` con `source = WASH` y **una sola** `SaleLine` con:

| Campo | Valor en un lavado |
|---|---|
| `kind` | `WASH` |
| `washTypeId` | Obligatorio: el tipo elegido |
| `productId` | `null` |
| `movesStock` | `false` |
| `unitPrice`, `subtotal` | El `amount` de la opción de precio elegida (DEC-55) |
| `descriptionSnapshot` | Exactamente el `name` del `WashType` al momento del cobro, sin prefijos (si el tipo se llama "Lavado Auto", queda "Lavado Auto"). Conserva el nombre histórico aunque el tipo se edite después (BR-G6, DEC-67) |

El lavado **no mueve stock (DEC-54):** no pasa por el `StockLedger` y no genera `InventoryMovement`, ni al crearlo ni al anularlo.

#### Modelos nuevos

`WashType` (con `businessId`): `id`, `name` (único por negocio), `imageKey?` (sin subida, igual que `Product.imageKey`; DEC-34), `sortOrder`, `isActive`, `createdAt`, `updatedAt`.

`WashPriceOption` (con `businessId`): `id`, `washTypeId`, `amount` decimal (10,2), `label?` (nulo: el dueño elige el monto al ver el vehículo, sin criterio escrito, §0.3), `sortOrder`, `isActive`, `createdAt`, `updatedAt`.

`SaleLine.washTypeId` pasa a tener FK hacia `WashType`. Los dos modelos entran en `BUSINESS_SCOPED_MODELS`.

#### `POST /washes`

Crea el lavado en una transacción, todo o nada. Requiere `Idempotency-Key` (misma semántica que `POST /sales`; se registra con `endpoint = "washes"`).

**Implementado (B-143, 2026-09-26, sin commit):** `src/washes/washes.service.ts` escribe con el helper `writeSale` de R4 (DEC-61). Orden de las validaciones dentro de la transacción: tipo (404), precio (404), precio del tipo (409 `WASH_PRICE_NOT_IN_TYPE`), tipo activo (409 `WASH_TYPE_INACTIVE`), precio activo (409 `WASH_PRICE_INACTIVE`). La línea lleva `quantity = 1`. Un `id` repetido falla con el error genérico de la base, igual que `POST /sales` (T4).

**Request (`CreateWashDto`):**

```ts
{
  id?: uuid;                       // DEC-12
  washTypeId: uuid;
  priceOptionId: uuid;             // el precio siempre sale de una opción activa; no hay monto libre (DEC-55)
  paymentMethod: 'CASH' | 'YAPE';  // uno solo (DEC-30)
  occurredAt?: ISO8601;            // momento real del cobro; si falta, la hora del servidor (DEC-58)
  note?: string;                   // ≤ 500, misma semántica que Sale.note (DEC-57)
}
```

- Campos desconocidos rechazados (§1), incluidos `amount`, `unitPrice`, `total`, `customerId`, `vehicleId` y `plate`: 400.
- Tipo inexistente o de otro negocio: 404 `WASH_TYPE_NOT_FOUND`. Opción de precio inexistente o de otro negocio: 404 `WASH_PRICE_NOT_FOUND` (DEC-65).
- Tipo de lavado inactivo: 409 `WASH_TYPE_INACTIVE`. Opción de precio inactiva: 409 `WASH_PRICE_INACTIVE` (DEC-55).
- La opción de precio debe pertenecer al tipo: 409 `WASH_PRICE_NOT_IN_TYPE` (`10` §2.7, DEC-65).
- El total lo calcula el servidor: `total` = `subtotal` = `amount` de la opción.
- No existe `performedAt` en una venta: `occurredAt` es la fecha del cobro (DEC-58).

**Response:** 201 `SaleResponse` (la misma forma que `GET /sales/:id`, sin `warnings`: un lavado no toca el stock).

**Consultas y anulación (DEC-59):** no hay endpoints propios. Historial: `GET /sales?source=WASH`; detalle: `GET /sales/:id`; anulación: `POST /sales/:id/void` con motivo obligatorio (BR-V7). La anulación de un lavado no genera `SALE_VOID` porque su línea tiene `movesStock = false`. En la web, R5 reutiliza el historial, el detalle y la anulación genéricos de ventas (B-135), filtrando `source=WASH`; no hay pantallas propias de historial de lavados (DEC-68).

#### Configuración: tipos y precios (DEC-56)

Crear, editar y desactivar tipos y opciones de precio, con `sortOrder` e `isActive` como en `/product-categories`. Sin borrado físico (DEC-17). Como la configuración de categorías, no pide `Idempotency-Key`.

**Implementado (B-141, 2026-09-26, sin commit):** `src/washes/`. `GET` devuelve `WashTypeWithPricesResponse[]` (el tipo más `prices`); `POST`/`PATCH /wash-types` devuelven `WashTypeResponse` (`id`, `name`, `imageKey`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`); las rutas de precios devuelven `WashPriceOptionResponse` (`id`, `washTypeId`, `amount` como string, `label`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`). Sin `businessId`. Orden: tipos por `sortOrder`, `name` e `id`; precios por `sortOrder`, `amount` e `id`. `name`, `label` e `imageKey` se guardan con `trim`; `label` o `imageKey` vacíos quedan en `null`. Topes técnicos para no llegar a un 500: `amount` con hasta 2 decimales y ≤ 99 999 999,99 (Decimal(10,2)), `sortOrder` ≤ 2 147 483 647 (Int) e `imageKey` ≤ 255.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/wash-types?includeInactive=` | Tipos con sus opciones de precio, ordenados por `sortOrder` (`10` §2.7). Por defecto solo tipos activos, cada uno con sus precios activos: es lo que usa el flujo de cobro. Con `includeInactive=true` devuelve también los tipos y precios inactivos, con su `isActive`, para Configuración (DEC-64) |
| POST | `/wash-types` | `{ id?, name, imageKey?, sortOrder? }`. Crear tipo; nace activo (`isActive` no se acepta: 400) |
| PATCH | `/wash-types/:id` | `{ name?, imageKey? (null = sin imagen), sortOrder?, isActive? }`. Editar o desactivar (`isActive: false`) y reactivar (`true`) |
| POST | `/wash-types/:id/prices` | `{ id?, amount, label?, sortOrder? }`. Agregar una opción de precio al tipo |
| PATCH | `/wash-types/:id/prices/:priceId` | `{ amount?, label? (null = sin etiqueta), sortOrder?, isActive? }`. Editar, desactivar (`isActive: false`) o reactivar (`true`) una opción de precio. El `priceId` debe pertenecer al `:id` y al negocio actual (DEC-63) |

`includeInactive` sigue el patrón de `/product-categories?includeInactive=`. La pantalla de cobro nunca lo envía: solo ve tipos y precios activos.

Ni los tipos ni los precios se borran físicamente (DEC-17). Desactivar o editar un tipo o un precio no altera los lavados ya registrados (snapshots, BR-G6).

**Validaciones (DEC-66):**

| Campo | Regla |
|---|---|
| `name` | Obligatorio al crear, con `trim`, no vacío, máximo 100 caracteres. Único por negocio |
| `label` | Opcional, con `trim`, máximo 100 caracteres |
| `amount` | Mayor que 0 |
| `sortOrder` | Entero no negativo |

No hay otras restricciones.

**Errores de la configuración (DEC-65):**

| Código | Estado | Cuándo |
|---|---|---|
| `WASH_TYPE_NOT_FOUND` | 404 | El tipo (`:id`) no existe o es de otro negocio |
| `WASH_PRICE_NOT_FOUND` | 404 | La opción de precio (`:priceId`) no existe o es de otro negocio |
| `WASH_TYPE_ALREADY_EXISTS` | 409 | Otro tipo del negocio ya tiene ese `name` (crear o renombrar), como `PRODUCT_CATEGORY_ALREADY_EXISTS` |
| `WASH_PRICE_NOT_IN_TYPE` | 409 | El `:priceId` es del negocio pero pertenece a otro tipo |

#### Errores de R5

| Código | Estado | Dónde |
|---|---|---|
| `WASH_TYPE_NOT_FOUND` | 404 | `POST /washes`, `PATCH /wash-types/:id`, rutas `/wash-types/:id/prices` |
| `WASH_PRICE_NOT_FOUND` | 404 | `POST /washes`, `PATCH /wash-types/:id/prices/:priceId` |
| `WASH_TYPE_ALREADY_EXISTS` | 409 | `POST /wash-types`, `PATCH /wash-types/:id` |
| `WASH_PRICE_NOT_IN_TYPE` | 409 | `POST /washes`, `PATCH /wash-types/:id/prices/:priceId` |
| `WASH_TYPE_INACTIVE` | 409 | `POST /washes` (DEC-55) |
| `WASH_PRICE_INACTIVE` | 409 | `POST /washes` (DEC-55) |

Los cinco puntos que estaban "Por definir" se cerraron con el usuario el 2026-09-26 (DEC-63 a DEC-67).

## 3. Endpoints de la Fase 2 (solo diseño)

| Ruta | Descripción |
|---|---|
| ~~`POST /sales`~~ | Pasó a R4: contrato en §2, Ventas |
| ~~`GET /payment-methods`~~ | Reemplazado por el diseño vigente (`10-OPERACION-REAL.md` §2.7): el método de pago es el enum `PaymentMethod` (`CASH`, `YAPE`); no hay endpoint |
| ~~`GET /wash-types`, `POST /wash-records`~~ | Reemplazado por R5 (§2, Lavados): `POST /washes` crea una `Sale` con `source = WASH`; no hay `WashRecord`. El lavado es un flujo propio, no un paso de otra operación |
| ~~`/daily-closes`~~ | Retirado: no hay cierre del día; el resumen lo da `GET /dashboard`. Diseño vigente de la Fase 2: `10-OPERACION-REAL.md` §2.7 |

## 4. Reglas transversales

- Un usuario nunca lee ni modifica datos de otro negocio. Los recursos ajenos devuelven 404.
- Las lecturas son seguras de reintentar. Las escrituras críticas son idempotentes.
- Ningún endpoint exige placa, teléfono ni cliente salvo donde `03` lo indique (BR-C1 a BR-C5).
- Ningún endpoint modifica ni elimina movimientos de inventario.
- **Topes de los campos `Decimal` [TÉCNICO].** Límites técnicos de las columnas de Postgres, no reglas de negocio: un valor que no cabe responde **400 `VALIDATION_ERROR`** (con el campo en `errors[]`) en vez de un 500, sin escribir nada.

  | Columna | Máximo | Campos de entrada |
  |---|---|---|
  | `Decimal(10,2)` (dinero) | 99 999 999,99 | `lines[].unitPrice` de `POST /sales`; `totalAmount` del cobro (`charge` de `POST /maintenances` y `POST /maintenances/:id/charge`); `salePrice` de `POST`/`PATCH /products`; `amount` de los precios de lavado (ya existía, B-141) |
  | `Decimal(12,3)` (cantidades) | 999 999 999,999 | `lines[].quantity` de `POST /sales` y de la recepción en lote; `countedQuantity` del conteo; `physicalQuantity` del ajuste; `items[].quantity` de `POST /maintenances` |

  También se controlan los valores que calcula el servidor, aunque cada dato suelto sea válido:
  - **Venta:** el subtotal de cada línea (`quantity × unitPrice`) y el total deben caber en `Decimal(10,2)`; si no, 400 con el campo `lines.<i>.subtotal` o `total`.
  - **Stock:** el saldo resultante y la diferencia de cada movimiento deben caber en `Decimal(12,3)` (en valor absoluto). Si no, 400 con el campo `countedQuantity` (conteo), `physicalQuantity` (ajuste), `lines` (venta y recepción) o `items` (mantenimiento).
- **`internal/idempotency-test` no es parte de la API.** Es un controlador interno para probar el mecanismo de idempotencia de punta a punta. Solo se monta con `NODE_ENV=test` exactamente: sin `NODE_ENV`, con `production`, `development` o cualquier otro valor, la ruta no existe (404). Tampoco aparece en OpenAPI. La web no lo usa.
- **Rate limit (DEC-86, [TÉCNICO]; implementado en R7, B-166).** Reemplazó al de `@nestjs/throttler` (20 por minuto por IP y endpoint, y 5 por minuto en login). No hay bloqueo de cuentas ni almacenamiento compartido (Redis). Valores de protección inicial, revisables con datos del piloto:

  | Tráfico | Límite | Clave |
  |---|---|---|
  | `GET` autenticado | 120 por minuto | usuario (`userId` del token), sumando todos los endpoints |
  | `POST`/`PATCH` autenticado | 30 por minuto | usuario, sumando todos los endpoints |
  | `POST /auth/login` | 5 por minuto por IP **y** 5 por minuto por `username` | IP; `username` del cuerpo |
  | `POST /auth/refresh` | 20 por minuto | IP |

  Ventana fija de 60 segundos, almacenamiento en memoria (válido para la arquitectura actual de una sola instancia de la API; con varias haría falta un almacenamiento compartido). Al exceder: **429** con cabecera `Retry-After` (segundos, mínimo 1) y cuerpo en el formato de error de la API con `code: "RATE_LIMITED"`. La web no reintenta automáticamente (`07` §5).

  Detalles de la implementación (`src/rate-limit/`, guard global):
  - Claves: `read:user:<userId>` y `write:user:<userId>` (el `sub` de un token de acceso válido); `login-ip:<ip>`, `login-username:<username>` y `refresh-ip:<ip>`. Las dos cuotas de login se cuentan a la vez; si falta `username` en el cuerpo, solo cuenta la de IP.
  - `HEAD` cuenta como lectura y `PUT`/`DELETE` como escritura. Login y refresh tienen su propio límite y no suman a los generales.
  - Sin token, o con uno inválido o vencido, la petición cuenta por IP (`read:ip:<ip>` / `write:ip:<ip>`) con los mismos límites, sin consumir la cuota del usuario del token; la ruta protegida responde luego 401.
  - La ventana empieza con la primera petición de la clave y se reinicia entera al vencer. Una petición rechazada con 429 no suma.
  - CORS expone `Retry-After` para que la web pueda leerla.
  - Los límites por IP usan `req.ip`, sin `trust proxy`: detrás de un proxy todas las peticiones cuentan como la misma IP (DEC-10).

## 5. Puntos abiertos que afectan la API

DEC-01 y DEC-03 (valores de configuración), DEC-05 (política), DEC-22 (unidades de producto). Ninguno cambia rutas; cambian valores o validaciones de configuración.
