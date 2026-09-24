# 10 — Evolución a operación real: análisis (Fase 1) y diseño (Fase 2)

**Versión:** 0.3 (propuesta, **sin aprobar**) · **Fecha:** 2026-09-23
**Referencia principal:** el **mapa funcional** entregado por el usuario el 2026-09-23 define cómo debe funcionar Brigith OS. Si este documento dice otra cosa, manda el mapa. La v0.3 retira lo que el mapa no pide (ver §4, contradicciones 8 a 15).
Etiquetas: ver `03-BUSINESS-RULES.md`. Nada de este documento está implementado. Cuando se apruebe, las reglas nuevas pasan a `03-BUSINESS-RULES.md`, los modelos a `05-DATABASE.md`, los endpoints a `06-API.md` y las decisiones a `09-BACKLOG.md` §2.

**Principio rector:** el sistema se adapta al negocio, no el negocio al sistema.

**Cambios de la v0.2:** respuestas confirmadas del dueño (cobro del cambio de aceite, aceite de balde, lavado de moto y camioneta, catálogo con códigos de filtros) y rediseño de Clientes + Avisar por WhatsApp. Ver §0, §2.2, §2.3, §2.5, §2.11, §3 y §4.

---

## 0. Datos del dueño

Uso de etiquetas en este documento:

- **[CONFIRMADO]**: lo dijo el dueño. La fuente son los mensajes del desarrollador del 2026-09-23 (dos entregas), resumidos, no citas textuales. Deben pasar a `research/BRIGITH-DISCOVERY.md` §1 (ver §4).
- **[DECISIÓN]**: decisión funcional tomada por el usuario/desarrollador, no un dato del negocio.
- **[PENDIENTE]**: falta el dato del dueño.

### 0.1 Operación general

| Tema | Dato | Estado |
|---|---|---|
| Catálogo | ~300–400 productos | [CONFIRMADO] |
| Marcas de lubricantes | Repsol, Vistony, Valvoline | [CONFIRMADO] (C-10) |
| Pagos | Yape y efectivo | [CONFIRMADO] (C-17) |
| Placa | No siempre se registra | [CONFIRMADO] |
| Teléfono | Los clientes fijos suelen tenerlo; los nuevos pueden no tenerlo | [CONFIRMADO] |
| Mantenimiento | Algunos vehículos cada 25 días; los que trabajan en mina se controlan por km; el próximo puede depender de fecha, de km o de ambos | [CONFIRMADO] |
| Reposición | Compras a proveedores, semanal para aceites auto y moto | [CONFIRMADO] (C-18) |
| Stock mínimo | **No existe regla.** El dueño no sabe qué productos se agotan más | [CONFIRMADO] que no existe |
| Volumen de lavado | ~10–15 diarios | [CONFIRMADO] (C-13) |

### 0.2 Cobro del cambio de aceite

| Dato | Estado |
|---|---|
| Se cobra **un único monto total** que incluye producto + mano de obra | [CONFIRMADO] |
| No hace falta separar ante el cliente el cobro de producto y mano de obra | [CONFIRMADO] |
| El sistema sí registra los productos usados, para controlar el stock | [CONFIRMADO] |

Resuelve P-09 en lo que toca al cambio de aceite, BR-V3 (esa parte) y DEC-32.

### 0.3 Lavado

| Tipo | Precio | Criterio | Estado |
|---|---|---|---|
| Moto lineal | S/8 o S/10 | Lo elige el dueño en el momento. **No se define otro criterio** | [CONFIRMADO] precios · sin criterio escrito por decisión del dueño |
| Mototaxi | S/15 | Precio único | [CONFIRMADO] |
| Tico | S/15 | Precio único | [CONFIRMADO] |
| Auto | S/15 | Precio único | [CONFIRMADO] |
| Camioneta | S/30 o S/40 | Depende del tamaño y de dónde viene el vehículo (las camionetas de mina pueden llegar con bastante barro). Lo decide el dueño al ver el vehículo | [CONFIRMADO] |
| Furgón | S/30 | Precio único | [CONFIRMADO] |

Consecuencia de diseño: el sistema **no** calcula el precio a partir de tamaño ni procedencia. Muestra los dos montos y el dueño toca uno. Los montos no llevan etiqueta ("chica/grande", "con barro"): sería un criterio inventado.

### 0.4 Catálogo de productos

**Aceites y fluidos** [CONFIRMADO]

| Tipo | Productos / valores |
|---|---|
| Aceite auto | Viscosidades 5W30, 10W30, 10W40, 20W50, 25W60 |
| Aceite auto, presentaciones especiales | 20W50 1.5 L · 25W60 1.5 L |
| Aceite moto | 10W40 litro · 20W50 litro |
| Aceite de balde | 25W60 en balde. **Se vende por litros o el balde completo** |
| Aceite 2 tiempos | 200 ml |
| Transmisión | 80W90 · 85W140 · SAE90 |
| Agua de radiador (refrigerante) | Simple, rojo, verde · concentraciones 17 %, 33 %, 50 % |
| Agua limpiaparabrisas | 1 L |
| Líquido de freno | 8 oz |
| Silicona | 300 ml · 120 ml |
| Silicona de empaque (juntas) | 85 g |
| Hidrolina | De balde |

**Filtros de aire** [CONFIRMADO] código y vehículo tal como los dio el dueño

| Código | Vehículo indicado | Estado de la compatibilidad |
|---|---|---|
| 21050 | Yaris | [CONFIRMADO] |
| 1030 | Probox | [CONFIRMADO] |
| 2000 | Tercel | [CONFIRMADO] |
| 2002 | Tico | [CONFIRMADO] |
| 2001 | — | [PENDIENTE] compatibilidad |
| BZ200 | Yaris moderno | [CONFIRMADO] · qué años son "moderno": [PENDIENTE] |
| 1R100 | Kia 2016 | [CONFIRMADO] · modelo de Kia: [PENDIENTE] |
| H9100 | Hyundai | [CONFIRMADO] · modelo de Hyundai: [PENDIENTE] |
| 1W100 | Kia 2014 | [CONFIRMADO] · modelo de Kia: [PENDIENTE] |
| 0Y040 | "envidia" | [PENDIENTE] confirmar nombre y compatibilidad |
| 2K000 | Kia 2025 | [CONFIRMADO] · modelo de Kia: [PENDIENTE] |
| 52164 | Chevrolet N300 | [CONFIRMADO] |
| B400 | Grand i10 2025 | [CONFIRMADO] |

**Filtros de aceite** [CONFIRMADO] códigos: 3007, 3001, 1616, 3003, 68, 833N, 356, 916, 1446, 54, 838, 304, 27, 9. Sus compatibilidades con vehículos no se dieron: [PENDIENTE] (no bloquea: la compatibilidad es informativa, BR-F3).

Reglas para cargar estos datos sin inventar:

- El **código** es el dato principal del filtro y se carga tal cual (`Product.code`).
- La compatibilidad se carga con el **texto que dio el dueño** en `VehicleModel.model` ("Yaris", "Kia 2016"). Separar marca/modelo/año (p. ej. `make = Toyota`) o poner rangos de años solo con confirmación del dueño (DEC-07). "Yaris" y "Yaris moderno" se cargan como dos modelos distintos, porque el dueño los distingue.
- Las compatibilidades [PENDIENTE] se cargan como producto **sin** compatibilidad; nunca con una supuesta.
- **Lo que no se conoce no es obligatorio:** precio, imagen, marca, presentación y compatibilidad son opcionales en todo producto. Nunca se inventan ni se exigen como paso para crear o usar un producto; se completan después desde la ficha.

### 0.5 Lo que todavía falta para el catálogo real [PENDIENTE]

1. **Precios de venta** de todos los productos (P-07).
2. **Imágenes** de productos (se cargan desde la app; no se descargan de internet).
3. **Combinaciones exactas marca × viscosidad × presentación** que existen en el estante (p. ej. ¿qué marcas tienen 25W60 1.5 L? ¿de qué marca es el aceite de balde?). No se genera el producto cartesiano.
4. **Presentación estándar** de los aceites auto (fuera de las especiales de 1.5 L).
5. **Capacidad en litros de cada balde** (aceite 25W60 e hidrolina): hace falta para descontar el balde completo en litros (§2.3).
6. **Hidrolina:** ¿también se vende por litros o solo el balde completo? Lo confirmado sobre venta por litros es para el aceite de balde.
7. **Combinaciones reales de refrigerante** (color × concentración) y su presentación.
8. **Marcas de filtros, siliconas y demás no lubricantes**, si el dueño quiere registrarlas.
9. Compatibilidades de 2001, 0Y040 y de los filtros de aceite; modelos exactos de los Kia y Hyundai.

---

## FASE 1 — ANÁLISIS

### 1.1 Estado actual del backend (NestJS 12 + Prisma 7 + PostgreSQL/Supabase)

Base sólida y verificada (190 tests unitarios, typecheck y lint limpios según `STATUS.md`).

