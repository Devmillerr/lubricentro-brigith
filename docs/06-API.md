# 06 — API REST

**Versión:** 0.4 · **Actualizado:** 2026-09-25 (contrato de R3 en §2, Inventario)
Etiquetas: ver `03-BUSINESS-RULES.md`. Todo lo de este documento es [TÉCNICO] salvo lo indicado. La documentación viva será Swagger/OpenAPI generada por NestJS en `/api/docs`; este documento fija el diseño.

## 1. Convenciones

| Tema | Convención |
|---|---|
| Base | `/api/v1` |
| Formato | JSON, campos en `camelCase` |
| Autenticación | `Authorization: Bearer <JWT>`. El negocio sale del token; nunca aparece en rutas ni cuerpos (BR-G3) |
| Identificadores | UUID. En creaciones, el cliente puede enviar el `id` |
| Idempotencia | `Idempotency-Key` **obligatoria** en `POST /maintenances`, `POST /maintenances/:id/void` y `POST /inventory/*`. Repetir la clave devuelve el resultado original |
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

## 3. Endpoints de la Fase 2 (solo diseño)

| Ruta | Descripción |
|---|---|
| `POST /sales` | Venta rápida: líneas y pago. Genera movimientos de stock con el mismo mecanismo (BR-V4). Sin cliente ni placa obligatorios |
| `GET /payment-methods` | Efectivo y Yape (C-17) |
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
