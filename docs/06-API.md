# 06 — API REST

**Versión:** 0.3 · **Actualizado:** 2026-09-21
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

Códigos: 200/201 éxito · 400 validación · 401 sin sesión · 403 sin permiso · 404 no existe (también para recursos de otro negocio) · 409 conflicto de unicidad o idempotencia · 422 regla de negocio · 5xx servidor.

## 2. Endpoints del MVP

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | Token de acceso y de refresco |
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
| GET | `/vehicles/lookup?plate=` | **Búsqueda rápida por placa**: normalizada, coincidencia parcial. Devuelve vehículo, cliente, último mantenimiento y último km conocido |
| POST | `/vehicles` | Crear con solo la placa (BR-C5). Cliente y modelo opcionales |
| GET | `/vehicles/:id` | Detalle |
| PATCH | `/vehicles/:id` | Editar, incluido el cliente |
| GET | `/vehicles/:id/maintenances` | Historial |
| GET | `/vehicles/:id/compatible-products` | Productos con compatibilidad confirmada |
| GET | `/vehicle-models` | Modelos del negocio |
| POST | `/vehicle-models` | `{ make, model, yearFrom?, yearTo?, engineNote?, id? }`. Crear marca y modelo |
| PATCH | `/vehicle-models/:id` | Editar los mismos campos. `isActive: false` desactiva (BR-G5) |

### Productos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/product-categories` | Categorías |
| POST | `/product-categories` | Crear categoría |
| GET | `/products?search=&code=&categoryId=&includeStock=` | Buscar por código, nombre o marca. Con `includeStock`, agrega saldo y estado de conteo |
| POST | `/products` | `{ name, unit, categoryId?, brand?, code?, salePrice?, tracksStock?, id? }`. `unit` es texto libre (BR-P15) |
| PATCH | `/products/:id` | Editar los mismos campos. `isActive: false` desactiva (BR-G5) |
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
| POST | `/inventory/receipts` | `{ productId, quantity, occurredAt? }`. Ingreso de mercadería (BR-P6) |
| POST | `/inventory/adjustments` | `{ productId, quantityDelta, reason }`. Motivo obligatorio (BR-P10) |

No existen endpoints para editar ni borrar movimientos (BR-G5).

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
| GET | `/reminders/:id` | Detalle, con el texto que se enviaría según la plantilla |
| POST | `/reminders/:id/contacts` | Registra que se abrió el aviso y devuelve el enlace `wa.me`. Pasa el recordatorio a `CONTACTED`. Error 422 si no hay teléfono (BR-W6, BR-R10) |
| PATCH | `/reminders/:id` | Cambiar el estado: volver a `PENDING`, o `DISMISSED` explícito (BR-R9) |

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

## 5. Puntos abiertos que afectan la API

DEC-01 y DEC-03 (valores de configuración), DEC-05 (política), DEC-22 (unidades de producto). Ninguno cambia rutas; cambian valores o validaciones de configuración.
