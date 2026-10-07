# 03 — Reglas de negocio

**Versión:** 0.8 · **Actualizado:** 2026-10-06 (monto pagado en recepciones, formas de venta y unidad válida: BR-P6, BR-P15 y BR-P22, DEC-90 a DEC-92; antes, contrato de R7: BR-I1 y BR-D1 a BR-D7, sin implementar; antes, contrato de R6: BR-M12, BR-M15, BR-M16 y BR-V7; antes, R4: BR-P21 y BR-V4; R5: BR-L7, BR-L9 y BR-L10)
**Fuentes de verdad:** [`/research/BRIGITH-DISCOVERY.md`](../research/BRIGITH-DISCOVERY.md) y [`01-VISION.md`](01-VISION.md).

## Etiquetas (iguales en todos los documentos)

| Etiqueta | Significado |
|---|---|
| **[CONFIRMADO]** | Hecho dicho por Brigith (Discovery C-xx) |
| **[DECISIÓN]** | Decisión de producto aprobada (Discovery D-xx, Visión §11) |
| **[TÉCNICO]** | Decisión técnica adoptada en estos documentos. Queda aprobada al aprobar el conjunto de documentos |
| **[HIPÓTESIS]** | Sin validar. No se implementa como regla |
| **[PENDIENTE]** | Falta información de Brigith (P-xx) |
| **[DECISIÓN PENDIENTE]** | Falta que alguien decida. El sistema se diseña para poder decidirlo después sin rehacer la arquitectura |

Ninguna regla de este documento convierte una hipótesis en hecho. Los valores concretos del dueño (códigos de filtros, precios de lavado, cobro del cambio de aceite, aceite de balde) están en `10-OPERACION-REAL.md` §0. Cuando una regla los cita como [CONFIRMADO], la fuente es esa sección: todavía no están transcritos a Discovery. El mapa funcional del 2026-09-23 es la referencia de cómo debe funcionar el sistema.

---

## BR-G — Generales y multi-negocio

| ID | Regla | Estado |
|---|---|---|
| BR-G1 | Todo dato de negocio pertenece a exactamente un `Business`. | [DECISIÓN] D-06 |
| BR-G2 | Un usuario pertenece a un solo negocio en el MVP. | [TÉCNICO] |
| BR-G3 | El negocio del usuario sale del token de sesión, nunca del cuerpo ni de la URL de la petición. | [TÉCNICO] |
| BR-G4 | No hay auto-registro de negocios. Brigith se crea por seed/administración. | [DECISIÓN] D-06 |
| BR-G5 | Clientes, vehículos y productos no se borran: se desactivan. Los mantenimientos no se borran: se anulan. Los movimientos de inventario no se modifican ni se borran: se corrigen con otro movimiento. | [TÉCNICO] |
| BR-G6 | Los nombres usados en un registro histórico (por ejemplo, el producto de un mantenimiento) se copian al registro. Renombrar el catálogo no altera el pasado. | [TÉCNICO] |
| BR-G7 | Los datos de prueba viven en un negocio aparte ("demo"), para que los indicadores del piloto solo cuenten operaciones reales (BR-I1). | [TÉCNICO] |

## BR-C — Clientes y vehículos

| ID | Regla | Estado |
|---|---|---|
| BR-C1 | La placa es la entrada rápida y prioritaria para cambios de aceite y mantenimientos. | [DECISIÓN] D-07 |
| BR-C2 | La placa **no** es obligatoria en otras operaciones (venta rápida y lavado, en Fase 2). | [DECISIÓN] D-07 |
| BR-C3 | Un cliente se puede registrar sin teléfono. | [DECISIÓN] D-08 |
| BR-C4 | Un vehículo se puede registrar sin cliente. | [TÉCNICO] |
| BR-C5 | Un vehículo siempre tiene placa. | [TÉCNICO] (revisable, ver BR-C10) |
| BR-C6 | La placa se normaliza (mayúsculas, sin espacios ni guiones) para buscar y comparar; también se conserva como fue escrita. Es única por negocio. No se valida un formato de placa. | [TÉCNICO] |
| BR-C7 | Un cliente puede tener varios vehículos. Un vehículo tiene como máximo un cliente actual. Cambiar el cliente de un vehículo conserva su historial. | [TÉCNICO] |
| BR-C8 | El teléfono se guarda tal como se ingresa. La normalización se aplica solo al generar el enlace de WhatsApp (BR-W5). | [TÉCNICO] |
| BR-C9 | Los clientes frecuentes ya tienen teléfono registrado. Dónde y en qué formato está registrado no se sabe. | [CONFIRMADO] C-07 · [PENDIENTE] P-01 |
| BR-C10 | Vehículos sin placa y otros identificadores. Clientes duplicados: si se registra un teléfono que ya existe, se ofrece reutilizar el cliente existente, sin bloquear. | Vehículos sin placa: [PENDIENTE] · teléfono repetido: [DECISIÓN] mapa funcional (DEC-47) |

