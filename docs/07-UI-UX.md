# 07 — UI/UX

**Versión:** 0.6 · **Actualizado:** 2026-09-28 (contrato de R7: dashboard en §3.1, Resumen del piloto en §3.8 y 429 en §5, sin implementar; contrato de R6 en §3.3 y §3.9, sin implementar; Inventario de R3 en §3.6; Lavado de R5 en §3.9)
Etiquetas: ver `03-BUSINESS-RULES.md`. Este documento describe **flujos y pantallas**, no diseño visual. Los flujos son [TÉCNICO] y se validan con Brigith antes de cerrar el diseño (guía en Discovery §5). Mobile-first [DECISIÓN] D-01.

## 1. Principios

1. **Una mano, poco tiempo.** El dueño atiende personalmente y no tiene tiempo durante el trabajo (C-02, C-08). Botones grandes, pocos pasos. Que el uso sea con manos sucias es [HIPÓTESIS] H-09.
2. **La placa es un atajo, no un requisito** (BR-C1, BR-C2).
3. **Avisar, no bloquear.** Los avisos informan sin impedir guardar (BR-M7). La única excepción es la política `BLOCK` de stock, si el negocio la elige (DEC-05).
4. **Nada obligatorio durante el lavado** (BR-L1).
5. **Sin valores inventados.** Ningún intervalo, mensaje ni precio viene precargado (BR-M1, BR-W4).
6. **Errores de red claros:** lo escrito no se pierde y el reintento no duplica registros.

## 2. Navegación

Barra inferior:

| Pestaña | Contenido |
|---|---|
| **Inicio** | Búsqueda por placa y acciones rápidas |
| **Avisar** | Recordatorios pendientes, con contador |
| **Productos** | Catálogo, compatibilidad e inventario (stock, contar, ingreso, ajuste) |
| **Más** | Clientes, configuración, resumen del piloto. En la Fase 2: ventas, lavado y cierre |

## 3. Pantallas del MVP

### 3.1 Inicio
- Campo de placa grande, con búsqueda mientras se escribe.
- Resultado: vehículo, cliente (si lo hay), último mantenimiento y estado del recordatorio.
- Sin resultado: "Crear vehículo con esta placa".
- Acción principal visible: **Nuevo mantenimiento**.

#### Cambios de R7: dashboard en Inicio (contrato cerrado el 2026-09-28, sin implementar)

Decisiones DEC-78 a DEC-84 (`09-BACKLOG.md` §2); reglas BR-D1 a BR-D7; datos de `GET /dashboard` (`06` §2, Dashboard). Mobile-first, diseñado para 390 px de ancho, sin desborde horizontal.

Orden de arriba abajo:
1. **Acciones grandes:** Vender · Lavado · Mantenimiento · Recibir (las que ya existen).
2. **Búsqueda** por placa o cliente (la actual, sin cambios).
3. **Selector de período:** Hoy · Semana · Mes (zona horaria del negocio, BR-D1). Semana = lunes a domingo; Mes = calendario. Muestra el rango ("lun 22 – dom 28 sep").
4. **Cifras en tarjetas:** Ingresos totales · Efectivo · Yape (responde "¿cuánto debería haber en caja y cuánto en Yape?") · Mostrador · Lavados (cantidad y monto) · Mantenimiento (un solo monto, del día del cobro) · Mantenimientos del período (por fecha del servicio) y cuántos siguen sin cobro (como recordatorio, no como error).
5. **Efectivo frente a Yape:** una barra horizontal dividida con los dos montos.
6. **Barras por hora (Hoy) o por día (Semana, Mes)**, apiladas por Mostrador / Lavado / Mantenimiento ("¿cuándo entra el dinero y de qué?").
7. **Productos más vendidos** (hasta 10): unidades vendidas y, aparte y con otra etiqueta, **"usado en mantenimientos"**. El texto deja claro que el consumo de mantenimiento es inventario y no suma a las ventas (BR-D5).
8. **Stock que requiere atención** (lista, no gráfico): negativos, agotados y cuántos productos siguen sin conteo, con acceso a Inventario.
9. **Recordatorios por avisar:** contador con acceso a Avisar.

