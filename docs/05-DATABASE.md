# 05 — Base de datos

**Versión:** 0.4 · **Actualizado:** 2026-09-28 (`Maintenance` y `Sale.maintenanceId` según el contrato de R6, sin implementar)
PostgreSQL + Prisma. Modelo **conceptual**; el esquema Prisma se escribe en la implementación. Etiquetas: ver `03-BUSINESS-RULES.md`. Las reglas viven en `03`; aquí solo se indica cómo se guardan.

## 1. Convenciones [TÉCNICO]

- Clave primaria UUID (el cliente puede generarlo; ver `04-ARCHITECTURE.md` §7).
- Toda tabla de negocio tiene `businessId`. Las restricciones de unicidad son **por negocio**, excepto `User.username`, que es única **globalmente** (DEC-25): es lo que permite resolver el negocio en `/auth/login` sin que el cliente lo indique.
- Campos comunes: `createdAt`, `updatedAt`, `createdById`.
- Desactivación (`isActive`) en clientes, vehículos, productos y modelos. Anulación (`status`) en mantenimientos. **Sin borrado físico** de registros de negocio (BR-G5).
- Fechas de hecho (`performedAt`, `occurredAt`) separadas de `createdAt`.
- Cantidades: decimales, para no cerrar ninguna opción de unidad (BR-P15).
- Dinero: decimal. Ningún precio se asume; todos son opcionales en el MVP.

## 2. Diagrama (MVP)

```mermaid
erDiagram
  Business ||--o{ User : tiene
  Business ||--o{ Customer : tiene
  Business ||--o{ Vehicle : tiene
  Business ||--o{ VehicleModel : tiene
  Business ||--o{ Product : tiene
  Business ||--o{ ProductCategory : tiene
  Business ||--o{ MaintenanceType : tiene
  Customer |o--o{ Vehicle : "cliente actual"
  VehicleModel |o--o{ Vehicle : es
  ProductCategory |o--o{ Product : clasifica
  Product ||--o{ ProductCompatibility : "es compatible"
  VehicleModel ||--o{ ProductCompatibility : con
  Vehicle ||--o{ Maintenance : recibe
  MaintenanceType ||--o{ Maintenance : tipo
  Maintenance ||--o{ MaintenanceItem : usa
  Product ||--o{ MaintenanceItem : en
  Product ||--o{ InventoryMovement : mueve
  Vehicle ||--o{ Reminder : genera
  Maintenance ||--o| Reminder : origina
  Reminder ||--o{ ReminderContact : historial
```

## 3. Tablas del MVP

### Business
| Campo | Notas |
|---|---|
| id, name, slug | `slug` único |
| timezone | Zona horaria (para fechas de recordatorio) |
| currency | Moneda del negocio. Valor a confirmar en el seed |
| defaultCountryCode | Para armar el enlace de WhatsApp (BR-W5). Valor a confirmar tras P-01 |
| reminderLeadDays | **Nulo hasta que se decida** (BR-R5, DEC-03) |
| defaultDueRuleWhenBoth | `ANY` \| `ALL` \| nulo. **Nulo hasta que se decida** (BR-M5, DEC-01) |
| insufficientStockPolicy | `ALLOW_WITH_WARNING` \| `BLOCK`. Valor provisional: `ALLOW_WITH_WARNING` (BR-P11, BR-P12, DEC-05) |
| whatsappTemplate | Nulo hasta P-13 (BR-W4) |

Cada punto abierto es **una columna de configuración**, no una estructura: decidirlo después es cambiar un valor.

### User
`id, businessId, name, username (único global, DEC-25), passwordHash, role, isActive`. En el MVP el único rol es `OWNER` (P-12 sin responder). Agregar otro rol es una migración de un valor, no de estructura.

### Customer
`id, businessId, name?, phone?, notes?, isActive`. Ningún campo obligatorio salvo el id (BR-C3).

### VehicleModel
`id, businessId, make?, model, yearFrom?, yearTo?, engineNote?, isActive`. `make` es opcional desde R2: el texto del dueño se guarda tal cual en `model`. Año y motor son opcionales: el nivel de detalle de la compatibilidad se define con datos (BR-F6).