## BR-M — Mantenimiento

| ID | Regla | Estado |
|---|---|---|
| BR-M1 | El próximo mantenimiento depende del vehículo y su uso. No existe un intervalo por defecto. | [CONFIRMADO] C-09 |
| BR-M2 | Cada mantenimiento puede definir: próximo km, próxima fecha, ambos o ninguno. | [DECISIÓN] D-09 |
| BR-M3 | El sistema **no calcula** el próximo km ni la próxima fecha. Los ingresa el usuario. | [DECISIÓN] D-09 |
| BR-M4 | La regla de vencimiento del mantenimiento es `KM`, `DATE`, `ANY` (lo que ocurra primero) o `ALL` (cuando ocurran ambos). Con solo km es `KM`; con solo fecha, `DATE`. | [TÉCNICO] |
| BR-M5 | Cuando se ingresan km y fecha, el usuario elige `ANY` o `ALL`. No hay valor por defecto. Si el negocio define uno en su configuración, se preselecciona. | [DECISIÓN PENDIENTE] DEC-01 · [PENDIENTE] P-04 |
| BR-M6 | Un mantenimiento sin próximo km ni fecha es válido y no genera recordatorio. | [TÉCNICO] |
| BR-M7 | El km actual es opcional. Se avisa, sin bloquear, si es menor al último km conocido del vehículo, si el próximo km no supera al km actual, o si la próxima fecha es anterior a la del mantenimiento. | [TÉCNICO] |
| BR-M8 | Un mantenimiento tiene 0 a n productos usados, cada uno con cantidad mayor que cero. | [DECISIÓN] D-13 |
| BR-M9 | La fecha del mantenimiento puede ser anterior a la de su registro. | [TÉCNICO] |
| BR-M10 | Guardar un mantenimiento es **una sola operación indivisible**: crea el mantenimiento, sus productos, sus movimientos de inventario y su recordatorio, o no crea nada. | [TÉCNICO] |
| BR-M11 | Un mantenimiento guardado permite corregir campos que no afectan el stock (notas, km, próximo km/fecha, regla). Cambiar los productos o las cantidades se hace anulando y registrando uno nuevo. Sin vehículo, km, próximo km/fecha y regla no se pueden corregir (BR-M16). | [TÉCNICO] |
| BR-M12 | Anular un mantenimiento exige un **motivo** (desde R6, tenga o no cobro), genera los movimientos inversos de sus productos (BR-P9) y descarta el recordatorio que había creado. **Desde R6:** si tiene cobro (BR-M15), su venta se anula en la misma operación y con el mismo motivo; si la venta ya estaba anulada, la anulación sigue sin generar movimientos. Un mantenimiento se anula una sola vez: una segunda anulación se rechaza. Un mantenimiento anulado no cuenta para el último km conocido. | [TÉCNICO] · motivo y anulación conjunta: [DECISIÓN] DEC-71, DEC-77 (R6) |
| BR-M13 | Existe el tipo "Cambio de aceite". Otros tipos de mantenimiento no se crean por defecto. | [CONFIRMADO] C-03 · [PENDIENTE] P-17 |
| BR-M14 | Qué datos exactos lleva el sticker actual, y por lo tanto qué debe registrar un mantenimiento, se completa tras P-02. | [PENDIENTE] P-02, P-03 |
| BR-M15 | Un mantenimiento puede tener **un cobro**: una venta (`Sale` con `source = MAINTENANCE`) con una sola línea de servicio por el **monto total** (BR-V3), al registrarlo o después. Sin cobro es válido. El stock lo sigue moviendo el mantenimiento; la venta no mueve stock. Como máximo **un cobro en toda su vida**: no se vuelve a cobrar, ni siquiera si su cobro fue anulado, y un mantenimiento anulado no se cobra. El cobro no lleva cliente en R6 y su fecha es la hora real del cobro. | [CONFIRMADO] monto único (`10-OPERACION-REAL.md` §0.2) · [DECISIÓN] DEC-69, DEC-72, DEC-74, DEC-75 (R6) |
| BR-M16 | **Mantenimiento sin vehículo** (DEC-31): se puede registrar y cobrar sin vehículo. En ese caso no admite km actual, próximo km, próxima fecha ni regla de vencimiento, **ni al registrarlo ni al corregirlo (BR-M11)**: se rechazan, no se ignoran ni se guardan. No genera recordatorio, no cierra recordatorios previos y no tiene seguimiento por fecha ni km. En R6 no se le asigna un vehículo después. Con vehículo, rigen BR-M2 a BR-M7 y BR-R1. | [DECISIÓN] DEC-31, DEC-73 (R6) |