| Pieza | Estado | Observación para este cambio |
|---|---|---|
| Auth JWT + refresh con rotación | Completo | Reutilizar tal cual |
| Aislamiento `forBusiness` (extensión Prisma) | Completo | Agregar los modelos nuevos a `BUSINESS_SCOPED_MODELS`. Las consultas SQL crudas (dashboard) **no** pasan por el filtro: deben llevar `businessId` explícito y tener test |
| Idempotencia (`IdempotencyRecord`, insert-first) | Completo, robusto | Reutilizar en ventas, lavados, recepciones, ajustes y cobro de mantenimiento |
| Errores RFC 7807 (`ProblemException`) + `@ApiErrors` | Completo | Reutilizar |
| Clientes / vehículos / modelos / lookup por placa | Completo | Reutilizar. El teléfono ya vive en `Customer` y los avisos ya lo toman de `vehicle.customer` (no se reescribe). Faltan: buscar clientes **por placa** (hoy solo por nombre y teléfono), crear cliente con vehículos en un paso y avisar desde un cliente sin recordatorio. Ver §2.11 |
| Recordatorios / Avisar | Completo | Un aviso solo nace del recordatorio de un mantenimiento (`Reminder.sourceMaintenanceId` obligatorio); no se puede avisar partiendo de un cliente. Ver DEC-46 |
| Catálogo: `ProductCategory` plana, `Product` con `brand`/`unit` texto libre | Provisional (DEC-22) | **Modificar**: jerarquía, marcas y atributos seleccionables |
| Compatibilidades | Completo | Reutilizar. Filtros de aire ya confirmados (§0.4); faltan algunas compatibilidades |
| Inventario: libro de movimientos inmutable, saldo = suma | Correcto como libro | **Problemas:** (a) saldo recalculado sumando **todos** los movimientos del producto en cada consulta; `GET /products?includeStock=true` hace N+1 (un `findMany` por producto): con 300–400 productos y un dashboard vivo no escala; (b) conteo, ingreso y ajuste **no bloquean la fila** del producto (solo mantenimiento usa `FOR UPDATE`): dos conteos simultáneos calculan mal `previousBalance`; (c) ingreso es de **un producto por petición**; (d) ajuste guarda delta pero no saldo anterior/resultante ni usuario; (e) `InventoryMovement` no tiene `createdById` |
| Tipos `SALE`/`SALE_VOID` | En el enum, sin punto de entrada | Se usan ahora |
| Mantenimiento indivisible + recordatorio + anulación | Completo y bien probado | Reutilizar. **Modificar** para: cobro opcional (sin duplicar ingreso), vehículo opcional (decisión), extraer la lógica de stock a un servicio común |
| Política de stock insuficiente | `ALLOW_WITH_WARNING` provisional (BR-P12) | **Choca** con el pedido "no permitir stock negativo salvo decisión explícita". Ver DEC-26 |
| Recordatorios + WhatsApp `wa.me` | Completo | Reutilizar. Pendiente conocido: reabrir recordatorio descartado por anulación |
| Indicadores del piloto | Completo | Carga **todas** las filas y filtra en memoria. Mantener para `/resumen`; el dashboard nuevo usa agregaciones en SQL. BR-I1 (adopción) debería contar también ventas y lavados |
| Configuración del negocio | Completo | `currency` sigue nulo: los precios confirmados están en soles → proponer `PEN` |
| Rate limit | 20 req/min **por IP y por endpoint**, en memoria | Con catálogo navegable + dashboard con refresco es fácil llegar a 429. Revisar antes del piloto |
| Tests | Unitarios con `fake-scoped-prisma` (Map en memoria, `$transaction` sin aislamiento, `$queryRaw` no-op); e2e solo `/health` | El fake **no puede** probar bloqueos, SQL de agregación ni zonas horarias. CI ya levanta Postgres 16 → agregar tests de integración reales |
| Bug menor | `ListProductsQueryDto.includeStock` usa `@Type(() => Boolean)`: el string `"false"` se convierte en `true` | Corregir al tocar el DTO |

### 1.2 Estado actual del frontend (Next.js 16 App Router + Tailwind 4)

| Pieza | Estado | Observación |
|---|---|---|
| Cliente tipado `openapi-fetch` + `openapi-typescript` desde `openapi.json` | Completo | Reutilizar; regenerar tras cada cambio de contrato (`pnpm api:generate`) |
| Datos: hook propio `useApiQuery` | Sin caché compartida, sin invalidación | **No hay TanStack Query.** Sin caché compartida, "el dashboard se actualiza solo tras registrar" obliga a inventar un bus de eventos. Ver DEC-38 |
| `useIdempotencyKey`, `useFormDraft`, conectividad, sesión | Completo | Reutilizar |
| UI base: `Button`, `Input`, `Field`, `PageHeader`, estados loading/empty/error | Completo | Reutilizar |
| Navegación: Inicio · Avisar · Productos · Más | MVP | **Rehacer** según operaciones reales (§2.9) |
| Inicio: búsqueda por placa + 3 conteos del mes | MVP | **Rehacer** como centro de operaciones |
| Productos: lista plana + formulario con texto libre | MVP | **Rehacer** como catálogo visual con selección dependiente |
| Inventario: formulario de un producto (Contar/Ingreso/Ajuste) | MVP | **Rehacer**: recepción en lote, ajuste por cantidad física |
| Mantenimiento: formulario completo con `ProductPicker` | Funciona | **Reutilizar y extender** (cobro, selector visual de productos, prellenado de intervalo) |
| Avisar, Clientes, Vehículos, Configuración, Resumen | Funcionan | Reutilizar |
| Gráficos | No hay librería | Agregar una (ver §2.8) |
| Tests web | No hay | Agregar al menos tests de lógica pura (carrito, totales, períodos) |

### 1.3 Modelos existentes

`Business`, `User`, `RefreshToken`, `IdempotencyRecord`, `Customer`, `VehicleModel`, `Vehicle`, `ProductCategory`, `Product`, `ProductCompatibility`, `InventoryMovement`, `MaintenanceType`, `Maintenance`, `MaintenanceItem`, `Reminder`, `ReminderContact`. Enums: `DueRule`, `InsufficientStockPolicy`, `UserRole`, `InventoryMovementType`, `MaintenanceStatus`, `ReminderStatus`, `ReminderContactChannel`.

No existe ningún modelo de dinero: ni venta, ni pago, ni lavado.

### 1.4 Endpoints existentes (`/api/v1`)

auth (`login`, `refresh`, `logout`, `me`) · `GET /business`, `PATCH /business/settings` · customers CRUD (+ desactivar) · `vehicles` (`lookup`, CRUD, `compatible-products`, `maintenances`) · `vehicle-models` · `product-categories` (GET/POST) · `products` (CRUD, desactivar, `compatible-models`) · `compatibilities` (POST/DELETE) · `inventory` (`GET stock`, `GET movements`, `POST counts`, `POST receipts`, `POST adjustments`) · `maintenance-types` (GET/POST) · `maintenances` (POST, GET, PATCH, `POST :id/void`) · `reminders` (GET, GET :id, `POST :id/contacts`, PATCH) · `pilot-indicators` · `health` · `internal/idempotency-test`.

### 1.5 Qué reutilizamos, qué modificamos, qué agregamos

**Reutilizamos sin cambios:** auth, aislamiento, idempotencia, errores, clientes, modelos de vehículo, compatibilidades, recordatorios/WhatsApp, configuración, resumen del piloto (pantalla), componentes UI base, cliente tipado, sesión.

**Modificamos:**

- `ProductCategory` → jerarquía (categoría → tipo) con orden e ícono/imagen.
- `Product` → marca por referencia, atributos seleccionables (viscosidad, presentación, variante), imagen, **saldo en caché** (`stockQuantity`, `isCounted`).
- `InventoryMovement` → `createdById`, `resultingBalance`.
- `InventoryService` → se convierte en el **único punto** que escribe movimientos (`StockLedger`), con bloqueo de fila y actualización del saldo en caché en la misma transacción.
- `POST /inventory/receipts` → lote de productos (**cambio incompatible**).
- `POST /inventory/adjustments` → recibe cantidad física, devuelve anterior/diferencia/resultante (**cambio incompatible**).
- `MaintenancesService` → usa `StockLedger`; cobro opcional; vehículo opcional (si se aprueba DEC-31).
- `PilotIndicatorsService` → adopción cuenta ventas y lavados.
- Throttler → límites por usuario y más altos en lecturas.
- Web: navegación, Inicio, Productos, Inventario; capa de datos (DEC-38).

**Agregamos:** `Brand`, `CatalogOption`, `InventoryReceipt`, `Sale`, `SaleLine`, `WashType`, `WashPriceOption`; módulos `sales`, `washes`, `dashboard`, `catalog`; endpoints de §2.7; pantallas Venta, Lavado, Recepción, Ajuste, Dashboard vivo.

### 1.6 Impacto en base de datos

Una migración por bloque (catálogo · stock en caché · recepción/ajuste · ventas y lavados · mantenimiento), todas **aditivas** salvo `Product.brand` (texto → `brandId`, con traspaso de datos en la misma migración). `Product.stockQuantity` se rellena con la suma de movimientos existentes y un test verifica la invariante. **Las migraciones se aplican a Supabase (datos reales/demo): requiere tu autorización explícita al momento de aplicarlas.** La migración `20260922200000_idempotency_key_per_endpoint` ya está aplicada: no se toca.