### Vehicle
| Campo | Notas |
|---|---|
| id, businessId | |
| plate | Como fue escrita |
| plateNormalized | Mayúsculas, sin espacios ni guiones. **Único con `businessId`** (BR-C6) |
| customerId? | Opcional (BR-C4) |
| vehicleModelId? | Opcional |
| year?, color?, notes? | Opcionales |
| isActive | |

El "último km conocido" **se calcula** desde el mantenimiento activo más reciente con km. No se guarda.

### ProductCategory
`id, businessId, name, parentId?, sortOrder, isActive`. Máximo 2 niveles (validado en el servicio). `name` único por negocio. Semilla: **Lubricante** y **Filtro** (BR-P18) y el árbol de DEC-37 debajo de ellas.

### Product
| Campo | Notas |
|---|---|
| id, businessId | |
| categoryId? | |
| brand? | Texto libre. Marcas confirmadas: Repsol, Vistony, Valvoline (C-10) |
| code? | Código (los filtros se manejan por código, C-05). Único por negocio si existe |
| name | |
| unit | Unidad en la que se cuenta y descuenta (BR-P15). Vocabulario a definir con P-07 |
| salePrice? | Opcional. Se usará en la Fase 2 |
| tracksStock | Por defecto `true` (BR-P16) |
| viscosity?, presentation? | Texto opcional (R2). Sugerencias desde `GET /products/facets` |
| imageKey? | Opcional (R2). Sin subida todavía (DEC-34): la UI muestra un placeholder |
| stockQuantity | Saldo en caché, `Decimal(12,3)`, por defecto 0. Solo lo escribe el StockLedger (R1) |
| isCounted | En caché: tiene al menos un `COUNT` (BR-P8). Solo lo escribe el StockLedger (R1) |
| isActive | |

Cada fila es una **unidad de stock**. Cómo se representan presentaciones y granel queda para DEC-22; con esta estructura, ambas opciones son solo datos.

### ProductCompatibility
`id, businessId, productId, vehicleModelId, confirmedById, confirmedAt, note?`. Único `(productId, vehicleModelId)`. Solo se crea por acción explícita (BR-F1, BR-F2). No hay campos de "inferido" ni "confianza".

### MaintenanceType
`id, businessId, name, isActive`. Semilla: "Cambio de aceite" (BR-M13).

### Maintenance
| Campo | Notas |
|---|---|
| id, businessId, maintenanceTypeId | |
| vehicleId? | **Desde R6, opcional** (DEC-31, DEC-73). Hoy es obligatorio en el esquema: requiere una migración de R6 (B-151). Sin vehículo, `odometerKm`, `nextDueKm`, `nextDueDate` y `dueRule` quedan siempre nulos: la API los rechaza al crear y al corregir (BR-M16) |
| performedAt | Cuándo se hizo |
| odometerKm? | Opcional |
| nextDueKm?, nextDueDate? | Opcionales (BR-M2) |
| dueRule? | `KM`, `DATE`, `ANY`, `ALL`. Nulo si no hay próximo mantenimiento (BR-M4) |
| notes? | |
| status | `ACTIVE` \| `VOIDED` |
| voidedAt?, voidedById?, voidReason? | Al anular (BR-M12). **Desde R6, `voidReason` es obligatorio cuando `status = VOIDED`** (DEC-71); la columna puede seguir siendo nullable físicamente, y la regla la aplica la API. Los mantenimientos anulados antes de R6 pueden tenerlo nulo |

Coherencia: `KM` exige `nextDueKm`; `DATE` exige `nextDueDate`; `ANY`/`ALL` exigen ambos.
`Maintenance` no guarda precios ni totales. Desde R6 su cobro es una `Sale` con `source = MAINTENANCE` y una sola línea `SERVICE` (BR-M15, DEC-72), enlazada por `Sale.maintenanceId`: único y **permanente**, aunque la venta pase a `VOIDED`. Un mantenimiento tiene como máximo una venta en toda su vida (DEC-69).

### MaintenanceItem
`id, maintenanceId, productId, productNameSnapshot, productCodeSnapshot?, quantity`. `quantity > 0`.