**Gráficos (DEC-83):** barras simples hechas con SVG o CSS propio, sin librerías nuevas. Cada barra lleva su valor en texto (no solo color), con buen contraste en tema claro y oscuro.

**Actualización (DEC-84):** con la capa actual (`useApiQuery`), sin TanStack Query. La pantalla vuelve a pedir el dashboard al volver a la pestaña o a la app, cada 60 s mientras Inicio está visible, y al volver a Inicio después de registrar una operación.

**Estados:** cargando (esqueleto de tarjetas) · período sin operaciones ("Sin ventas en este período", con las acciones grandes a mano) · error ("No se pudo cargar" + Reintentar) · 429 (§5).

**Fuera de R7:** comparación con otro período, metas, stock mínimo, filtros por empleado.

### 3.2 Ficha del vehículo
Placa, modelo, cliente y teléfono (ambos opcionales), último km conocido, próximo km/fecha del último mantenimiento, historial y productos compatibles confirmados. Acción principal: **Nuevo mantenimiento**.

### 3.3 Nuevo mantenimiento (pantalla más importante)
Una sola pantalla con secciones, no un asistente largo:

1. **Vehículo** (ya elegido).
2. **Tipo** ("Cambio de aceite" al inicio).
3. **Productos usados:** búsqueda por código, nombre o marca; cantidad. Junto a cada producto se muestra su saldo, o "sin conteo inicial" (BR-P8).
4. **Km actual** (opcional).
5. **Próximo mantenimiento:** próximo km y próxima fecha, ambos opcionales y **sin valores precargados** (BR-M1). Si se llenan los dos, aparece el selector "lo primero que ocurra" / "cuando ocurran ambos". No tiene selección previa salvo que el negocio la haya configurado (BR-M5).
6. **Guardar.**

Después de guardar:
- Confirmación con **"Avisar por WhatsApp"** si hay teléfono y recordatorio.
- Avisos no bloqueantes en pantalla: stock insuficiente (con acceso directo a "Contar"), producto sin conteo inicial, km menor al anterior, próxima fecha anterior a hoy.
- Con política `BLOCK` y stock insuficiente: mensaje claro con el producto, el saldo y el acceso a "Contar", antes de guardar.

**Cambios de R6 (contrato cerrado, sin implementar; `06-API.md` §2, Mantenimientos):**

- **Cobro opcional** en el formulario (un total y Efectivo/Yape, DEC-72) y **cobro posterior** desde el detalle del mantenimiento. No hay pantalla separada de cobros (P8): el detalle y el historial del mantenimiento muestran su venta cuando existe.
- **Sin vehículo** (DEC-73): se permite registrar y cobrar; sin km actual, próximo km/fecha ni regla, y sin recordatorio.
- **Anular un mantenimiento** pide el motivo **obligatorio** (DEC-71); si tiene cobro, se anula junto con él. Cambio incompatible con el formulario actual, donde el motivo es opcional.

### 3.3.1 Cliente y teléfono
Desde la ficha del vehículo: nombre y teléfono, ambos opcionales, con la nota "Agrega el teléfono si quieres avisarle". Nunca son obligatorios (D-08).

### 3.4 Avisar
Lista ordenada por urgencia. Cada fila: placa, cliente, motivo ("fecha alcanzada", "km alcanzado según el último km conocido", "sin teléfono") y botón **WhatsApp**. Al abrir el enlace, el recordatorio pasa a "contactado", con opción de deshacer. Acciones: descartar y ver el vehículo.

Un recordatorio solo por km no aparece aquí por sí solo (BR-R4). Se ve en la ficha del vehículo.

### 3.5 Productos
Buscador por código, nombre o marca. Ficha del producto: datos, saldo y estado de conteo, últimos movimientos, modelos compatibles confirmados y "Agregar compatibilidad" (acción explícita). Alta rápida de producto: nombre, marca, código, categoría y unidad.

### 3.6 Inventario (dentro de Productos)
Tres acciones sobre un producto, todas con un formulario corto:

| Acción | Campos | Uso |
|---|---|---|
| **Contar** | Cantidad contada | Stock inicial y recuentos (BR-P7). Muestra "saldo del sistema" y la diferencia |
| **Ingreso** | Cantidad | Reposición de mercadería (BR-P6) |
| **Ajuste** | Cantidad (+/−) y motivo obligatorio | Correcciones (BR-P10) |

Historial de movimientos por producto, de solo lectura.

**Carga del stock inicial:** lista de productos con un indicador "sin conteo inicial" y el botón **Contar** en cada fila, para poder hacerlo de una vez o producto por producto. Qué proceso sigue Brigith es [DECISIÓN PENDIENTE] DEC-21; la pantalla sirve para ambos.

#### Cambios de R3 (aprobados el 2026-09-25, sin implementar)

La UI forma parte de R3 (DEC-52). **Ingreso** y **Ajuste** cambian así; **Contar** queda igual:

| Acción | Campos | Uso |
|---|---|---|
| **Recibir** (reemplaza Ingreso) | Varios productos: buscador del catálogo con chips de categoría y filtro rápido "Aceites auto/moto"; por línea, cantidad con −/+ o teclado (admite decimales); fecha y nota opcionales | Reposición de mercadería en una sola operación (BR-P6). **Guardar recepción** guarda todo o nada. Solo se ofrecen productos activos (BR-P21) |
| **Ajustar** (reemplaza Ajuste) | Muestra "El sistema dice: N". Se ingresa **lo que hay en el estante**, se elige el motivo con chips (Conteo físico distinto · Producto dañado · Consumo interno · Otro) y se puede agregar texto. Antes de guardar se ve la diferencia | Correcciones cuando el sistema no coincide con el estante (BR-P7b, BR-P10). Solo en productos activos con conteo: sin conteo, la pantalla ofrece **Contar**. Si la cantidad es igual al saldo, no hay nada que guardar |

- **Historial de recepciones:** lista (fecha, cantidad de productos, nota) y detalle con sus líneas.
- **Implementado (2026-09-25, sin commit): Recibir e historial de recepciones.** Rutas `/inventario/recepciones`, `/inventario/recepciones/nueva` y `/inventario/recepciones/[id]`, con acceso desde la cabecera de Inventario. El filtro rápido son dos chips, "Aceite auto" y "Aceite moto", que aparecen solo si existen esas categorías. La pestaña **Ingreso** del inventario de un producto se mantiene, pero abre Recibir con ese producto ya agregado (`?producto=`), en vez de registrar un ingreso de una línea (decisión del usuario, 2026-09-25). **Ajustar** y **Stock que requiere atención** también están implementados (2026-09-25, sin commit). Ajustar es la pestaña "Ajuste" del inventario del producto. Las alertas van arriba de la lista de Inventario, y "Ver y contar" activa el filtro "Sin conteo".
- **Stock que requiere atención**, en Inventario: agotados y negativos (solo productos con conteo) y cuántos productos siguen sin conteo inicial, con acceso a Contar (BR-P19). Es una lista, no un gráfico, y no hay stock mínimo.
- Los errores se validan en el formulario antes de enviar (líneas vacías, cantidades ≤ 0, productos repetidos), para no mostrar los mensajes de validación de la API, que hoy están en inglés.

### 3.7 Configuración
Plantilla de WhatsApp con vista previa, días de anticipación, regla por defecto cuando hay km y fecha, política de stock insuficiente y código de país. Todos los valores abiertos aparecen vacíos o marcados como provisionales.

### 3.8 Resumen del piloto
Pantalla de solo lectura con los tres indicadores aprobados: adopción, mantenimiento e inventario (BR-I1 a BR-I3), por período.

**Cambio de R7 (DEC-85, sin implementar):** la adopción muestra por separado ventas de mostrador, lavados y mantenimientos del período, como cantidades reales, sin porcentajes objetivo ni metas.

### 3.9 Lavado (R5: implementado el 2026-09-26, sin commit)

La UI forma parte de R5 (DEC-60). Sigue el patrón actual del frontend: sin TanStack Query ni cambios de arquitectura. Diseño: `10-OPERACION-REAL.md` §2.5 (flujo del mapa) y §0.3 (tipos y precios). Contrato: `06-API.md` §2, Lavados.