### 1.7 Impacto en OpenAPI

Contrato nuevo para ventas, lavados, recepciones, dashboard y catálogo; dos cambios incompatibles (`receipts`, `adjustments`) que solo consume `apps/web` (no hay otros clientes). Todo endpoint nuevo con `@ApiErrors`, ejemplos y `Idempotency-Key` documentado. Se regenera `openapi.json` y el cliente web en cada corte.

### 1.8 Impacto en frontend

Nueva navegación, 5 pantallas nuevas (Venta, Lavado, Recepción, Ajuste, Dashboard), rehacer Productos e Inventario, extender Mantenimiento. Nueva dependencia de gráficos y (si se aprueba) TanStack Query.

### 1.9 Riesgos

1. **Datos faltantes** (precios, imágenes, combinaciones marca/presentación, capacidad de los baldes; §0.5): los productos y códigos se pueden cargar, pero sin precio la venta obliga a escribirlo en cada línea. El diseño permite completarlos rápido cuando lleguen, sin inventarlos.
2. **Stock negativo bloqueado** con un inventario que hoy es visual (C-16) puede frenar una venta o un cambio de aceite a mitad del trabajo si el saldo está mal. Ver DEC-26/27.
3. **Carga inicial de 300–400 productos + conteo inicial** (DEC-21). Sin ella el stock no significa nada.
4. **"Hoy" depende de la zona horaria** (`America/Lima`): agregaciones en SQL con `AT TIME ZONE`, con tests reales.
5. **Rate limit actual** puede dar 429 en uso normal del catálogo y del dashboard.
6. **Tests con fake** no cubren concurrencia ni SQL: sin tests de integración contra Postgres el riesgo de descuadre de stock queda sin probar.
7. **Cambios incompatibles** en `receipts`/`adjustments`: se despliegan API y web juntos.
8. **Doble ingreso** si el cobro del mantenimiento y los productos del mantenimiento se registran por caminos separados (resuelto en §2.2).
9. **Datos de QA en demo** (`STATUS.md`) ensucian el dashboard de demo, no el de Brigith (BR-G7).
10. **Clientes duplicados** al permitir "+ Agregar cliente" desde Avisar: se mitiga ofreciendo reutilizar el cliente cuando el teléfono ya existe (DEC-47).
11. **Baldes sin capacidad conocida:** hasta tener los litros por balde, vender "balde completo" no puede descontar el stock en litros (§2.3).

### 1.10 Decisiones pendientes

Ver §3 (lista completa con recomendación).

---

## FASE 2 — DISEÑO

### 2.1 Principios del modelo

1. **Un solo libro de dinero:** todo ingreso (venta de mostrador, lavado, cobro de mantenimiento) es una `Sale`. El dashboard suma una sola tabla. Nunca hay un ingreso fuera de `Sale`.
2. **Un solo libro de stock:** todo cambio de stock es un `InventoryMovement` (como hoy). **Una línea de venta no mueve stock por sí misma**: el stock lo mueve la operación que consumió el producto (venta de mostrador → `SALE`; mantenimiento → `MAINTENANCE_USE`). Así nunca se descuenta ni se cobra dos veces.
3. **Un solo escritor de stock:** `StockLedger.apply(tx, movimientos)` bloquea las filas de producto (`FOR UPDATE`), evalúa la política, inserta movimientos y actualiza `Product.stockQuantity` en la misma transacción. Venta, recepción, ajuste, conteo, mantenimiento y anulaciones lo usan todos.
4. **Seleccionar, no escribir:** todo valor conocido (categoría, tipo, marca, viscosidad, presentación, variante, tipo de lavado, precio de lavado, método de pago) viene de una tabla y se elige con chips/tarjetas.
5. **Nada obligatorio que el negocio no pida:** venta y lavado sin cliente ni placa.

### 2.2 Representación económica del mantenimiento

**Dato del dueño [CONFIRMADO] (§0.2):** el cambio de aceite se cobra con **un único monto total** (producto + mano de obra), sin separarlo ante el cliente, y los productos usados sí se registran para el stock.

**Problema:** un cambio de aceite consume productos (stock) y genera un cobro (dinero). Si los productos se registran como venta **y** como mantenimiento, el stock baja dos veces. Si el cobro se registra como venta aparte, sin enlace, el dashboard no sabe que viene del mantenimiento.

**Alternativas evaluadas:**

| | Opción | Problema |
|---|---|---|
| A | Campo `amountCharged` en `Maintenance` | Segundo libro de dinero: el dashboard suma dos tablas y la anulación y la corrección se duplican |
| B | El mantenimiento crea una venta de mostrador con los productos | Los productos moverían stock dos veces, o habría que quitar el stock del mantenimiento, lo que rompe BR-M10 y todo lo ya probado |
| **C (propuesta)** | El mantenimiento sigue siendo el dueño del **stock**; su cobro es una `Sale` con `source = MAINTENANCE` enlazada 1:1, con **una sola línea `SERVICE` por el total** | Ninguno de los anteriores |

**Propuesta C** [DECISIÓN] (estructura) sobre [CONFIRMADO] (monto único):

- `Maintenance` y `MaintenanceItem` quedan igual: los productos usados generan `MAINTENANCE_USE` (stock), el recordatorio y la anulación funcionan como hoy. **Los ítems no llevan precio.**
- `POST /maintenances` acepta un bloque opcional `charge: { paymentMethod, totalAmount }`. Si viene, **en la misma transacción** se crea una `Sale { source: MAINTENANCE, maintenanceId }` con **una sola línea** `SERVICE` por `totalAmount` (descripción: nombre del tipo de mantenimiento, p. ej. "Cambio de aceite"). Esa línea no mueve stock.
- El cobro también se puede registrar **después** (`POST /maintenances/:id/charge`). Un mantenimiento **sin cobro** es válido (garantía, cliente que paga luego): no se obliga. El dashboard muestra "mantenimientos sin cobro" como recordatorio, no como error.
- **Anular el mantenimiento** anula su venta en la misma transacción. **Anular solo la venta** corrige el cobro sin tocar el stock (el stock pertenece al mantenimiento) y permite volver a cobrar.
- **Dashboard:** el ingreso de mantenimiento se muestra como **un solo monto** ("Mantenimiento"). No se reparte entre producto y mano de obra, porque el negocio no lo separa. Las unidades de aceite y filtros que se usan en mantenimientos sí aparecen en "productos más usados/vendidos", pero desde el stock, no desde el dinero.

### 2.3 Modelo de datos propuesto

Solo se muestran modelos nuevos y campos nuevos. `businessId` + `@@index` en todo modelo de negocio; todos entran a `BUSINESS_SCOPED_MODELS`.

```prisma
// ---------- Catálogo ----------
model ProductCategory {            // MODIFICADO
  // ...campos actuales
  parentId   String?               // null = categoría; con padre = tipo/subcategoría
  parent     ProductCategory?  @relation("CategoryTree", fields: [parentId], references: [id])
  children   ProductCategory[] @relation("CategoryTree")
  sortOrder  Int      @default(0)
  imageKey   String?               // ícono/imagen de la tarjeta
  /// Qué atributos se OFRECEN para productos de este tipo, en orden (todos
  /// opcionales: guían la selección, nunca bloquean guardar):
  /// p. ej. [BRAND, VISCOSITY, PRESENTATION]. Guía la selección dependiente.
  attributeKinds CatalogAttributeKind[]
  isActive   Boolean  @default(true)
  // @@unique([businessId, parentId, name]) (reemplaza a [businessId, name])
}

enum CatalogAttributeKind { BRAND VISCOSITY PRESENTATION VARIANT }

model Brand {                      // NUEVO
  id, businessId, name, imageKey String?, isActive, sortOrder
  @@unique([businessId, name])
}

/// Valores seleccionables por tipo de producto (viscosidades, presentaciones,
/// variantes como "rojo 33 %"). Solo se siembran los confirmados.
model CatalogOption {              // NUEVO
  id, businessId
  categoryId String               // el tipo al que aplica
  kind       CatalogAttributeKind // VISCOSITY | PRESENTATION | VARIANT
  value      String               // "10W40", "1.5 L", "Balde", "Rojo 33 %"
  sortOrder  Int @default(0)
  isActive   Boolean @default(true)
  @@unique([businessId, categoryId, kind, value])
}

model Product {                    // MODIFICADO
  // ...id, businessId, categoryId (ahora apunta al TIPO), code, name, unit, salePrice, tracksStock, isActive
  brandId       String?            // reemplaza brand: String? (migración con traspaso)
  viscosity     String?            // valor de CatalogOption VISCOSITY del tipo
  presentation  String?            // valor de CatalogOption PRESENTATION
  variant       String?            // valor de CatalogOption VARIANT
  imageKey      String?
  /// Saldo en caché. Fuente de verdad: suma de movimientos (test de invariante).
  stockQuantity Decimal  @default(0) @db.Decimal(12, 3)
  isCounted     Boolean  @default(false)
  // Sin stock mínimo: el dueño no tiene esa regla (§0.1) y el mapa no la pide.
  saleUnits     ProductSaleUnit[]
}

/// Formas de vender un mismo producto de stock. Aceite de balde: por litro o
/// balde completo ([CONFIRMADO] §0.4). El stock se lleva en `Product.unit`
/// (para el balde: litros) y cada forma de venta descuenta `factor` unidades.
/// Los productos normales no tienen filas aquí: se venden en su propia unidad (factor 1).
model ProductSaleUnit {            // NUEVO
  id, businessId, productId
  label      String                // "Litro", "Balde completo"
  factor     Decimal @db.Decimal(12, 3)   // unidades de stock por unidad vendida. "Balde completo" se agrega solo cuando se conozca su capacidad en L [PENDIENTE]; mientras tanto el producto se vende en su propia unidad
  salePrice  Decimal? @db.Decimal(10, 2)  // precio de esta forma de venta [PENDIENTE]
  sortOrder, isActive
  @@unique([businessId, productId, label])
  @@index([businessId, categoryId, isActive])
}
```