### InventoryMovement
| Campo | Notas |
|---|---|
| id, businessId, productId | |
| type | `COUNT`, `PURCHASE_IN`, `MAINTENANCE_USE`, `MAINTENANCE_VOID`, `ADJUSTMENT`, y los definidos `SALE`, `SALE_VOID` (salidas por venta; punto de entrada según DEC-24) (BR-P4, BR-P14) |
| quantityDelta | Con signo. Entra +, sale − |
| countedQuantity? | Solo en `COUNT`: la cantidad contada |
| previousBalance? | Solo en `COUNT`: saldo calculado justo antes, para auditar la diferencia |
| reason? | Obligatorio en `ADJUSTMENT` (BR-P10) |
| refType?, refId? | Origen (por ejemplo, el mantenimiento) |
| resultingBalance? | Saldo del producto justo después del movimiento, calculado con la fila bloqueada. Nulo en filas anteriores a R1 |
| createdById? | Usuario que lo registró. Nulo en filas anteriores a R1 |
| occurredAt | |

**Solo se insertan filas; nunca se actualizan ni se borran** (BR-G5, BR-P3).

**Invariantes:**
1. `saldo(producto) = Σ quantityDelta`.
2. En un `COUNT`, `quantityDelta = countedQuantity − previousBalance`, de modo que el saldo posterior es igual a la cantidad contada.
3. Un producto está "con conteo inicial" si tiene al menos un `COUNT` (BR-P8).
4. `MAINTENANCE_USE` y `MAINTENANCE_VOID` nacen en la misma transacción que el mantenimiento o su anulación (BR-M10).

**Saldo en caché (R1, `10-OPERACION-REAL.md` §2.1):** `Product.stockQuantity` e `isCounted` guardan el saldo y el estado de conteo, y las lecturas (`GET /inventory/stock`, `GET /products?includeStock=true`) salen de ahí. La fuente de verdad sigue siendo la suma de movimientos: la invariante 5 se prueba contra Postgres en `test/integration/`.

5. `Product.stockQuantity = Σ quantityDelta` de sus movimientos. La mantiene el **StockLedger** (`src/inventory/stock-ledger.ts`), único escritor de movimientos: bloquea las filas de producto (`FOR UPDATE`, en orden de id) antes de cualquier otra escritura de la transacción, inserta los movimientos y actualiza la caché en la misma transacción. La migración `r1_stock_ledger` rellena la caché desde los movimientos existentes.

### Reminder
| Campo | Notas |
|---|---|
| id, businessId, vehicleId, maintenanceTypeId | |
| sourceMaintenanceId | Mantenimiento que lo originó |
| dueDate?, dueKm?, dueRule | Copiados del mantenimiento |
| status | `PENDING`, `CONTACTED`, `DONE`, `DISMISSED` (BR-R7) |
| closedByMaintenanceId?, closedAt?, closeReason? | `closeReason`: cumplido, descartado o mantenimiento anulado |

Un solo recordatorio abierto (`PENDING`/`CONTACTED`) por `(businessId, vehicleId, maintenanceTypeId)` (BR-R2). "Corresponde avisar ahora" se **calcula en la consulta**, no se guarda (BR-R3, R4, R6).

### ReminderContact
`id, reminderId, userId, channel (WHATSAPP_LINK), openedAt, messageSnapshot`. Historial de enlaces abiertos (BR-W6). No prueba que se haya enviado (BR-W2).

### IdempotencyRecord
`businessId, key, endpoint, requestHash, responseStatus, responseBody, createdAt`. Único `(businessId, key, endpoint)` (migración `20260922200000_idempotency_key_per_endpoint`). Sirve a todas las escrituras críticas (mantenimientos, inventario, ventas, lavados y, en R6, el cobro de mantenimiento), por eso no es una columna de `Maintenance`. La purga tras un plazo técnico no está implementada. La atomicidad entre la reserva de la clave y el efecto (hallazgo A2) es deuda técnica fuera de R6 (DEC-76).

## 4. Tablas de la Fase 2 (no se crean en el MVP)