## BR-R — Recordatorios

| ID | Regla | Estado |
|---|---|---|
| BR-R1 | Guardar un mantenimiento con próximo km y/o fecha crea un recordatorio para ese vehículo y tipo de mantenimiento. | [TÉCNICO] |
| BR-R2 | Hay como máximo un recordatorio abierto por vehículo y tipo de mantenimiento. Un mantenimiento nuevo del mismo tipo cierra el anterior como cumplido. | [TÉCNICO] (supuesto a confirmar con Brigith, P-03) |
| BR-R3 | **Por fecha:** corresponde avisar cuando `hoy ≥ próxima fecha − días de anticipación`. | [TÉCNICO] |
| BR-R4 | **Por km:** el sistema solo conoce el km de las visitas. Compara contra el último km conocido del vehículo y nunca estima el km actual. Consecuencia: un recordatorio solo por km no se activa por sí solo mientras el vehículo no vuelva; el próximo km se muestra en la ficha del vehículo. | [TÉCNICO] |
| BR-R5 | Los días de anticipación son configuración del negocio y no tienen valor por defecto. Mientras estén vacíos, corresponde avisar desde la fecha exacta. | [DECISIÓN PENDIENTE] DEC-03 · [PENDIENTE] P-05 |
| BR-R6 | Con `ANY`, corresponde avisar cuando se cumple cualquiera de las dos condiciones; con `ALL`, cuando se cumplen ambas. | [TÉCNICO] |
| BR-R7 | Estados: `PENDING`, `CONTACTED`, `DONE`, `DISMISSED`. | [TÉCNICO] |
| BR-R8 | Un recordatorio sin teléfono se muestra como "sin teléfono", sin ocultarlo. | [TÉCNICO] |
| BR-R9 | Descartar un recordatorio es una acción explícita del usuario. | [TÉCNICO] |
| BR-R10 | Recordatorios enviados: el sistema registra que el aviso **se abrió en WhatsApp**, no que se envió (BR-W2). | [TÉCNICO] |
| BR-R11 | **Reabrir** (volver a `PENDING`) solo es posible para un recordatorio descartado por el usuario o contactado ("deshacer"). No se reabre: uno cumplido (`DONE`); uno cuyo mantenimiento de origen fue anulado (BR-M12), que queda `DISMISSED` con el motivo "mantenimiento anulado"; ni uno para el que ya hay otro abierto del mismo vehículo y tipo (BR-R2). Un rechazo no modifica el recordatorio. La UI solo ofrece "Reabrir" cuando está permitido y, si no, explica el motivo. | [TÉCNICO] |
| BR-R12 | Un recordatorio ya cerrado (`DONE` o `DISMISSED`) no se puede volver a descartar, así se conserva el motivo con el que se cerró (cumplido, descartado o mantenimiento anulado). | [TÉCNICO] |
| BR-R13 | La búsqueda por placa del Inicio muestra, junto al próximo mantenimiento, el estado actual (BR-R7) del recordatorio que generó el último mantenimiento activo del vehículo, si lo generó. No muestra un historial de recordatorios. | [TÉCNICO] |