`name` se **propone** automáticamente desde la selección ("Repsol 10W40 1.5 L") y se puede editar; `code` sigue siendo opcional y único (filtros).

```prisma
// ---------- Inventario ----------
model InventoryMovement {          // MODIFICADO
  // ...actuales
  createdById      String?         // nulo en filas históricas
  resultingBalance Decimal? @db.Decimal(12, 3)  // en COUNT y ADJUSTMENT
  // refType: 'Maintenance' | 'Sale' | 'InventoryReceipt'
}

model InventoryReceipt {           // NUEVO: cabecera de una recepción
  id, businessId, occurredAt DateTime, note String?, createdById, createdAt
  // Sin proveedor ni costo: no se pidió y no hay datos (P-16). Ver DEC-36.
  // Líneas = InventoryMovement PURCHASE_IN con refType='InventoryReceipt', refId=id
}

// ---------- Dinero ----------
enum PaymentMethod { CASH YAPE }            // otros: P-09
enum SaleSource    { COUNTER WASH MAINTENANCE }
enum SaleStatus    { ACTIVE VOIDED }
enum SaleLineKind  { PRODUCT WASH SERVICE }

model Sale {                       // NUEVO
  id, businessId
  source        SaleSource
  status        SaleStatus @default(ACTIVE)
  paymentMethod PaymentMethod
  total         Decimal @db.Decimal(10, 2)   // = suma de subtotales (validado en servidor)
  occurredAt    DateTime @default(now())
  vehicleId     String?     // solo en el cobro de un mantenimiento (copiado del mantenimiento)
  customerId    String?     // opcional
  maintenanceId String?  @unique  // 1:1 con el mantenimiento cobrado (activo)
  note          String?
  createdById   String
  voidedAt DateTime?, voidedById String?, voidReason String?
  createdAt, updatedAt
  @@index([businessId, occurredAt])
  @@index([businessId, status, occurredAt])
}

model SaleLine {                   // NUEVO (con businessId: el dashboard agrega por línea)
  id, businessId, saleId
  kind              SaleLineKind
  productId         String?   // PRODUCT
  washTypeId        String?   // WASH
  saleUnitId        String?   // forma de venta usada (litro/balde); nulo = unidad del producto
  saleUnitLabelSnapshot String?
  descriptionSnapshot String  // "Repsol 10W40 1.5 L", "Lavado Auto", "Cambio de aceite" (BR-G6)
  codeSnapshot      String?
  quantity          Decimal @db.Decimal(12, 3)   // en la forma de venta; stock descontado = quantity × factor
  unitPrice         Decimal @db.Decimal(10, 2)  // precio aplicado
  subtotal          Decimal @db.Decimal(10, 2)
  movesStock        Boolean   // true solo en PRODUCT de mostrador; nunca en SERVICE
  @@index([businessId, saleId])
  @@index([businessId, productId])
}

// ---------- Lavado ----------
model WashType {                   // NUEVO
  id, businessId, name ("Moto lineal", "Tico", ...), imageKey?, sortOrder, isActive
  prices WashPriceOption[]
  @@unique([businessId, name])
}
model WashPriceOption {            // NUEVO
  id, businessId, washTypeId
  amount Decimal @db.Decimal(10, 2)
  label  String?                   // nulo: el dueño elige el monto al ver el vehículo, sin criterio escrito (§0.3)
  sortOrder, isActive
}
// Un lavado registrado = Sale { source: WASH } con una línea WASH. Sin cola, sin estados,
// sin cliente ni placa.

// ---------- Mantenimiento ----------
model Maintenance {                // MODIFICADO (solo si se aprueba DEC-31)
  vehicleId String?                // sin vehículo => no admite próximo km/fecha
}

// ---------- Clientes y avisos (§2.11) ----------
// Customer no cambia de estructura: el teléfono ya pertenece al cliente y un
// cliente ya puede tener varios vehículos (BR-C7). Solo se agrega un índice
// para buscar por nombre; ya existe [businessId, phone] para detectar
// teléfonos repetidos (DEC-47).
model Customer {                   // MODIFICADO (solo índice)
  @@index([businessId, name])
}

model ReminderContact {            // MODIFICADO (DEC-46: aviso manual)
  reminderId String?               // nulo = aviso manual, sin recordatorio
  businessId String?               // obligatorio cuando reminderId es nulo (aislamiento)
  customerId String?               // a quién se avisó
  vehicleId  String?               // sobre qué vehículo, si aplica
  // CHECK en la migración: reminderId IS NOT NULL OR (businessId IS NOT NULL AND customerId IS NOT NULL)
}
```

**Siembra para Brigith (solo datos confirmados, §0):** marcas Repsol, Vistony, Valvoline · tipos de lavado y precios de §0.3 · tipos de producto con sus opciones confirmadas (viscosidades auto/moto/transmisión; presentaciones 1.5 L, litro, balde, 200 ml, 1 L, 8 oz, 300 ml, 120 ml, 85 g; refrigerante simple/rojo/verde y 17/33/50 % como opciones sueltas, no combinadas) · **filtros de aire y de aceite con sus códigos** (§0.4), como productos sin precio ni marca, y las compatibilidades confirmadas de filtros de aire con el texto del dueño como modelo. **No se siembran aceites ni fluidos como productos**: no se sabe qué combinaciones de marca y presentación existen ni sus precios (§0.5). Se cargan desde la app con "crear variantes". La agrupación de tipos en categorías de primer nivel (p. ej. "Aceites", "Filtros", "Fluidos", "Siliconas") es **propuesta de organización**, a validar con el dueño (DEC-37).

### 2.4 Estructura del catálogo (selección dependiente)

```
Categoría (tarjeta con imagen)          Aceites · Filtros · Fluidos · Siliconas · Otros   ← DEC-37
 └─ Tipo (chips)                        Auto · Moto · Transmisión · 2T · Hidrolina
     └─ Marca (chips con logo)          Repsol · Vistony · Valvoline         (según attributeKinds)
         └─ Viscosidad (chips)          5W30 · 10W30 · 10W40 · 20W50 · 25W60
             └─ Presentación (chips)    Litro · 1.5 L · Balde · [PENDIENTE: estándar auto]
                 └─ Producto (tarjeta: imagen, nombre, precio, stock)

Filtros (tarjeta)
 └─ Tipo (chips)                        Aire · Aceite
     └─ Código (lista/búsqueda)         21050 · 1030 · 2000 · … / 3007 · 3001 · 1616 · …
         └─ Tarjeta: código grande + vehículos compatibles confirmados ("Yaris", "Probox")
```

- **Filtros:** el código es el identificador principal ([CONFIRMADO] C-05, §0.4). Se buscan por código o por vehículo compatible ("yaris" → 21050, BZ200). Los que no tienen compatibilidad confirmada se muestran igual, sin vehículo.
- **Aceite de balde:** una sola tarjeta de producto; al tocarla se elige **Litro** o **Balde completo** (`ProductSaleUnit`). El stock se ve en litros.

- Cada nivel filtra al siguiente y solo muestra valores **que tienen productos** (en venta) o **todas las opciones del tipo** (al crear producto).
- Búsqueda global siempre visible (nombre, marca, código, viscosidad): "3007", "10w40", "repsol".
- Imágenes: `imageKey` en categoría, tipo, marca, producto y tipo de lavado; sin imagen → ícono por categoría + iniciales. Almacenamiento: DEC-34. No se descargan imágenes de internet.
- Crear producto = elegir el tipo + los chips que se conozcan. Solo tipo, nombre (propuesto desde la selección) y unidad son necesarios; marca, viscosidad, presentación, código, precio, imagen y compatibilidades son **opcionales** y se completan después. Para cargar 300–400 productos rápido: **"crear variantes"** (elegir marca + varias viscosidades + presentación → crea N productos de una vez) y **"duplicar"**.

### 2.5 Flujos