| Pantalla | Contenido |
|---|---|
| **Lavado** | Tarjetas grandes con los tipos activos. Si el tipo tiene dos precios (moto lineal S/8 · S/10; camioneta S/30 · S/40), el dueño toca uno; si tiene uno, el paso se salta. Los montos no llevan etiqueta inventada (§0.3). Solo muestra los tipos activos con **al menos un precio activo**: un tipo activo sin precio (hoy Minibán, Combi y Moto carguera, `prices: []`) no aparece, ni como botón deshabilitado; se resuelve en la UI, sin cambiar la API (decisión del usuario, 2026-09-26). Nota opcional. Confirmación con tipo, monto, pago y fecha, y **Nuevo lavado** / **Volver al inicio**. Si el tipo o el precio se desactivó mientras tanto (409), avisa y recarga la lista. Ruta `/lavado`, desde el botón **Lavado** de Inicio Después, **Efectivo** / **Yape** y **Confirmar** (`POST /washes`, idempotente). **No pide cliente ni placa, ni como campo opcional** (DEC-44, BR-L2) |
| **Lavados** (historial) | El historial genérico de ventas (`/ventas`, B-135) filtrado por `source=WASH` (`/ventas?source=WASH`, `GET /sales?source=WASH`), con monto, fuente, método de pago, fecha, nota y estado. Chips Todas / Mostrador / Lavado. No es una pantalla aparte (DEC-68). El nombre del tipo no sale en la lista porque `SaleSummaryResponse` no trae las líneas: se ve en el detalle |
| **Detalle** | El detalle genérico de venta (`/ventas/:id`, `GET /sales/:id`, B-135) y acción **Anular**. En un lavado, el título es el nombre del tipo (`descriptionSnapshot`) |
| **Anular** | Pide el motivo, siempre obligatorio (BR-V7, DEC-59), y usa `POST /sales/:id/void`. No se usa "Deshacer" para una venta: el término es **Anular**. **Desde R6 (DEC-70):** en una venta con `source = MAINTENANCE` (cobro de mantenimiento) **no** se ofrece esta acción: se oculta o se deshabilita, o conduce a la anulación de su mantenimiento. La API la rechaza igual con 409 `SALE_MANAGED_BY_MAINTENANCE`. Las ventas de mostrador (R4) y los lavados (R5) no cambian |
| **Configuración → Tipos de lavado** | `/configuracion/lavados`. Crear, renombrar, ordenar (subir/bajar) y desactivar/reactivar tipos; agregar, editar (monto y etiqueta; etiqueta vacía = sin etiqueta) y desactivar/reactivar precios (DEC-56, DEC-63). Lista con `GET /wash-types?includeInactive=true`: muestra todos, también los inactivos y los que no tienen precio (marcados "Sin precio: no se cobra"), para agregarles precio. La pantalla **Lavado** solo pide los activos (DEC-64) |

- Sin estados de lavado, cola ni Kanban (BR-L1).
- El momento real del cobro y quién cobra (BR-L7, P-11) quedan **fuera de R5**: la pantalla registra el lavado cuando se confirma y no asume otro momento.
- El historial, el detalle y la anulación de ventas son pantallas genéricas (B-135), implementadas el 2026-09-26 junto con R5 (con autorización del usuario): `/ventas` y `/ventas/:id`, en **Más → Ventas**. R5 las reutiliza con `source=WASH` y no crea pantallas duplicadas (DEC-68). La pantalla **Vender** (B-134) sigue sin implementar.

### 3.10 Vender (R4, B-134: implementado el 2026-09-26, sin commit)

Venta de mostrador (`source = COUNTER`), sin cliente, placa, lavado ni mantenimiento (DEC-44). Ruta `/ventas/nueva`, desde **Vender** en Inicio y en el historial de ventas. Diseño: `10-OPERACION-REAL.md` §2.5 (Venta de productos). Contrato: `06-API.md` §2, Ventas.

