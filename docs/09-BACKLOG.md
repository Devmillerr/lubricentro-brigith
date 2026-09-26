# 09 — Backlog y registro de decisiones

**Versión:** 0.5 · **Actualizado:** 2026-09-25 (bloqueos y decisiones de R3)
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
| R3 — Recepción en lote, ajuste por cantidad física y alertas | Ninguno. Decisiones cerradas el 2026-09-25: DEC-36, DEC-39 y DEC-48 a DEC-52 (§2) | **Sin bloqueos. Sin implementar**: el código de R3 empieza solo con autorización explícita del usuario |

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
| DEC-10 | Hosting gratuito de web, API y PostgreSQL | Pendiente | Antes del piloto. No bloquea el desarrollo local |
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
| DEC-24 | **Salidas por venta de producto.** El inventario ya las contempla (`SALE`, BR-P14). Falta decidir: (a) ¿el MVP incluye una salida solo de stock (producto y cantidad, sin precio ni pago) o se espera a la venta rápida de la Fase 2?; (b) ¿Brigith vende productos sin mantenimiento, y con qué frecuencia? *Recomendación:* incluir la salida solo de stock, porque no exige precios ni pagos y evita que el saldo pierda fiabilidad desde el primer día. Si se incluye, agrega un endpoint y un formulario, sin cambios de modelo. No es la venta rápida, que sigue en la Fase 2 | Pendiente (negocio). La pregunta (b) aún no está en Discovery | Antes de cerrar C3. No bloquea el inicio |
| DEC-25 | `username` único **globalmente** (no por negocio, a diferencia del resto de unicidades de `05-DATABASE.md` §1). `POST /auth/login` recibe `{ username, password }` sin negocio ni slug; el `businessId` se resuelve del usuario encontrado, nunca lo envía el cliente | **Aprobada** (por ti) | — |

Las decisiones DEC-26 a DEC-47 están en `10-OPERACION-REAL.md` §3. Aquí se registran las de R3:

| ID | Decisión | Estado | Cuándo se necesita |
|---|---|---|---|
| DEC-36 | Recepción sin costo de compra ni proveedor. Queda fuera de R3 | **Aprobada** (2026-09-25) | — |
| DEC-39 | Motivos de ajuste como chips: Conteo físico distinto, Producto dañado, Consumo interno, Otro, más texto libre; el motivo se guarda como texto (BR-P10) | **Aprobada** (2026-09-25) | — |
| DEC-48 | No se ajusta un producto sin conteo inicial: 409 `ADJUSTMENT_REQUIRES_COUNT`; se pide un `COUNT` antes. El ajuste no marca `isCounted` (BR-P7b) | **Aprobada** (2026-09-25) | — |
| DEC-49 | Ajuste con cantidad física igual al saldo: 400 `NO_DIFFERENCE` (BR-P7b) | **Aprobada** (2026-09-25) | — |
| DEC-50 | Alertas: agotados y negativos solo consideran productos con conteo; los que no tienen conteo van en `notCountedCount` (BR-P19) | **Aprobada** (2026-09-25) | — |
| DEC-51 | Recepción y ajuste rechazados sobre productos inactivos: 409 `PRODUCT_INACTIVE`; en una recepción, se rechaza el lote completo (BR-P21) | **Aprobada** (2026-09-25) | — |
| DEC-52 | La UI (Recibir, historial de recepciones, Ajustar y alertas) forma parte de R3 | **Aprobada** (2026-09-25) | — |

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

| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-120 | Modelo `InventoryReceipt` y migración aditiva | M | Listo (sin implementar) |
| B-121 | `POST /inventory/receipts` en lote, atómico e idempotente | M | Listo (sin implementar) |
| B-122 | `GET /inventory/receipts` y `GET /inventory/receipts/:id` | M | Listo (sin implementar) |
| B-123 | Ajuste por cantidad física en el `StockLedger` y `POST /inventory/adjustments` | M | Listo (sin implementar) |
| B-124 | `GET /inventory/alerts` | M | Listo (sin implementar) |
| B-125 | Web: Recibir, historial de recepciones, Ajustar y stock que requiere atención | M | Hecho (2026-09-25, sin commit); prueba manual a 390 px OK (2026-09-26) |
| B-126 | Pruebas: lote atómico, idempotencia, ajuste concurrente, invariante de la caché y aislamiento entre negocios | M | Listo (sin implementar) |

### Fase 2
| ID | Ítem | Prio | Estado |
|---|---|---|---|
| B-100 | Venta rápida con descuento de stock | M | Fase 2 (P-09) |
| B-101 | Métodos de pago (Efectivo, Yape) | M | Fase 2 |
| B-102 | Lavado rápido opcional | M | Fase 2 (P-10, P-11) |
| B-103 | Cierre/resumen del día | M | Fase 2 (DEC-15) |

### Sin aprobar (no entran hasta decidir)
| ID | Ítem | Origen |
|---|---|---|
| B-900 | "Repetir productos de la última vez" | H sin validar |
| B-901 | Aviso "¿marcar como compatible?" | DEC-06 |
| B-902 | Alertas de stock mínimo | No aprobado |
| B-903 | Roles adicionales | P-12 |
| B-904 | Salida de stock por venta, sin precio ni pago | DEC-24 |

## 4. Explícitamente fuera del backlog

Offline, IndexedDB y sincronización · WhatsApp API · facturación electrónica · IA o aprendizaje automático de compatibilidades · Kanban o estados de lavado · SaaS con planes y facturación · intervalos de mantenimiento predeterminados · módulo de citas o turnos.