**Venta de productos** (mostrador, sin cliente ni placa)
Flujo del mapa: Inicio → Vender → categorías → productos → carrito → pago → confirmar.
1. Inicio → **Vender**. 2. Elegir categoría y tocar productos (o buscarlos); cada toque suma 1, con −/+ en la barra del carrito. Si el producto tiene formas de venta (aceite de balde), se elige **Litro** o **Balde completo** y la cantidad (admite decimales en litros). 3. Barra fija: "3 productos · S/ 120.00 → Cobrar". 4. Pantalla de cobro: líneas con precio aplicado (editable si DEC-29 lo permite; si el producto aún no tiene precio en el catálogo, el dueño escribe el monto que cobra en esa venta, sin tener que completar el catálogo), total, dos botones grandes **Efectivo** / **Yape** para elegir el pago y **Confirmar**. 5. `POST /sales` (idempotente) → `SALE` por línea con `movesStock` → saldo en caché baja → invalidación → dashboard actualizado. 6. Confirmación con **Deshacer** (anula) durante unos segundos.
- Stock insuficiente: según DEC-26/27; el servidor responde 422 con producto, saldo y cantidad; la UI permite corregir la cantidad o (si la política lo permite) confirmar.

**Recepción de mercadería** (lote)
1. Inventario → **Recibir**. 2. Elegir productos (catálogo/búsqueda, con filtro rápido "Aceites auto/moto" por ser la reposición semanal). 3. Cantidad con −/+ o teclado. 4. **Guardar recepción** → `POST /inventory/receipts` con todas las líneas → una cabecera + N `PURCHASE_IN` en una transacción. 5. Historial de recepciones con detalle.

**Ajuste de inventario** (solo si sistema ≠ físico)
1. Producto → **Ajustar**. 2. Muestra "El sistema dice: 12". 3. El dueño ingresa **lo que hay en el estante** (no la diferencia). 4. Motivo por chips (DEC-39) + texto opcional. 5. `POST /inventory/adjustments` → guarda anterior, diferencia, resultante, motivo, usuario, fecha. Nunca cuenta como venta.
- Conteo inicial (`COUNT`) se mantiene separado, sin motivo, para la carga inicial (DEC-21).

**Mantenimiento** (reutiliza el formulario actual)
1. Buscar por placa/vehículo (lookup existente) **o por cliente** → elegir uno de sus vehículos; **sin vehículo** solo si se aprueba DEC-31. 2. Tipo. 3. Productos usados con el selector visual del catálogo (compatibles primero); descuentan stock y **no** generan ingreso. 4. Km actual opcional. 5. Próximo: chips **Por fecha / Por km / Ambos / Ninguno**, solo cuando corresponda a ese vehículo; nada se prellena ni es obligatorio (BR-M3). 6. **Cobro** opcional: un solo campo **Total cobrado** + Efectivo/Yape ([CONFIRMADO] monto único, §0.2; sin desglose). 7. Guardar → mantenimiento + stock + recordatorio + venta, en una transacción. 8. Si el vehículo tiene cliente con teléfono, la confirmación ofrece **Avisar por WhatsApp** más adelante desde el recordatorio; si no tiene cliente, ofrece **Asignar cliente** (buscar o "+ Agregar cliente", §2.11).

**Lavado** (flujo del mapa: Lavado → tipo → precio → pago → confirmar; sin cola, sin estados)
1. Inicio → **Lavado**. 2. Tarjetas grandes: Moto lineal · Tico · Auto · Camioneta · Mototaxi · Furgón. 3. Si el tipo tiene 2 precios (moto lineal S/8 · S/10; camioneta S/30 · S/40), el dueño toca uno según lo que ve; si tiene uno, se salta ([CONFIRMADO] §0.3). No se pide el motivo del precio. 4. **Efectivo** / **Yape**. 5. **Confirmar** → guardado. No se pide cliente ni placa, ni como campo opcional (DEC-44). Lista "Lavados de hoy" debajo con Deshacer.

**Clientes y Avisar por WhatsApp:** ver §2.11.

**Dashboard / Inicio**
- Selector **Hoy · Semana · Mes** (zona horaria del negocio).
- Acciones grandes arriba: Vender · Lavado · Mantenimiento · Recibir.
- Búsqueda rápida por **cliente, vehículo o placa** (reutiliza `GET /vehicles/lookup` y `GET /customers?search=`, que busca por nombre, teléfono o placa).
- Cifras: ingresos totales · efectivo · Yape · productos vendidos (unidades) · lavados (cantidad y monto) · mantenimiento (un solo monto, §2.2) · mantenimientos sin cobro.
- Gráficos (cada uno responde una pregunta):
  | Gráfico | Pregunta que responde |
  |---|---|
  | Barra apilada/donut Efectivo vs Yape | ¿Cuánto efectivo debería haber en caja y cuánto en Yape? |
  | Barras por hora (Hoy) / por día (Semana, Mes), apiladas por Productos / Lavado / Mantenimiento | ¿Cuándo entra el dinero y de qué? |
  | Barras horizontales: productos más vendidos del período (unidades) | ¿Qué se agota más? (el dueño hoy no lo sabe; esto lo mide con datos reales, sin inventar una regla) |
- **Stock que requiere atención** como lista (no gráfico): agotados (≤ 0), negativos (descuadre) y cuántos productos siguen sin conteo inicial. Sin stock mínimo (el dueño no tiene esa regla, §0.1).
- Recordatorios pendientes (contador → Avisar).

### 2.6 Reglas de negocio que cambian o se agregan (propuesta)

| ID | Regla | Estado propuesto |
|---|---|---|
| BR-V1…V4 | Venta: pasa de Fase 2 a implementación; métodos Efectivo/Yape; `SALE` por línea de mostrador | [DECISIÓN] al aprobar |
| BR-V5 | Todo ingreso es una `Sale`; una línea de venta no mueve stock, lo mueve la operación que consumió el producto | [TÉCNICO] |
| BR-V6 | Una venta tiene un solo método de pago | [TÉCNICO] provisional · pago mixto [PENDIENTE] DEC-30 |
| BR-V7 | Anular una venta exige motivo, genera `SALE_VOID` de sus líneas con stock y la saca de los totales | [TÉCNICO] |
| BR-V8 | El precio aplicado se guarda en la línea; cambiar el precio del catálogo no altera ventas pasadas | [TÉCNICO] (BR-G6) |
| BR-L2 | Lavado: tipo → precio (de sus opciones) → pago → confirmar; sin cliente ni placa | [DECISIÓN] mapa funcional · DEC-44 |
| BR-L3/L4 | Cierre del día con conteos manuales | **Fuera** (el mapa no lo incluye): cada lavado se registra al cobrarlo y el dashboard "Hoy" hace de resumen. Resuelve DEC-15 |
| BR-M15 | Un mantenimiento puede tener un cobro (`Sale` MAINTENANCE 1:1) con **un único monto total** (producto + mano de obra); sin cobro es válido. Los productos usados se registran solo para el stock | [CONFIRMADO] monto único (§0.2) · [TÉCNICO] estructura |
| BR-V3 | Cómo se cobra un cambio de aceite | [CONFIRMADO] monto único (§0.2). Otros métodos de pago y crédito siguen [PENDIENTE] P-09 |
| BR-P15 | Presentaciones y granel: un producto se cuenta en una unidad de stock y puede tener formas de venta con factor (aceite de balde: litro o balde completo) | [CONFIRMADO] aceite de balde (§0.4) · capacidad del balde [PENDIENTE] |
| BR-L6 | Tipos y precios de lavado: los de §0.3. Con dos montos, el dueño elige; el sistema no aplica criterio | [CONFIRMADO] |
| BR-F5 | Códigos de filtros y compatibilidades de §0.4 son datos reales | [CONFIRMADO] · compatibilidades faltantes [PENDIENTE] |
| BR-C11 | Un cliente se registra una vez; su teléfono se reutiliza en todos los avisos de todos sus vehículos | [DECISIÓN] DEC-41 |
| BR-C12 | Búsqueda de clientes por nombre, teléfono o placa | [DECISIÓN] DEC-42 |
| BR-C3 | Cliente: el **nombre** es el dato principal; el **teléfono es opcional** al registrar o guardar. Solo se pide al enviar un WhatsApp. No se agregan otros datos obligatorios; los vehículos se asocian cuando corresponda | [DECISIÓN] DEC-45 (coherente con BR-C3 y D-08) |
| BR-W8 | Avisar desde un cliente: elegir cliente → vehículo (si aplica) → mensaje prellenado → `wa.me`; se registra el aviso. Se permite aviso manual sin recordatorio, siempre que haya teléfono | [DECISIÓN] DEC-43, DEC-46 |
| BR-P7b | Ajuste = el dueño ingresa la cantidad física; el sistema guarda anterior, diferencia y resultante | [TÉCNICO] |
| BR-P11/P12 | Política de stock negativo | [DECISIÓN PENDIENTE] DEC-26/27 |
| BR-P19 | Stock que requiere atención = agotados, negativos y sin conteo inicial. No hay stock mínimo por producto | [DECISIÓN] mapa funcional · resuelve DEC-28 |
| BR-P20 | Opciones de catálogo (viscosidad, presentación, variante) solo desde valores confirmados; el dueño agrega nuevas desde la app | [TÉCNICO] |
| BR-I1 | Adopción cuenta mantenimientos, ventas y lavados activos | [TÉCNICO] |

### 2.7 Endpoints

Todas las escrituras de dinero o stock exigen `Idempotency-Key` y aceptan `id` UUID opcional generado por el cliente (DEC-12). Todo bajo `JwtAuthGuard`, `businessId` del token.

**Nuevos**