| Parte | Contenido |
|---|---|
| **Productos** | El mismo buscador de Recibir: texto, chips de categoría y filtro rápido de aceites; solo productos activos, con su saldo. Cada toque suma 1 |
| **Líneas** | Cantidad con −/+ o teclado (hasta 3 decimales, en la unidad del producto), precio aplicado editable (DEC-29; se precarga el del catálogo y, si no tiene, se escribe), subtotal y quitar. Sin formas de venta (`ProductSaleUnit`, fuera de R4) |
| **Total** | Vista previa con el mismo redondeo half-up por línea que la API. El total cobrado es el que devuelve `POST /sales` |
| **Pago** | **Efectivo** / **Yape**, uno solo (DEC-30). Nota opcional (≤ 500) |
| **Cobrar S/ X** | `POST /sales` con `Idempotency-Key` (la misma operación reintentada reusa la clave). El botón se deshabilita mientras cobra |
| **Errores** | 422 `INSUFFICIENT_STOCK` (`BLOCK`, DEC-26): marca la línea con saldo y cantidad pedida, avisa "No se cobró nada" y deja corregir la cantidad o quitar el producto; no hay "confirmar igual". 409 `PRODUCT_INACTIVE` y 404 `PRODUCT_NOT_FOUND` marcan la línea. La venta nunca se muestra como cobrada si la API no la confirmó |
| **Confirmación** | Líneas, total, pago, fecha, nota y avisos `PRODUCT_NOT_COUNTED` ("se cobró igual", DEC-27). **Nueva venta**, **Ver detalle** y **Volver al inicio** |

**Sin "Deshacer":** `10` §2.5 proponía "Confirmación con Deshacer", pero anular una venta exige motivo (BR-V7). Se resolvió así: la confirmación no ofrece Deshacer; para revertir, **Anular** con motivo desde el detalle (`/ventas/:id`, B-135).

## 4. Flujos de la Fase 2 (solo diseño)

| Flujo | Pasos | Notas |
|---|---|---|
| Venta rápida | Producto → cantidad → pago (Yape o efectivo) | Sin placa ni cliente. Descuenta stock |
| Lavado | Tipo → precio → pago → confirmar | Pasó a R5: ver §3.9. Flujo propio, sin estados, sin cliente ni placa (DEC-44; DEC-33 retirada) |
| Cierre del día | Resumen del día | Conteos manuales: [DECISIÓN PENDIENTE] DEC-15 |

## 5. Estados y errores

| Situación | Comportamiento |
|---|---|
| Sin conexión | Banner persistente. El formulario sigue abierto. El envío se reintenta con la misma `Idempotency-Key` |
| Conexión lenta | Indicador de progreso. El botón no se puede pulsar dos veces |
| Sesión vencida | Renovar en segundo plano. Si no es posible, volver a iniciar sesión sin perder el formulario |
| Error del servidor | Mensaje simple y reintento |
| Demasiadas solicitudes (429 `RATE_LIMITED`, R7) | "Demasiadas solicitudes. Espera un momento y vuelve a intentar." Sin reintento automático; el usuario reintenta a mano. En un formulario, no se pierde lo escrito |
| Validación | Mensaje junto al campo |
| Lista vacía | Estado vacío con la acción siguiente |

## 6. Accesibilidad y PWA

- Objetivos táctiles cómodos y buen contraste bajo luz solar.
- Instalable en la pantalla de inicio. Pantalla "sin conexión" sin datos de negocio en caché (D-10).
- Idioma: español (Perú).

## 7. Medición de la meta de 5 segundos [TÉCNICO]

La meta general es [DECISIÓN] D-02. Los umbrales por flujo no existen todavía. Se miden en uso real:
- Tiempo desde abrir la app hasta guardar un mantenimiento de un vehículo conocido.
- Toques por flujo.
- Errores y reintentos por día.

## 8. Fuera del MVP

- Atajo "repetir productos de la última vez" ([HIPÓTESIS] sin validar; en el backlog como Could).
- Aviso "¿marcar como compatible?" ([DECISIÓN PENDIENTE] DEC-06).
- Alertas de stock mínimo (no aprobadas).
- Diseño visual: paleta, tipografía y componentes se definen tras aprobar los flujos.