## BR-W — WhatsApp

| ID | Regla | Estado |
|---|---|---|
| BR-W1 | No se usa WhatsApp API. Se genera un enlace `wa.me`. | [DECISIÓN] D-04 |
| BR-W2 | El envío siempre lo hace el usuario. El sistema no sabe si se envió ni si se leyó. | [DECISIÓN] D-04 |
| BR-W3 | El mensaje sale de una plantilla del negocio con variables (`{cliente}`, `{placa}`, `{proxima_fecha}`, `{proximo_km}`). | [TÉCNICO] |
| BR-W4 | El texto de la plantilla lo define Brigith. No se inventa ninguno. Mientras esté vacía, el enlace abre el chat sin mensaje. | [PENDIENTE] P-13 |
| BR-W5 | El teléfono se convierte a formato internacional con el código de país del negocio. La regla exacta de normalización se define viendo los teléfonos reales. | [PENDIENTE] P-01 · [HIPÓTESIS] H-08 |
| BR-W6 | Cada aviso abierto se guarda (quién, cuándo, texto usado). | [TÉCNICO] |
| BR-W7 | Consentimiento del cliente y obligaciones de datos personales. | [PENDIENTE] P-14 |

## BR-P — Productos e inventario

| ID | Regla | Estado |
|---|---|---|
| BR-P1 | Hoy el inventario se controla de forma visual. Los filtros se manejan por código. Las marcas de lubricantes son Repsol, Vistony y Valvoline. | [CONFIRMADO] C-04, C-05, C-10, C-16 |
| BR-P2 | **El stock se actualiza mediante movimientos desde el MVP.** No hay bandera para activarlo ni descuento diferido a otra fase. | [DECISIÓN] Visión §11 (DEC-04) |
| BR-P3 | Todo cambio de stock es un movimiento (`InventoryMovement`). El saldo de un producto es la suma de sus movimientos. Los movimientos no se editan ni se borran (BR-G5). | [TÉCNICO] |
| BR-P4 | Tipos de movimiento con punto de entrada en el MVP: `COUNT` (conteo físico, incluido el inicial), `PURCHASE_IN` (ingreso de mercadería), `MAINTENANCE_USE`, `MAINTENANCE_VOID` (reverso) y `ADJUSTMENT` (ajuste manual). El modelo define además `SALE` y `SALE_VOID` (salidas por venta de producto); su punto de entrada se decide en DEC-24 (BR-P14). | [TÉCNICO] |
| BR-P5 | Cada producto usado en un mantenimiento con control de stock genera un movimiento `MAINTENANCE_USE` en la misma operación que guarda el mantenimiento (BR-M10). | [DECISIÓN] D-13 / DEC-04 |
| BR-P6 | **Ingreso de mercadería** entra en el MVP: sin entradas el stock solo bajaría, y los aceites se reponen semanalmente. Registra producto, cantidad y fecha; no modela proveedores. **Desde R3 se registra como una recepción en lote:** una cabecera con fecha y nota opcional, y una o más líneas (producto, cantidad > 0, sin productos repetidos), cada una un `PURCHASE_IN`. Es atómica: si una línea es inválida, no se guarda nada. **Desde DEC-90**, cada línea admite opcionalmente el total pagado por ella; la recepción muestra la suma y el mes, el total comprado. Lo que no tiene monto no se estima. | [TÉCNICO] (consecuencia de DEC-04; C-18) · sin proveedor: [DECISIÓN] DEC-36 · monto pagado opcional: [DECISIÓN] DEC-90 · lote: [TÉCNICO] R3 · qué otros productos se reponen: [PENDIENTE] P-16 |
| BR-P7 | **Stock inicial:** se carga con un `COUNT` por producto. Un `COUNT` registra la cantidad contada; el sistema guarda la diferencia contra el saldo calculado. Sirve igual para el conteo inicial y para recontar después. | [TÉCNICO] |
| BR-P7b | **Ajuste por cantidad física (R3):** el usuario ingresa la cantidad que hay en el estante, no la diferencia. El sistema calcula la diferencia contra el saldo, con el producto bloqueado, y guarda el saldo anterior, la diferencia, el resultante, el motivo, el usuario y la fecha. Solo se permite en productos **con conteo inicial**: sin conteo se rechaza y se pide un `COUNT` antes (el ajuste no marca el producto como contado). Si la cantidad física es igual al saldo, se rechaza porque no hay nada que ajustar. Un ajuste nunca cuenta como venta. El `COUNT` sigue siendo la operación sin motivo para el conteo inicial y los recuentos (BR-P7). | [DECISIÓN] DEC-48, DEC-49 · [TÉCNICO] |
| BR-P8 | Un producto sin ningún `COUNT` está **sin conteo inicial**: sus movimientos se registran, pero su saldo no es confiable y no se evalúa stock insuficiente hasta el primer conteo. | [TÉCNICO] |
| BR-P9 | Anular un mantenimiento genera un movimiento `MAINTENANCE_VOID` por producto, con la cantidad opuesta. | [TÉCNICO] |
| BR-P10 | Los ajustes manuales (`ADJUSTMENT`) exigen un motivo escrito. La UI ofrece los motivos **Conteo físico distinto**, **Producto dañado**, **Consumo interno** y **Otro**, más texto libre. El motivo se guarda como texto, sin catálogo cerrado. | [TÉCNICO] · motivos: [DECISIÓN] DEC-39 |
| BR-P11 | **Stock insuficiente en productos con conteo inicial:** la **venta** se bloquea si el producto no alcanza (422 con producto, saldo y cantidad pedida). El **mantenimiento** continúa y avisa aunque el saldo quede negativo: el producto ya se usó. | [DECISIÓN] DEC-26 |
| BR-P12 | **Productos sin conteo inicial:** se pueden vender y usar; la operación avisa que su stock no es confiable (BR-P8). | [DECISIÓN] DEC-27 |
| BR-P13 | **Proceso de carga del stock inicial** (conteo completo antes de empezar, o conteo progresivo producto por producto, quién lo hace y cuándo). El sistema soporta ambos sin cambios. | [DECISIÓN PENDIENTE] DEC-21 |
| BR-P14 | **Salidas por venta de producto.** El inventario las contempla como movimientos `SALE`/`SALE_VOID`: el saldo solo es fiel si toda salida física de un producto tiene su movimiento, sea por mantenimiento o por venta. Lo que se decide es **cuándo existe un punto de entrada** para registrar las ventas de producto (una salida solo de stock —producto y cantidad, sin precio ni pago— o la venta rápida completa de la Fase 2) y si Brigith vende productos sin mantenimiento y con qué frecuencia (C-03 confirma que vende lubricantes y filtros; no confirma si lo hace por separado). Mientras no exista, la diferencia entre el saldo y el estante se regulariza con un conteo (BR-P7). | [DECISIÓN PENDIENTE] DEC-24 |
| BR-P15 | Cada producto es una unidad de stock en la que se cuenta y se descuenta. La cantidad admite decimales. El aceite de balde se vende por partes o el balde completo: **formas de venta** opcionales por producto (octavo, cuarto, galón, balde…), cada una con su precio y lo que descuenta en la unidad de stock (para el granel, galones). Solo en Vender; el mantenimiento sigue en la unidad del producto. Qué formas tiene cada producto y la capacidad de cada balde no se asumen: las configura el dueño en la ficha. | Aceite de balde: [CONFIRMADO] (`10-OPERACION-REAL.md` §0.4) · formas de venta: [DECISIÓN] DEC-91 · formas y capacidad de cada producto: dato del dueño |
| BR-P23 | **Envase abierto (aceite de balde):** el contenido disponible es el saldo del producto en litros. Un balde lleno trae 20 L (5 galones). Se vende solo por 1/4 de galón (1 L) y 1/8 de galón (0.5 L); cada venta resta esos litros del contenido. El precio lo decide el dueño en cada venta y puede variar; no hay precio fijo obligatorio y el descuento de litros no depende del precio. Si no alcanza, no se vende. En 0 el balde está agotado. Con varios baldes, el abierto es el que tiene lo que sobra de los llenos. | [CONFIRMADO] por el negocio (2026-10-06) · [DECISIÓN] DEC-93 |
| BR-P22 | La unidad de stock es un nombre ("unidad", "galón", "litro"…), nunca solo un número. Los productos existentes con una unidad inválida siguen funcionando sin cambios hasta que el dueño la corrija; no se corrigen automáticamente. | [DECISIÓN] DEC-92 |
| BR-P16 | Por defecto un producto controla stock. Puede marcarse sin control de stock. | [TÉCNICO] |
| BR-P17 | Los precios de venta son opcionales en el catálogo. Ningún precio se asume. | [PENDIENTE] P-07 |
| BR-P18 | Categorías iniciales: **Lubricante** y **Filtro** (lo confirmado en C-03). Las categorías tienen como máximo 2 niveles (categoría → subcategoría) y son datos editables desde Configuración (crear, renombrar, mover, ordenar, desactivar); no hay taxonomía fija. | [TÉCNICO] · árbol inicial: [DECISIÓN] DEC-37 |
| BR-P19 | **Stock que requiere atención (R3):** agotados (saldo = 0), negativos (saldo < 0) y la cantidad de productos sin conteo inicial. Agotados y negativos solo consideran productos activos **con conteo**; los que no tienen conteo se cuentan aparte, porque su saldo no es confiable (BR-P8). No hay stock mínimo por producto. | [DECISIÓN] mapa funcional (DEC-28) · DEC-50 |
| BR-P19b | Marca, viscosidad, presentación, código, precio e imagen son **opcionales** en todo producto. Se ofrecen como sugerencias (valores ya usados y confirmados por el dueño); nunca se inventan ni se exigen. Sin imagen se muestra un placeholder. | [DECISIÓN] R2 · DEC-34 |
| BR-P21 | **Productos inactivos (R3, ampliada en R4):** no reciben recepciones ni ajustes, y **no se pueden vender**. Si una recepción o una venta incluye un producto inactivo, se rechaza completa (409 `PRODUCT_INACTIVE`). La regla aplica al crear la venta: una venta ya registrada se puede anular aunque el producto se haya desactivado después, y su `SALE_VOID` se genera igual. | [DECISIÓN] DEC-51 · venta: alcance de R4 (2026-09-26) |