| Método | Ruta | Cuerpo / query → respuesta |
|---|---|---|
| GET | `/catalog/tree` | Categorías → tipos (con `attributeKinds`, opciones activas, conteo de productos), marcas. Una sola llamada para armar la UI |
| GET/POST/PATCH | `/brands`, `/brands/:id` | `{ name, imageKey? }` |
| GET/POST/PATCH | `/catalog-options`, `/catalog-options/:id` | `{ categoryId, kind, value, sortOrder? }` |
| PATCH | `/product-categories/:id` | `{ name?, parentId?, sortOrder?, attributeKinds?, imageKey?, isActive? }` |
| POST | `/products/:id/reactivate` | — (hallazgo pendiente de STATUS) |
| POST | `/products/variants` | `{ categoryId, brandId?, viscosities[], presentation?, unit, salePrice? }` → productos creados (idempotente) |
| PUT/DELETE | `/products/:id/image` | Depende de DEC-34 |
| GET | `/inventory/receipts`, `/inventory/receipts/:id` | Historial con líneas |
| GET | `/inventory/alerts` | `{ outOfStock[], negative[], notCountedCount }` |
| POST | `/sales` | `{ id?, paymentMethod, occurredAt?, note?, lines: [{ productId, saleUnitId?, quantity, unitPrice }] }` → `SaleResponse` + `warnings` |
| GET | `/sales` | `?from&to&source&paymentMethod&status&cursor&limit` |
| GET | `/sales/:id` | Con líneas |
| POST | `/sales/:id/void` | `{ reason }` |
| GET | `/wash-types` | Con precios activos |
| POST/PATCH | `/wash-types`, `/wash-types/:id`, `/wash-types/:id/prices` | Configuración (Configuración → Lavados) |
| POST | `/washes` | `{ id?, washTypeId, priceOptionId, paymentMethod, occurredAt? }` → `SaleResponse` |
| POST | `/maintenances/:id/charge` | `{ paymentMethod, totalAmount }` → `SaleResponse` (una línea SERVICE) |
| PUT | `/products/:id/sale-units` | `[{ label, factor, salePrice? }]` (formas de venta: litro/balde) |
| POST | `/customers/with-vehicles` | `{ name, phone?, vehicles?: [{ plate, vehicleModelId? }] }` → cliente + vehículos en una transacción (alta desde Avisar) |
| GET | `/customers/:id/reminders` | Recordatorios abiertos de todos sus vehículos, para elegir sobre cuál avisar |
| POST | `/customers/:id/contacts` | Aviso manual sin recordatorio (DEC-46): `{ vehicleId? }` → `{ waLink, message }` y guarda el historial. Si el cliente no tiene teléfono responde `CUSTOMER_PHONE_REQUIRED` (el teléfono se guarda antes con `PATCH /customers/:id`) |
| GET | `/customers/:id/contacts` | Historial de avisos del cliente (con y sin recordatorio), para la trazabilidad de §2.12 |
| GET | `/dashboard` | `?period=today\|week\|month&date=YYYY-MM-DD` → ver 2.8 |

**Modificados**

| Ruta | Cambio |
|---|---|
| `GET /products` | Filtros `brandId`, `viscosity`, `presentation`, `variant`, `isActive`; `includeStock` lee la caché (sin N+1); corregir parseo booleano |
| `POST/PATCH /products` | `brandId`, `viscosity`, `presentation`, `variant`, `imageKey` (todos opcionales); validación de que los valores pertenecen a las opciones del tipo |
| `GET/POST /product-categories` | `parentId`, `sortOrder`, `attributeKinds` |
| `POST /inventory/receipts` | **Incompatible:** `{ id?, occurredAt?, note?, lines: [{ productId, quantity }] }` (1–100 líneas, sin productos repetidos) → `InventoryReceiptResponse` |
| `POST /inventory/adjustments` | **Incompatible:** `{ productId, physicalQuantity, reason }` → `{ previousBalance, quantityDelta, resultingBalance, reason, createdById, occurredAt }` |
| `POST /inventory/counts` | Usa `StockLedger` (bloqueo + caché); agrega `createdById` |
| `GET /inventory/stock` | Lee la caché |
| `POST /maintenances` | `charge?: { paymentMethod, totalAmount }` (monto único, §2.2); ítems sin precio; `vehicleId` opcional (DEC-31) → respuesta incluye `sale` |
| `GET /customers` | `search` también busca por placa de sus vehículos (normalizada, BR-C6); la respuesta incluye las placas de cada cliente |
| `POST /customers` | Si el teléfono ya existe en otro cliente activo, responde con aviso `PHONE_ALREADY_REGISTERED` y el cliente existente (sin bloquear, DEC-47) |
| `POST /maintenances/:id/void` | Anula también la venta enlazada |
| `GET /pilot-indicators` | Adopción incluye ventas y lavados |

**Contratos DTO principales**

```ts
// POST /sales
CreateSaleDto { id?: uuid; paymentMethod: 'CASH'|'YAPE'; occurredAt?: ISO8601; note?: string(≤500);
  lines: CreateSaleLineDto[] (1..50, productId único) }
CreateSaleLineDto { productId: uuid; saleUnitId?: uuid; quantity: number > 0; unitPrice: number ≥ 0 (2 decimales) }

// POST /maintenances (bloque nuevo) y POST /maintenances/:id/charge
MaintenanceChargeDto { paymentMethod: 'CASH'|'YAPE'; totalAmount: number > 0 (2 decimales) }

SaleResponse { id; source; status; paymentMethod; total: string; occurredAt; vehicleId|null;
  maintenanceId|null; lines: SaleLineResponse[]; voidedAt|null; voidReason|null }
SaleLineResponse { id; kind; productId|null; washTypeId|null; saleUnitId|null; saleUnitLabelSnapshot|null;
  descriptionSnapshot; codeSnapshot|null; quantity: string; unitPrice: string; subtotal: string; movesStock }
CreateSaleResult = SaleResponse & { warnings: StockWarning[] }   // mismo formato que mantenimiento

// POST /washes
CreateWashDto { id?: uuid; washTypeId: uuid; priceOptionId: uuid; paymentMethod; occurredAt?: ISO8601 }

// GET /dashboard
DashboardResponse {
  period: { kind: 'today'|'week'|'month'; from; to; timezone };
  totals: { total; cash; yape; salesCount;
            bySource: { counter; wash; maintenance };           // montos
            byLineKind: { product; wash; service } };           // montos; service = cobros de mantenimiento (monto único)
  productsSold: { units; lines };
  washes: { count; amount; byType: [{ washTypeId; name; count; amount }] };
  maintenances: { count; charged; uncharged };
  series: [{ bucket: ISO8601; counter; wash; maintenance; cash; yape }];   // hora (today) o día
  topProducts: [{ productId; name; units; amount }];                       // máx. 10
  stock: { outOfStock; negative; notCounted; items: StockAlertItem[] (máx. 10) };
  reminders: { dueNow };
}
```

Montos como `string` decimal (igual que hoy `Decimal` serializado), nunca `float`.

Errores nuevos: `INSUFFICIENT_STOCK` (422, ya existe), `SALE_NOT_FOUND`, `SALE_ALREADY_VOIDED`, `SALE_TOTAL_MISMATCH`, `WASH_PRICE_NOT_IN_TYPE`, `SALE_UNIT_NOT_IN_PRODUCT`, `PHONE_ALREADY_REGISTERED` (aviso, no error), `CATALOG_OPTION_NOT_ALLOWED`, `MAINTENANCE_ALREADY_CHARGED`, `DUPLICATE_PRODUCT_LINE`.

### 2.8 Estrategia de actualización del dashboard

- **Una sola consulta** `GET /dashboard`, agregada en SQL (`SUM`/`COUNT` con `date_trunc(... AT TIME ZONE business.timezone)`), filtrando `businessId` explícito y `status = ACTIVE`. Índices `[businessId, occurredAt]`. Con ~15 lavados + ventas al día, el volumen es mínimo.
- **Tras cada escritura** (venta, lavado, mantenimiento, recepción, ajuste, anulación): el cliente invalida `dashboard`, `products`, `inventory` y `sales` → la pantalla se recalcula sola.
- **Refresco de respaldo** (por si hay un segundo dispositivo): al volver a la pestaña/app y cada 60 s mientras Inicio esté visible.
- **Sin WebSocket/SSE** por ahora: un solo usuario (H-04). Se reabre si aparecen empleados (P-12).
- **Implementación cliente:** DEC-38 (recomendado: TanStack Query, que da caché, `invalidateQueries`, `refetchOnWindowFocus` y `refetchInterval` sin código propio).
- **Gráficos:** librería liviana (propuesta: Recharts, o SVG propio si pesa demasiado en la PWA); se decide en la Fase 4 aplicando la guía de visualización.

### 2.9 Navegación propuesta (mobile-first)

Barra inferior de 5:

| Inicio | Inventario | **＋ Registrar** (central, grande) | Avisar (contador) | Más |
|---|---|---|---|---|

