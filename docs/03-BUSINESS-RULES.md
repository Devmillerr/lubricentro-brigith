# 03 — Reglas de negocio

**Versión:** 0.3 · **Actualizado:** 2026-09-21
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

Ninguna regla de este documento convierte una hipótesis en hecho. Los valores concretos de Brigith que aún no están transcritos (productos, códigos, precios) no aparecen aquí.

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
| BR-C10 | Vehículos sin placa, otros identificadores y clientes duplicados. | [PENDIENTE] (no registrado en Discovery; llevarlo a la próxima sesión con Brigith) |

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
| BR-M11 | Un mantenimiento guardado permite corregir campos que no afectan el stock (notas, km, próximo km/fecha, regla). Cambiar los productos o las cantidades se hace anulando y registrando uno nuevo. | [TÉCNICO] |
| BR-M12 | Anular un mantenimiento genera los movimientos inversos de sus productos (BR-P9) y descarta el recordatorio que había creado. Un mantenimiento anulado no cuenta para el último km conocido. | [TÉCNICO] |
| BR-M13 | Existe el tipo "Cambio de aceite". Otros tipos de mantenimiento no se crean por defecto. | [CONFIRMADO] C-03 · [PENDIENTE] P-17 |
| BR-M14 | Qué datos exactos lleva el sticker actual, y por lo tanto qué debe registrar un mantenimiento, se completa tras P-02. | [PENDIENTE] P-02, P-03 |

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
| BR-P6 | **Ingreso de mercadería** entra en el MVP: sin entradas el stock solo bajaría, y los aceites se reponen semanalmente. Solo registra producto, cantidad y fecha; no modela proveedores. | [TÉCNICO] (consecuencia de DEC-04; C-18) · qué otros productos se reponen: [PENDIENTE] P-16 |
| BR-P7 | **Stock inicial:** se carga con un `COUNT` por producto. Un `COUNT` registra la cantidad contada; el sistema guarda la diferencia contra el saldo calculado. Sirve igual para el conteo inicial y para recontar después. | [TÉCNICO] |
| BR-P8 | Un producto sin ningún `COUNT` está **sin conteo inicial**: sus movimientos se registran, pero su saldo no es confiable y no se evalúa stock insuficiente hasta el primer conteo. | [TÉCNICO] |
| BR-P9 | Anular un mantenimiento genera un movimiento `MAINTENANCE_VOID` por producto, con la cantidad opuesta. | [TÉCNICO] |
| BR-P10 | Los ajustes manuales (`ADJUSTMENT`) exigen un motivo escrito. | [TÉCNICO] |
| BR-P11 | **Stock insuficiente:** al guardar un mantenimiento, si un producto con conteo inicial quedaría con saldo negativo, el sistema lo detecta y lo informa con producto, saldo y cantidad pedida. Qué hace después lo define una configuración del negocio: `ALLOW_WITH_WARNING` (guarda y avisa) o `BLOCK` (no guarda). | [DECISIÓN PENDIENTE] DEC-05 |
| BR-P12 | Mientras DEC-05 no se decida, el sistema opera con `ALLOW_WITH_WARNING` como **valor provisional de configuración**, para no interrumpir el trabajo (D-05) con datos de inventario imperfectos. No es una decisión del negocio. | [TÉCNICO] provisional |
| BR-P13 | **Proceso de carga del stock inicial** (conteo completo antes de empezar, o conteo progresivo producto por producto, quién lo hace y cuándo). El sistema soporta ambos sin cambios. | [DECISIÓN PENDIENTE] DEC-21 |
| BR-P14 | **Salidas por venta de producto.** El inventario las contempla como movimientos `SALE`/`SALE_VOID`: el saldo solo es fiel si toda salida física de un producto tiene su movimiento, sea por mantenimiento o por venta. Lo que se decide es **cuándo existe un punto de entrada** para registrar las ventas de producto (una salida solo de stock —producto y cantidad, sin precio ni pago— o la venta rápida completa de la Fase 2) y si Brigith vende productos sin mantenimiento y con qué frecuencia (C-03 confirma que vende lubricantes y filtros; no confirma si lo hace por separado). Mientras no exista, la diferencia entre el saldo y el estante se regulariza con un conteo (BR-P7). | [DECISIÓN PENDIENTE] DEC-24 |
| BR-P15 | Cada producto es una unidad de stock en la que se cuenta y se descuenta. Cómo se modelan las presentaciones (por ejemplo, la misma marca en distintos tamaños), si hay venta por litro o a granel, y en qué unidad se descuenta cada producto. La cantidad admite decimales para no cerrar ninguna opción. | [DECISIÓN PENDIENTE] DEC-22 · [PENDIENTE] P-07 |
| BR-P16 | Por defecto un producto controla stock. Puede marcarse sin control de stock. | [TÉCNICO] |
| BR-P17 | Los precios de venta son opcionales en el catálogo. Ningún precio se asume. | [PENDIENTE] P-07 |
| BR-P18 | Categorías iniciales: **Lubricante** y **Filtro** (lo confirmado en C-03). Otras se agregan desde la app. | [TÉCNICO] |