| Tabla | Idea |
|---|---|
| Sale, SaleLine | Venta con líneas de producto o servicio. Cliente y vehículo opcionales. Implementadas en R4 (`schema.prisma`). `maintenanceId` único y permanente (R6, DEC-69) |
| PaymentMethod, Payment | Métodos sembrados: **Efectivo** y **Yape** (C-17). Otros: P-09 |
| WashType | **R5.** Tipo de lavado (moto lineal, auto, camioneta…): `name` único por negocio, `imageKey?`, `sortOrder`, `isActive`. Sin precio propio: los precios son sus `WashPriceOption`. Valores confirmados en `10-OPERACION-REAL.md` §0.3 (BR-L6). **Modelo creado (B-140, sin commit):** tabla `wash_types`, único `(businessId, name)`, índice `(businessId, sortOrder)`; migración `20260927023545_r5_washes` solo en `brigith_test` |
| WashPriceOption | **R5.** Opción de precio de un tipo: `washTypeId`, `amount` (10,2), `label?`, `sortOrder`, `isActive`. Un tipo tiene una o dos opciones y el dueño elige una al cobrar, sin criterio escrito (§0.3). **Modelo creado (B-140, sin commit):** tabla `wash_price_options`, FK a `wash_types` y `businesses` (`RESTRICT`), índice `(businessId, washTypeId, sortOrder)`. `sale_lines.washTypeId` ya tiene FK hacia `wash_types` |
| ~~WashRecord~~ | **Retirada (R5, DEC-53):** no hay tabla de lavado. Un lavado es una `Sale` con `source = WASH` y una `SaleLine` `WASH` (`washTypeId`, `productId` nulo, `movesStock = false`). Sin estados (BR-L1), sin cliente ni placa (DEC-44) |
| DailyClose | Resumen del día. Conteos manuales: DEC-15 |

Los movimientos de venta usan `InventoryMovement` con los tipos `SALE` y `SALE_VOID`, ya definidos en el MVP (BR-P14). Las tablas de arriba solo agregan el documento de venta (precio, pago); el libro de inventario no cambia.

## 5. Índices y restricciones clave [TÉCNICO]

- `Vehicle(businessId, plateNormalized)` único; índice para búsqueda parcial por placa.
- `Customer(businessId, phone)` no único.
- `Product(businessId, code)` único si `code` no es nulo.
- `ProductCompatibility(productId, vehicleModelId)` único.
- `Maintenance(businessId, vehicleId, performedAt desc)`.
- `InventoryMovement(businessId, productId, occurredAt)`.
- `Reminder(businessId, status)` y único parcial `(businessId, vehicleId, maintenanceTypeId)` para recordatorios abiertos.
- `IdempotencyRecord(businessId, key, endpoint)` único.
- Todas las claves foráneas dentro del mismo `businessId`. Las pruebas de aislamiento lo verifican (`04-ARCHITECTURE.md` §10).

## 6. Migraciones y datos iniciales

- Migraciones versionadas con Prisma.
- Semilla de Brigith: negocio, usuario dueño, categorías Lubricante y Filtro, tipo "Cambio de aceite". Semilla del negocio "demo" para pruebas (BR-G7).
- **No se siembra** ningún intervalo de mantenimiento, plantilla de mensaje, precio, producto, código de filtro ni compatibilidad.
- **R5 (B-145, sin commit):** `prisma/seed-washes.ts` siembra en brigith los 9 tipos de lavado de `10-OPERACION-REAL.md` §0.3 con sus 8 montos confirmados (Moto lineal S/8 y S/10, Tico S/15, Auto S/15, Mototaxi S/15, Camioneta S/30 y S/40, Furgón S/30), sin etiquetas ni imagen. Minibán, Combi y Moto carguera quedan activos y sin precio. Idempotente: crea el tipo solo si no existe y sus precios solo si el tipo no tiene ninguno, así que no pisa cambios hechos desde la app. En Supabase solo con autorización (DEC-62).
- Carga de productos, clientes y vehículos reales: depende de P-01, P-07 y P-08.

## 7. Cómo se cierran los puntos abiertos sin rehacer el modelo

| Punto abierto | Dónde se resuelve |
|---|---|
| DEC-01 regla con km y fecha | `Business.defaultDueRuleWhenBoth` |
| DEC-03 anticipación | `Business.reminderLeadDays` |
| DEC-05 stock insuficiente | `Business.insufficientStockPolicy` |
| DEC-07 detalle de compatibilidad | Datos de `VehicleModel` (año/motor opcionales) |
| DEC-21 carga del stock inicial | Proceso de uso; el modelo (`COUNT`) ya soporta ambas |
| DEC-22 presentaciones y unidades | Datos de `Product.unit` y filas de `Product` |
| P-12 otros usuarios | Nuevo valor de `User.role` |
| P-17 otros mantenimientos | Filas de `MaintenanceType` |
| P-13 mensaje | `Business.whatsappTemplate` |