- **＋ Registrar** abre una hoja con 4 botones grandes: **Venta · Lavado · Mantenimiento · Recibir mercadería**.
- **Inicio** = centro de operaciones (2.5) con las mismas 4 acciones arriba.
- **Inventario** = catálogo visual + stock + ajuste + recepciones + alertas (reemplaza "Productos").
- **Avisar** = recordatorios pendientes (como hoy) + botón **Avisar a un cliente** (buscar por nombre, teléfono o placa, o "+ Agregar cliente"), §2.11.
- **Más** = Clientes y vehículos · Ventas (historial y anulación) · Lavados · Mantenimientos · Resumen del piloto · Configuración (negocio, tipos de lavado y precios, catálogo).

### 2.10 Plan de implementación y tests (Fases 3–5)

**Fase 3 — Backend, por cortes, cada uno con migración + tests + OpenAPI + docs:**

| Corte | Contenido | Tests clave |
|---|---|---|
| R1 | `StockLedger` + `Product.stockQuantity/isCounted` + `createdById` en movimientos + bloqueo en conteo/ingreso/ajuste | Invariante caché = suma de movimientos; bloqueo concurrente (integración Postgres); política de stock |
| R2 | Catálogo: jerarquía, `Brand`, `CatalogOption`, atributos de producto, `catalog/tree`, variantes, reactivar, siembra confirmada | Validación de opciones por tipo; unicidad; aislamiento entre negocios; traspaso `brand`→`brandId` |
| R3 | Recepción en lote + ajuste por cantidad física + alertas | Lote atómico (una línea inválida → nada); idempotencia; anterior/diferencia/resultante |
| R4 | Ventas (`Sale`, `SaleLine`) + anulación | Total calculado en servidor; stock baja una vez; anulación revierte; idempotencia; 422 por stock |
| R5 | Lavados (`WashType`, `WashPriceOption`, `POST /washes`) | Precio debe pertenecer al tipo; se registra sin cliente ni placa |
| R6 | Cobro de mantenimiento + anulación conjunta + (DEC-31) | Sin doble descuento ni doble ingreso; anular mantenimiento anula venta; anular venta no toca stock |
| R7 | Dashboard + indicadores del piloto + throttler | Agregación por zona horaria (integración: venta 23:30 Lima cae en el día correcto); excluye anuladas; aislamiento en SQL crudo |
| R8 | Clientes + Avisar (independiente del dinero; puede adelantarse): búsqueda por placa, alta de cliente con vehículos, avisar desde un cliente (DEC-41–47) | Búsqueda por placa normalizada; no duplica cliente con el mismo teléfono (aviso); mensaje generado con cliente/placa/próximo km-fecha del vehículo elegido; aislamiento entre negocios |

Se agrega una suite `test/integration` contra el Postgres de CI (ya existe en `ci.yml`) para lo que el fake no puede probar: bloqueos, SQL crudo, zonas horarias, índice único parcial.

**Fase 4 — Frontend:** capa de datos (DEC-38) → navegación → catálogo visual → venta → lavado → recepción/ajuste → mantenimiento con cobro → clientes y Avisar desde cliente → dashboard con gráficos. Sin mocks: todo contra la API real.

**Fase 5 — Integración:** los recorridos del pedido (venta → stock → ingresos → dashboard; recepción → stock; mantenimiento → stock → recordatorio → ingreso; lavado → ingreso → dashboard; totales Yape/efectivo cuadran con la suma de ventas; cliente con dos vehículos → aviso del vehículo correcto sin reescribir nombre ni teléfono) probados en el negocio demo, en navegador a 390 px.

### 2.11 Clientes y Avisar por WhatsApp (v0.2)

**Objetivo [DECISIÓN] DEC-41/43:** el cliente se registra **una sola vez** y el dueño nunca vuelve a escribir su nombre ni su teléfono para avisar.

**Qué ya existe y se reutiliza:** `Customer` con nombre y teléfono; un cliente con varios vehículos (BR-C7); el recordatorio ya pertenece a un **vehículo** y el aviso ya toma el teléfono de `vehicle.customer`; `wa.me` con plantilla y variables (`{cliente}`, `{placa}`, `{proxima_fecha}`, `{proximo_km}`), historial de avisos (BR-W6). No se agrega API de WhatsApp ni bots (D-04).

**Qué cambia:**

1. **Buscar cliente** por nombre, teléfono **o placa** (DEC-42). Resultado: tarjeta con nombre, teléfono y chips con sus placas.
2. **Ficha del cliente:** datos, vehículos (con próximo km/fecha de cada uno), recordatorios abiertos y botón **Avisar por WhatsApp**.
3. **"+ Agregar cliente"** con lo mínimo: nombre y, si se tiene, teléfono; opcionalmente una o más placas (vehículos existentes se enlazan; los nuevos se crean). Al guardar, **continúa con el envío** sin volver atrás. Si el teléfono ya está registrado, ofrece **reutilizar ese cliente** en vez de crear otro (DEC-47).
4. **Avisar desde Recordatorios (flujo actual):** el recordatorio ya sabe el vehículo y, por él, el cliente y el teléfono. Si el vehículo no tiene cliente, en vez de "sin teléfono" aparece **Asignar cliente** → buscar existente o "+ Agregar cliente" → vuelve al aviso con los datos cargados.
5. **Teléfono solo al enviar:** si el cliente elegido no tiene teléfono, al tocar **Avisar por WhatsApp** se pide el teléfono en ese momento y se guarda en el cliente (queda para los próximos avisos). Si ese teléfono ya pertenece a otro cliente, se ofrece reutilizarlo (DEC-47).
6. **Avisar desde un cliente (flujo nuevo):**
   1. Avisar → **Avisar a un cliente** → buscar o "+ Agregar cliente".
   2. Si tiene varios vehículos, elegir el vehículo (chips con placa). Si ese vehículo tiene un recordatorio abierto, el aviso queda asociado a **ese** recordatorio (así pasa a "contactado", como hoy).
   3. Si no hay recordatorio, se envía un **aviso manual** (DEC-46), siempre que haya teléfono; queda en el historial sin crear un recordatorio.
   4. Vista previa del mensaje con los datos disponibles (las variables vacías se omiten; sin plantilla, abre el chat sin texto, BR-W4) → **Avisar por WhatsApp** → abre `wa.me` con el texto prellenado → se registra el aviso.
7. **Operaciones que no piden cliente ni placa** (DEC-44): venta rápida y lavado. En mantenimiento, el cliente sigue siendo opcional (se puede asignar después).

**Datos mínimos (DEC-45):** el nombre es el dato principal; el teléfono es opcional al registrar o guardar un cliente, en cualquier pantalla, y solo se exige en el momento de enviar un WhatsApp. No hay otros datos obligatorios.

### 2.12 Historial (trazabilidad)

Lo que pide el mapa (§10) y dónde se consulta. Todo registro es inmutable o se anula con motivo (BR-G5):

| Qué | Dónde queda | Dónde se consulta |
|---|---|---|
| Ventas | `Sale` (`source = COUNTER`) | Más → Ventas (`GET /sales`) |
| Lavados | `Sale` (`source = WASH`) | Más → Lavados (`GET /sales?source=WASH`) |
| Mantenimientos y su cobro | `Maintenance` + `Sale` (`source = MAINTENANCE`) | Ficha del vehículo (`GET /vehicles/:id/maintenances`) y Más → Mantenimientos |
| Movimientos de inventario | `InventoryMovement` (+ `InventoryReceipt`) | Inventario → movimientos (`GET /inventory/movements`) y recepciones (`GET /inventory/receipts`) |
| Recordatorios y avisos | `Reminder` + `ReminderContact` | Detalle del recordatorio (`GET /reminders/:id`) y ficha del cliente (`GET /customers/:id/contacts`, incluye avisos manuales) |

---

## 3. Decisiones

### 3.1 Resueltas con respuestas del dueño (v0.2)

| ID | Tema | Resolución | Estado |
|---|---|---|---|
| DEC-32 | Cómo se cobra un cambio de aceite | Monto total único (producto + mano de obra); los productos se registran solo para el stock (§2.2) | [CONFIRMADO] |
| DEC-22 (resto) | Aceite de balde: unidad o granel | Ambas: por litros y balde completo. Modelo de unidades de venta (§2.3) | [CONFIRMADO] (aceite de balde) · capacidad del balde e hidrolina: [PENDIENTE] |
| — | Criterio de precio de lavado de moto lineal y camioneta | Sin criterio en el sistema: el dueño elige el monto al registrar (§0.3) | [CONFIRMADO] |
| P-08 (parte) | Códigos de filtros | Cargados como dato confirmado (§0.4) | [CONFIRMADO] · algunas compatibilidades: [PENDIENTE] |

### 3.2 Decisiones funcionales incorporadas (v0.2)