## BR-F — Compatibilidad de filtros

| ID | Regla | Estado |
|---|---|---|
| BR-F1 | La compatibilidad es una relación explícita producto ↔ modelo de vehículo, creada o confirmada por un usuario. | [DECISIÓN] D-12 |
| BR-F2 | Registrar un mantenimiento o (en Fase 2) una venta **nunca** crea ni confirma una compatibilidad. | [DECISIÓN] D-12 |
| BR-F3 | La compatibilidad es informativa: nunca bloquea usar un producto en un mantenimiento. | [TÉCNICO] |
| BR-F4 | Cada compatibilidad guarda quién la confirmó y cuándo. | [TÉCNICO] |
| BR-F5 | Ningún código de filtro ni compatibilidad real está registrado en estos documentos. Cualquier ejemplo de compatibilidad usado al definir el producto es solo ilustrativo. | [CONFIRMADO] C-11 (existen códigos) · [PENDIENTE] P-08 (valores) |
| BR-F6 | Nivel de detalle de la compatibilidad (marca y modelo; año; motor). El modelo de vehículo admite año y motor opcionales, así que el nivel se define con datos, no con estructura. | [DECISIÓN PENDIENTE] DEC-07 · [PENDIENTE] P-08 |
| BR-F7 | Un aviso "¿marcar como compatible?" al usar un filtro sin compatibilidad. | [DECISIÓN PENDIENTE] DEC-06 · **fuera del MVP** |

## BR-I — Indicadores del piloto

| ID | Regla | Estado |
|---|---|---|
| BR-I1 | **Adopción:** operaciones reales registradas. En el MVP, cuenta mantenimientos no anulados del negocio real. | [DECISIÓN] Visión §6 · definición [TÉCNICO] |
| BR-I2 | **Mantenimiento:** mantenimientos con próximo km/fecha registrado y recordatorios enviados. "Enviados" se mide como avisos abiertos en WhatsApp (BR-R10). | [DECISIÓN] Visión §6 · definición [TÉCNICO] |
| BR-I3 | **Inventario:** stock actualizado mediante movimientos. Se mide como movimientos registrados y cantidad de productos con conteo y movimientos en el período. | [DECISIÓN] Visión §6 · definición [TÉCNICO] |
| BR-I4 | Umbrales de éxito de cada indicador. | [DECISIÓN PENDIENTE] (acordar con Brigith durante el piloto) |

## BR-V — Ventas (Fase 2)

| ID | Regla | Estado |
|---|---|---|
| BR-V1 | Venta rápida: producto → cantidad → pago. No exige cliente ni placa. | [DECISIÓN] D-07, D-13 |
| BR-V2 | Métodos de pago confirmados: **Yape** y **efectivo**. | [CONFIRMADO] C-17 |
| BR-V3 | Otros métodos de pago, ventas a crédito y cómo se cobra hoy un cambio de aceite (producto más mano de obra). | [PENDIENTE] P-09 |
| BR-V4 | Cada producto vendido genera un movimiento de stock `SALE` con el mismo mecanismo del MVP (BR-P3, BR-P14). | [TÉCNICO] |

## BR-L — Lavado (Fase 2)

| ID | Regla | Estado |
|---|---|---|
| BR-L1 | El lavado no exige interacción durante el trabajo. Sin Kanban ni estados de lavado. | [DECISIÓN] D-05 |
| BR-L2 | El registro rápido es opcional, al recibir o cobrar: tipo de lavado → precio → pago. Puede hacerse con o sin placa. | [DECISIÓN] D-14, D-07 |
| BR-L3 | Existe un cierre/resumen posterior del día. | [DECISIÓN] D-14 |
| BR-L4 | El cierre puede aceptar conteos manuales por tipo de lavado, sin vehículo. | [HIPÓTESIS] H-07 · [DECISIÓN PENDIENTE] DEC-15 |
| BR-L5 | Volumen aproximado: 10 a 15 lavados diarios. | [CONFIRMADO] C-13 |
| BR-L6 | Tipos de lavado y precios por tipo de vehículo. | [CONFIRMADO] C-12 (existen) · [PENDIENTE] P-10 (valores) |
| BR-L7 | Momento real del cobro y quién cobra. | [PENDIENTE] P-11 |
| BR-L8 | Se atiende por orden de llegada; no se asume un módulo de citas ni de turnos. | [CONFIRMADO] C-19 · [HIPÓTESIS] H-11 |