## BR-F — Compatibilidad de filtros

| ID | Regla | Estado |
|---|---|---|
| BR-F1 | La compatibilidad es una relación explícita producto ↔ modelo de vehículo, creada o confirmada por un usuario. | [DECISIÓN] D-12 |
| BR-F2 | Registrar un mantenimiento o (en Fase 2) una venta **nunca** crea ni confirma una compatibilidad. | [DECISIÓN] D-12 |
| BR-F3 | La compatibilidad es informativa: nunca bloquea usar un producto en un mantenimiento. | [TÉCNICO] |
| BR-F4 | Cada compatibilidad guarda quién la confirmó y cuándo. | [TÉCNICO] |
| BR-F5 | Los códigos de filtros de aire y de aceite que dio el dueño, y las compatibilidades que indicó, son datos reales (`10-OPERACION-REAL.md` §0.4). Las compatibilidades que no dio no se cargan ni se suponen. | Códigos y compatibilidades dadas: [CONFIRMADO] · compatibilidades faltantes: [PENDIENTE] P-08 |
| BR-F6 | Nivel de detalle de la compatibilidad (marca y modelo; año; motor). El modelo de vehículo admite marca, año y motor opcionales, así que el nivel se define con datos, no con estructura; los textos del dueño se guardan tal cual en `model` ("Kia 2016"). | [DECISIÓN PENDIENTE] DEC-07 · [PENDIENTE] P-08 |
| BR-F7 | Un aviso "¿marcar como compatible?" al usar un filtro sin compatibilidad. | [DECISIÓN PENDIENTE] DEC-06 · **fuera del MVP** |