| ID | Decisión | Estado |
|---|---|---|
| DEC-41 | **Cliente registrado una sola vez**, con uno o varios vehículos; su teléfono se reutiliza para todos los avisos. El usuario nunca vuelve a escribir nombre y teléfono para avisar | [DECISIÓN] |
| DEC-42 | **Búsqueda de clientes por nombre, teléfono o placa** | [DECISIÓN] |
| DEC-43 | **Avisar por WhatsApp desde un cliente**: elegir un cliente existente (o "+ Agregar cliente" y continuar), elegir el vehículo si tiene varios, generar el mensaje con los datos disponibles y abrir `wa.me` con el texto prellenado. Sin API ni bots | [DECISIÓN] (D-04 se mantiene) |
| DEC-44 | Cliente y placa **siguen sin exigirse** en venta rápida y lavado | [DECISIÓN] (ratifica D-07, BR-C2) |
| DEC-45 | **Datos del cliente:** nombre como dato principal; teléfono opcional al registrar; obligatorio solo al enviar un WhatsApp; sin otros datos obligatorios; vehículos asociados cuando corresponda | [DECISIÓN] (coherente con BR-C3 y D-08) |
| DEC-46 | **Aviso manual** a un cliente aunque no exista un recordatorio automático, siempre que tenga teléfono; queda en el historial sin crear recordatorio | [DECISIÓN] |
| DEC-47 | **Teléfono ya registrado:** se ofrece reutilizar el cliente existente en lugar de crear otro; sin bloquear | [DECISIÓN] |

### 3.2b Resueltas por el mapa funcional (v0.3)

| ID | Tema | Resolución |
|---|---|---|
| DEC-15 | Cierre del día con conteos manuales | Fuera: el mapa no lo incluye; el dashboard "Hoy" hace de resumen |
| DEC-28 | Stock crítico sin regla de mínimo | Sin stock mínimo. "Stock que requiere atención" = agotados, negativos y sin conteo inicial (BR-P19) |
| DEC-33 | Lavado con placa | Retirada: el lavado no pide placa (mapa §8) |
| DEC-35 | Intervalo preferido por vehículo para prellenar el próximo mantenimiento | Retirada: el mapa no lo pide y agregaría campos. BR-M3 queda como está (el usuario ingresa el próximo km/fecha cuando corresponda) |

### 3.2c Aprobadas por el usuario (2026-09-23)

| ID | Decisión |
|---|---|
| DEC-26 | La venta se bloquea si un producto **con conteo** no alcanza; el mantenimiento continúa con aviso aunque deje el saldo negativo (BR-P11). Implementado en R1 (`StockLedger`, política `BLOCK`/`WARN`) |
| DEC-27 | Los productos sin conteo inicial se pueden vender, con aviso de stock no confiable (BR-P12). Implementado en R1 |
| DEC-29 | El precio aplicado en una venta se puede modificar y queda guardado como snapshot de esa operación (R4) |
| DEC-31 | Se permite un mantenimiento sin vehículo; en ese caso no hay recordatorio (R6) |
| DEC-38 | Capa de datos web: TanStack Query (Fase 4) |

### 3.3 Pendientes que todavía requieren decisión (del dueño o tuya)

Numeración continúa `09-BACKLOG.md` §2. **Negritas = necesarias antes de empezar el corte indicado.**

| ID | Decisión | Recomendación | Quién | Antes de |
|---|---|---|---|---|
| DEC-30 | Pago mixto (parte Yape, parte efectivo) en una misma venta | Un método por venta; si ocurre, dos ventas. Preguntar al dueño | Dueño | R4 |
| DEC-34 | Almacenamiento de imágenes | Supabase Storage detrás de una interfaz `ImageStorage`; hasta decidir, solo campo + UI con íconos | Tú | R2 (subida) |
| DEC-36 | Costo de compra y proveedor en la recepción | No por ahora (no se pidió; sin datos, P-16). El dashboard aclara que son ingresos, no ganancias | Tú | R3 |
| DEC-37 | Agrupación de tipos en categorías de primer nivel (Aceites, Filtros, Fluidos, Siliconas, Otros) | Proponerla al dueño con la pantalla; es organización, no un dato del negocio | Dueño | R2 |
| DEC-39 | Motivos de ajuste como chips | Propuesta "Conteo físico distinto", "Producto dañado", "Consumo interno", "Otro", con texto libre; validar con el dueño | Dueño | R3 |
| DEC-40 | Rate limit | Por usuario autenticado, más alto en GET; login con límite propio | Tú | R7 |




### 3.4 Datos pendientes del dueño

No bloquean el código; sí la carga real y algunos textos:

- Precios de venta de productos; imágenes; combinaciones exactas marca × viscosidad × presentación; presentación estándar de aceites auto (§0.5).
- Capacidad en litros de los baldes; si la hidrolina también se vende por litros.
- Combinaciones y presentaciones de refrigerante.
- Compatibilidades de los filtros de aire 2001 y 0Y040 (y el nombre "envidia"), modelos exactos de los Kia/Hyundai, años de "Yaris moderno", y compatibilidades de los filtros de aceite.
- Texto del mensaje de WhatsApp (P-13); días de anticipación (P-05); código de país y formato de los teléfonos existentes (P-01).
- Si usa pago mixto (DEC-30) y si rebaja precios (DEC-29).

---

## 4. Contradicciones con la documentación existente

| # | Contradicción | Dónde | Cómo queda en este documento |
|---|---|---|---|
| 1 | **Teléfono obligatorio.** La v0.2 recogía "datos mínimos: nombre + teléfono", que chocaba con BR-C3, D-08 y el dato del dueño | `03-BUSINESS-RULES.md` BR-C3 · Discovery D-08 · §0.1 | **Resuelta** (DEC-45): teléfono opcional al registrar, solo exigido al enviar WhatsApp |
| 2 | **Códigos de filtros "no transcritos".** Discovery (C-11, P-08), BR-F5 y el §0 de la v0.1 de este documento decían que no estaban en el repo. Ahora están en §0.4 | `research/BRIGITH-DISCOVERY.md` C-11/P-08 · BR-F5 | **Corregida en `03-BUSINESS-RULES.md`** (BR-F5, v0.3 de este documento). Discovery sigue sin transcribirlos |
| 3 | **Precios de lavado y cobro del cambio de aceite "pendientes".** P-09, P-10, BR-L6, BR-V3 y DEC-15 dicen que faltan esos valores | Discovery P-09/P-10 · BR-L6, BR-V3 | Resueltos en §0.2 y §0.3. **Corregida en `03-BUSINESS-RULES.md`** (BR-L6, BR-V3); Discovery sigue sin transcribirlos |
| 4 | **"Un aviso nace de un recordatorio de mantenimiento."** El diseño actual (BR-R1, `Reminder.sourceMaintenanceId` obligatorio) no contempla avisar a un cliente sin recordatorio | BR-R1 · `05-DATABASE.md` Reminder | **Resuelta** (DEC-46): aviso manual con `ReminderContact` sin recordatorio |
| 5 | **Aceite de balde "a granel" como decisión pendiente** (DEC-22, BR-P15) | `09-BACKLOG.md` DEC-22 | Resuelto para el aceite de balde; la estructura (cantidad decimal) ya lo permitía, se agrega la unidad de venta |
| 6 | **Hidrolina:** el pedido confirma venta por litros para "aceite de balde"; la hidrolina también es de balde, pero no se dijo si se vende por litros | §0.4 | Queda [PENDIENTE]; el modelo lo soporta sin cambios si se confirma |
| 7 | **Nombre de modelo de vehículo.** `VehicleModel` exige `make` y `model` separados; el dueño dio "Yaris", "Kia 2016", "Hyundai" | `05-DATABASE.md` VehicleModel | Se carga el texto tal cual; separar marca/año requiere confirmación (DEC-07) |

**Contra el mapa funcional (v0.3):**

| # | Contradicción | Dónde | Corrección |
|---|---|---|---|
| 8 | Lavado con **campo de placa opcional** (DEC-33). El mapa: tipo → precio → pago → confirmar, sin placa | §2.3, §2.5, §2.7 · BR-L2 | Retirado el campo; DEC-33 retirada |
| 9 | **Cierre del día** (BR-L3/L4, D-14, módulo `daily-close`). El mapa no lo incluye | `01-VISION.md` §4 y §7 · `02-PRD.md` Fase 2 · BR-L3/L4 · `04-ARCHITECTURE.md` módulos | Fuera; el dashboard "Hoy" es el resumen |
| 10 | **Stock mínimo por producto** (`reorderPoint`, DEC-28). El dueño no tiene esa regla y el mapa no la pide | §2.3, §2.5, §2.7 | Retirado; atención = agotados, negativos y sin conteo |
| 11 | **Intervalo preferido por vehículo** (DEC-35). El mapa no lo pide | §1.1, §1.5, §2.3, §2.5, §2.7 | Retirado; BR-M3 sin cambios |
| 12 | **Búsqueda de Inicio solo por placa.** El mapa pide cliente, vehículo o placa | §2.5 Dashboard | Corregida |
| 13 | **Mantenimiento solo desde la placa.** El mapa también permite empezar desde el cliente | §2.5 Mantenimiento · `02-PRD.md` §2.1 | Corregida: placa/vehículo o cliente → vehículo |
| 14 | **Cliente "se registra con placa"** y "nombre y teléfono opcionales". El mapa: el nombre es el mínimo; placa y teléfono opcionales | `02-PRD.md` F1-2 y §2.2 | Corregida |
| 15 | **Historial de avisos manuales** sin lugar donde consultarlo | §2.7, §2.12 | `GET /customers/:id/contacts` |

No se encontró contradicción en: lavado sin cola ni estados (D-05), venta sin cliente ni placa (D-07), WhatsApp por `wa.me` sin API (D-04), recordatorio por fecha y/o km (D-09), stock por movimientos (DEC-04).
