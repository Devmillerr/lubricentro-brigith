# 06 — API REST

**Versión:** 0.5 · **Actualizado:** 2026-09-26 (contrato de R4 en §2, Ventas)
Etiquetas: ver `03-BUSINESS-RULES.md`. Todo lo de este documento es [TÉCNICO] salvo lo indicado. La documentación viva será Swagger/OpenAPI generada por NestJS en `/api/docs`; este documento fija el diseño.

## 1. Convenciones

| Tema | Convención |
|---|---|
| Base | `/api/v1` |
| Formato | JSON, campos en `camelCase` |
| Autenticación | `Authorization: Bearer <JWT>`. El negocio sale del token; nunca aparece en rutas ni cuerpos (BR-G3) |
| Identificadores | UUID. En creaciones, el cliente puede enviar el `id` |
| Idempotencia | `Idempotency-Key` **obligatoria** en `POST /maintenances`, `POST /maintenances/:id/void`, `POST /inventory/*`, `POST /sales` y `POST /sales/:id/void` (R4). Repetir la clave devuelve el resultado original |
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
| POST | `/auth/login` | Token de acceso y de refresco. Límite propio: 5 intentos por minuto por IP; al superarlo, 429 (ver §4) |
| POST | `/auth/refresh` | Renueva el acceso |
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
| PATCH | `/maintenances/:id` | Corrige solo campos que no afectan el stock (BR-M11) |
| POST | `/maintenances/:id/void` | `{ reason? }`. Anula, revierte movimientos y descarta el recordatorio (BR-M12) |

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
| GET | `/pilot-indicators?from=&to=` | **Adopción:** mantenimientos activos. **Mantenimiento:** mantenimientos con próximo km/fecha y avisos abiertos. **Inventario:** movimientos por tipo y productos con conteo y movimientos. Solo lectura (BR-I1 a BR-I3) |

### Ventas (R4: aprobado el 2026-09-26, sin implementar)

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
  vehicleId: null; maintenanceId: null;   // siempre null en R4
  createdById; createdAt;
  voidedAt | null; voidReason | null;
  lines: SaleLineResponse[];
}
SaleLineResponse {
  id; kind;                      // PRODUCT en R4
  productId; washTypeId: null;   // siempre null en R4
  descriptionSnapshot; codeSnapshot | null;
  quantity: string; unitPrice: string; subtotal: string;
  movesStock: boolean;
}
```

#### `GET /sales`

`?from=&to=&source=&paymentMethod=&status=&limit=&cursor=`. Todos los filtros son opcionales.

- `from` y `to` (ISO 8601) se comparan contra `occurredAt`: `from` **incluido** y `to` **excluido** (`from ≤ occurredAt < to`).
- `source`: `COUNTER | WASH | MAINTENANCE` (en R4 solo existen ventas `COUNTER`).
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
| `INSUFFICIENT_STOCK` | 422 | Un producto con conteo inicial quedaría con saldo negativo. Rollback completo (DEC-26) |
| `PRODUCT_NOT_COUNTED` | aviso (201) | Un producto sin conteo inicial: se vende sin evaluar el saldo (DEC-27) |

`SALE_TOTAL_MISMATCH` no forma parte de R4: el total lo calcula siempre el servidor.

## 3. Endpoints de la Fase 2 (solo diseño)

| Ruta | Descripción |
|---|---|
| ~~`POST /sales`~~ | Pasó a R4: contrato en §2, Ventas |
| ~~`GET /payment-methods`~~ | Reemplazado por el diseño vigente (`10-OPERACION-REAL.md` §2.7): el método de pago es el enum `PaymentMethod` (`CASH`, `YAPE`); no hay endpoint |
| `GET /wash-types`, `POST /wash-records` | Lavado rápido opcional al recibir o cobrar |
| ~~`/daily-closes`~~ | Retirado: no hay cierre del día; el resumen lo da `GET /dashboard`. Diseño vigente de la Fase 2: `10-OPERACION-REAL.md` §2.7 |

## 4. Reglas transversales

- Un usuario nunca lee ni modifica datos de otro negocio. Los recursos ajenos devuelven 404.
- Las lecturas son seguras de reintentar. Las escrituras críticas son idempotentes.
- Ningún endpoint exige placa, teléfono ni cliente salvo donde `03` lo indique (BR-C1 a BR-C5).
- Ningún endpoint modifica ni elimina movimientos de inventario.
- Rate limit en memoria, por IP y por endpoint: 20 peticiones por minuto como protección general, y 5 por minuto en `POST /auth/login`. Al superarlo responde 429. No hay bloqueo de cuentas ni almacenamiento compartido (Redis). Sin `trust proxy`, detrás de un proxy todas las peticiones cuentan como la misma IP (DEC-10).

## 5. Puntos abiertos que afectan la API

DEC-01 y DEC-03 (valores de configuración), DEC-05 (política), DEC-22 (unidades de producto). Ninguno cambia rutas; cambian valores o validaciones de configuración.