## BR-I — Indicadores del piloto

| ID | Regla | Estado |
|---|---|---|
| BR-I1 | **Adopción:** operaciones reales registradas en el período. En el MVP contaba solo mantenimientos no anulados. **Desde R7 (DEC-85)** cuenta, por separado: ventas de mostrador (`Sale` `ACTIVE` con `source = COUNTER`), lavados (`Sale` `ACTIVE` con `source = WASH`) y mantenimientos no anulados. El cobro de un mantenimiento no se cuenta aparte (sería contarlo dos veces). Muestra datos reales, sin porcentajes objetivo ni metas (BR-I4 sigue pendiente). | [DECISIÓN] Visión §6 · definición [DECISIÓN] DEC-85 (R7) |
| BR-I2 | **Mantenimiento:** mantenimientos con próximo km/fecha registrado y recordatorios enviados. "Enviados" se mide como avisos abiertos en WhatsApp (BR-R10). | [DECISIÓN] Visión §6 · definición [TÉCNICO] |
| BR-I3 | **Inventario:** stock actualizado mediante movimientos. Se mide como movimientos registrados y cantidad de productos con conteo y movimientos en el período. | [DECISIÓN] Visión §6 · definición [TÉCNICO] |
| BR-I4 | Umbrales de éxito de cada indicador. | [DECISIÓN PENDIENTE] (acordar con Brigith durante el piloto) |

