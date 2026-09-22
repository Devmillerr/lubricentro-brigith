# 07 — UI/UX

**Versión:** 0.3 · **Actualizado:** 2026-09-21
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

### 3.7 Configuración
Plantilla de WhatsApp con vista previa, días de anticipación, regla por defecto cuando hay km y fecha, política de stock insuficiente y código de país. Todos los valores abiertos aparecen vacíos o marcados como provisionales.

### 3.8 Resumen del piloto
Pantalla de solo lectura con los tres indicadores aprobados: adopción, mantenimiento e inventario (BR-I1 a BR-I3), por período.

## 4. Flujos de la Fase 2 (solo diseño)

| Flujo | Pasos | Notas |
|---|---|---|
| Venta rápida | Producto → cantidad → pago (Yape o efectivo) | Sin placa ni cliente. Descuenta stock |
| Lavado | Tipo → precio → pago | Opcional, al recibir o cobrar. Sin estados. Placa opcional |
| Cierre del día | Resumen del día | Conteos manuales: [DECISIÓN PENDIENTE] DEC-15 |

## 5. Estados y errores

| Situación | Comportamiento |
|---|---|
| Sin conexión | Banner persistente. El formulario sigue abierto. El envío se reintenta con la misma `Idempotency-Key` |
| Conexión lenta | Indicador de progreso. El botón no se puede pulsar dos veces |
| Sesión vencida | Renovar en segundo plano. Si no es posible, volver a iniciar sesión sin perder el formulario |
| Error del servidor | Mensaje simple y reintento |
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