## BR-D — Dashboard (R7)

Contrato cerrado el 2026-09-28, **sin implementar**. Decisiones DEC-78 a DEC-84 (`09-BACKLOG.md` §2).

| ID | Regla | Estado |
|---|---|---|
| BR-D1 | **Día operativo:** el día calendario en la zona horaria del negocio (`Business.timezone`; `America/Lima` en brigith), de 00:00 a 24:00 (`[inicio, fin)`). Una venta a las 23:30 de Lima cuenta en ese día aunque en UTC sea el día siguiente; una a las 00:10 cuenta en el día nuevo. **Semana:** de lunes a domingo. **Mes:** calendario. | [DECISIÓN] DEC-79 |
| BR-D2 | **Solo operaciones vigentes:** el dashboard suma ventas `ACTIVE` y cuenta mantenimientos `ACTIVE`. Lo anulado no aparece en cifras, series ni rankings. | [DECISIÓN] DEC-80 |
| BR-D3 | **Un solo libro de dinero:** todo ingreso sale de `Sale` (`10-OPERACION-REAL.md` §2.2), separado por origen: mostrador (`COUNTER`), lavado (`WASH`) y mantenimiento (`MAINTENANCE`, un solo monto, sin repartir entre producto y mano de obra). El ingreso se fecha con `Sale.occurredAt`; el de mantenimiento, con la hora del cobro (DEC-75). | [DECISIÓN] DEC-80 |
| BR-D4 | **Mantenimientos del período:** se cuentan por `Maintenance.performedAt`, tanto los cobrados como los **sin cobro**. El cobro no genera un segundo conteo de mantenimiento: su dinero pertenece solo a la venta `MAINTENANCE`, fechada por `Sale.occurredAt` (BR-D3). "Sin cobro" es un recordatorio, no un error (§2.2 de `10`). Un mantenimiento del lunes cobrado el martes cuenta como mantenimiento el lunes y como ingreso el martes. | [DECISIÓN] DEC-80 |
| BR-D5 | **Productos más vendidos:** las unidades vendidas salen de las líneas `PRODUCT` de ventas vigentes. Las unidades **consumidas en mantenimientos** salen de `inventory_movements` (`MAINTENANCE_USE` de mantenimientos vigentes) y se muestran aparte: son consumo de inventario, **no** suman a ventas ni a ingresos. | [DECISIÓN] DEC-81 |
| BR-D6 | **Sin métricas inventadas:** sin comparación con otro período, sin metas, sin stock mínimo (§0.1 de `10`) y sin cifras que el negocio no haya pedido. | [DECISIÓN] DEC-78 |
| BR-D7 | **Stock que requiere atención y recordatorios:** reutilizan las reglas existentes (BR-P19 y los recordatorios vencidos de BR-R5); el dashboard no define criterios nuevos. | [DECISIÓN] DEC-82 |

## BR-V — Ventas (Fase 2)

| ID | Regla | Estado |
|---|---|---|
| BR-V1 | Venta rápida: categorías → productos → carrito → pago → confirmar. Los productos se eligen del catálogo, no se escriben. No exige cliente ni placa. | [DECISIÓN] D-07, D-13, mapa funcional |
| BR-V2 | Métodos de pago confirmados: **Yape** y **efectivo**. | [CONFIRMADO] C-17 |
| BR-V3 | El cambio de aceite se cobra con **un único monto total** (producto + mano de obra). Los productos usados solo descuentan stock y no generan otro ingreso. Otros métodos de pago y ventas a crédito siguen sin definir. | Monto único: [CONFIRMADO] (`10-OPERACION-REAL.md` §0.2) · resto: [PENDIENTE] P-09 |
| BR-V4 | Cada producto vendido genera un movimiento de stock `SALE` con el mismo mecanismo del MVP (BR-P3, BR-P14). **Excepción:** un producto con `tracksStock = false` (BR-P16) se registra como línea de la venta (`movesStock = false`) pero **no** genera `SALE` ni se evalúa su saldo. | [TÉCNICO] · excepción: contrato de R4 (2026-09-26) |
| BR-V7 | Anular una venta exige un **motivo**, genera `SALE_VOID` de sus líneas que mueven stock y la saca de los totales. **Excepción (R6):** la venta de un cobro de mantenimiento (`source = MAINTENANCE`) no se anula por sí sola: se anula al anular su mantenimiento (BR-M12). | [TÉCNICO] · excepción: [DECISIÓN] DEC-70 (R6) |

## BR-L — Lavado (Fase 2)

| ID | Regla | Estado |
|---|---|---|
| BR-L1 | El lavado no exige interacción durante el trabajo. Sin Kanban ni estados de lavado. | [DECISIÓN] D-05 |
| BR-L2 | Registro rápido: tipo de lavado → precio → pago → confirmar. No pide cliente, placa ni el motivo del precio. | [DECISIÓN] D-14, D-07, mapa funcional |
| BR-L3 | No hay cierre del día: el dashboard "Hoy" hace de resumen. | [DECISIÓN] mapa funcional (reemplaza D-14 en este punto) |
| BR-L4 | Sin conteos manuales de cierre (consecuencia de BR-L3). | [DECISIÓN] mapa funcional · resuelve DEC-15 |
| BR-L5 | Volumen aproximado: 10 a 15 lavados diarios. | [CONFIRMADO] C-13 |
| BR-L6 | Tipos y precios: moto lineal S/8 o S/10 · mototaxi S/15 · Tico S/15 · auto S/15 · camioneta S/30 o S/40 · furgón S/30. Con dos montos, el dueño elige uno al ver el vehículo; el sistema no aplica criterio. Minibán, combi y moto carguera también son tipos del negocio, pero todavía **sin precio** [PENDIENTE]: se siembran activos y sin opciones de precio, y no se pueden cobrar hasta que el dueño defina su monto. | [CONFIRMADO] C-12 y `10-OPERACION-REAL.md` §0.3 (precios); tipos sin precio agregados por el usuario el 2026-09-26 |
| BR-L7 | Momento real del cobro y quién cobra. **Fuera de R5:** el lavado se registra cuando se confirma, con `occurredAt` enviable (DEC-58), sin asumir otro momento. | [PENDIENTE] P-11 |
| BR-L8 | Se atiende por orden de llegada; no se asume un módulo de citas ni de turnos. | [CONFIRMADO] C-19 · [HIPÓTESIS] H-11 |
| BR-L9 | Un lavado es una venta (`Sale` con `source = WASH` y una línea `WASH`) y **no mueve stock**, ni al registrarlo ni al anularlo. Se anula como cualquier venta, con motivo obligatorio (BR-V7). | [DECISIÓN] DEC-53, DEC-54, DEC-59 (R5) |
| BR-L10 | El precio de un lavado siempre sale de una opción de precio activa de su tipo; no se escribe un monto libre. Un tipo o una opción inactivos no se pueden cobrar. | [DECISIÓN] DEC-55 (R5) |
