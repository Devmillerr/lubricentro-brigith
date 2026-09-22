# Brigith — Registro de descubrimiento

> Este documento es la **fuente de verdad sobre lo que el negocio realmente dijo**. Los demás documentos (`/docs`) no pueden afirmar como hecho nada que no esté en la sección 1.

## 0. Fuente y método

| Campo | Valor |
|---|---|
| Negocio | Brigith (lubricentro y lavado de vehículos, Perú) |
| Fuente | **Levantamiento directo con Brigith** mediante conversación presencial y WhatsApp, realizado por el desarrollador |
| Entrevista formal documentada | **No existe.** No hay guion, grabación ni transcripción de una entrevista estructurada |
| Última actualización | 2026-09-21 |

**Alcance de la evidencia:**
- Las respuestas de la sección 1 provienen de ese levantamiento directo. Llegan a este documento resumidas por el desarrollador, no como citas textuales.
- **No se registró qué respuesta vino por conversación presencial y cuál por WhatsApp.** Si los mensajes de WhatsApp se conservan, son la mejor evidencia textual y conviene pegarlos en la sección 6.
- Los valores concretos (productos, marcas, códigos, precios) aún no están transcritos aquí. Ver P-07, P-08 y P-10.
- Lo que falta no es hablar con Brigith, sino **documentar** el levantamiento y completar lo pendiente (guía en la sección 5).

Categorías usadas (exactamente cuatro):
- **Hecho confirmado**: lo que el negocio indicó.
- **Decisión de producto**: lo que el equipo decidió. No es un hecho del negocio.
- **Hipótesis**: creencia razonable, sin validar. No se implementa como regla.
- **Pendiente de confirmar**: información que falta.

---

## 1. Hechos confirmados

Fuente de C-01 a C-09: brief inicial y corrección 2 (origen en el levantamiento directo; canal exacto por hecho no registrado). Fuente de C-10 a C-19: respuestas de Brigith en el levantamiento directo (presencial/WhatsApp), resumidas por el desarrollador.

| ID | Hecho | Nota |
|---|---|---|
| C-01 | El negocio es un lubricentro con lavado de vehículos, en Perú. | |
| C-02 | El dueño atiende personalmente el negocio. | |
| C-03 | Vende lubricantes y filtros, realiza cambios de aceite y lava vehículos. | |
| C-04 | El inventario se controla visualmente. | Reconfirmado en C-16 |
| C-05 | Los filtros se recuerdan por códigos. | Ver C-11 |
| C-06 | Los cambios de aceite usan stickers físicos. | Ver C-14 |
| C-07 | Los clientes frecuentes ya tienen teléfono registrado. | Reconfirmado en C-15. Dónde y cómo: P-01 |
| C-08 | Durante el lavado no hay tiempo para usar el celular. | |
| C-09 | El próximo mantenimiento **depende del vehículo y su uso**. No existe un intervalo único. | |
| C-10 | Las marcas de lubricantes que maneja Brigith son **Repsol, Vistony y Valvoline**. | Brigith también mencionó productos y presentaciones concretos, pero **no están transcritos aquí** (P-07). Tampoco se sabe si esas tres son todas las marcas |
| C-11 | Brigith indicó los **códigos de filtros** que maneja. | **Los valores no están transcritos aquí.** Falta pegar la lista (P-08) |
| C-12 | Brigith indicó los **precios de lavado**. | **Los valores no están transcritos aquí.** Falta pegar tipos y precios (P-10) |
| C-13 | Se hacen aproximadamente **10 a 15 lavados diarios**. | Cifra aproximada dada por Brigith, no un conteo medido |
| C-14 | Se usa un **sticker** para indicar el próximo mantenimiento. | Qué datos lleva el sticker: P-02 |
| C-15 | Los clientes frecuentes tienen su teléfono registrado. | Dónde y cómo: P-01 |
| C-16 | El inventario es **visual**. | |
| C-17 | Los pagos se reciben por **Yape y efectivo**. | Si existen otros métodos: P-09 |
| C-18 | Los aceites se **reponen semanalmente**. | Qué otros productos, proveedor, cantidades y quién repone: P-16 |
| C-19 | Los clientes se atienden por **orden de llegada**. | Si aplica al lavado, al aceite o a ambos: P-19 |

## 2. Decisiones de producto (no son hechos del negocio)

| ID | Decisión | Origen |
|---|---|---|
| D-01 | PWA mobile-first, uso principal desde el teléfono. | Brief |
| D-02 | Meta: cada operación frecuente en menos de cinco segundos. Es una meta de diseño, aún no medida. | Brief |
| D-03 | Tecnologías gratuitas. | Brief |
| D-04 | Sin WhatsApp API por ahora. Se usarán enlaces `wa.me`. | Brief |
| D-05 | Sin obligar a registrar acciones durante el lavado. Sin Kanban ni estados de lavado. | Brief / corrección 7 |
| D-06 | Multi-negocio en la arquitectura desde el inicio, sin SaaS complejo. Brigith es el primer negocio. | Brief / corrección 8 |
| D-07 | La placa es entrada rápida y prioritaria, pero **no obligatoria** en todas las operaciones. | Corrección 1 |
| D-08 | El teléfono **no** es obligatorio al registrar un cliente nuevo. | Corrección 1 |
| D-09 | El intervalo de mantenimiento es configurable por registro (km, fecha o ambos). No hay valores por defecto. | Corrección 2 |
| D-10 | El MVP es una PWA **online** con buen manejo de errores de conexión. Sin offline, IndexedDB ni sincronización. | Corrección 3 |
| D-11 | Stack: Next.js + TypeScript + Tailwind + shadcn/ui + PWA · NestJS + REST + JWT + Swagger · PostgreSQL + Prisma. | Corrección 4 |
| D-12 | La compatibilidad filtro↔vehículo es una relación explícita, creada o confirmada por el usuario. Nunca se infiere automáticamente de una venta. | Corrección 5 |
| D-13 | El núcleo es Customer → Vehicle → Maintenance → Products → Inventory → Reminder → WhatsApp. Un cambio de aceite registra los productos usados y genera el próximo mantenimiento. El inventario se actualiza mediante movimientos desde el MVP. | Corrección 6; inventario desde el MVP aprobado en `01-VISION.md` §11 |
| D-14 | Lavado: registro rápido opcional al recibir o cobrar, más cierre/resumen posterior. | Corrección 7 |
| D-15 | No se escribe código hasta aprobación explícita. | Corrección 9 |

## 3. Hipótesis (sin validar; no se implementan como reglas)

| ID | Hipótesis | Cómo validarla |
|---|---|---|
| H-01 | La placa es el dato que el personal y los clientes tienen más a mano para identificar un vehículo. | Observar 10 atenciones reales |
| H-02 | Hay conexión a internet suficiente en el local para operar online. **Es la base de haber diferido offline.** | Preguntar a Brigith y probar la señal en el local |
| H-03 | El odómetro (km) se puede obtener en cada visita. | P-06 |
| H-04 | Un solo dispositivo/usuario (el dueño) usa el sistema al inicio. | P-12 |
| H-05 | Marca + modelo bastante para determinar la compatibilidad de un filtro. Puede requerir año o motor. | P-08 |
| H-06 | Un recordatorio por WhatsApp enviado manualmente es efectivo para que el cliente regrese. | Medir tras el piloto |
| H-07 | Brigith usaría un "cierre del día" para el lavado en lugar de registrar cada lavado. | P-10 |
| H-08 | Los teléfonos existentes son celulares peruanos, posiblemente sin código de país. | Revisar el registro real (P-01) |
| H-09 | El dueño usa el teléfono con una mano o con manos sucias: botones grandes y pocos pasos. | Observación |
| H-10 | La mayor parte del valor está en el recordatorio de mantenimiento, no en el inventario. | Entrevista + uso |
| H-11 | Atender por orden de llegada (C-19) implica que no hace falta un módulo de citas ni de turnos. | P-19 |
| H-12 | Con unos 10–15 lavados diarios (C-13), el registro individual al recibir/cobrar puede ser viable, pero solo si no interrumpe el trabajo. | Medir en el piloto; relacionado con H-07 |

## 4. Información pendiente de confirmar

Las preguntas siguen abiertas salvo lo ya cubierto por C-10 a C-19. Donde hay respuesta parcial, se indica qué queda pendiente.

| ID | Pregunta | Bloquea |
|---|---|---|
| P-01 | Se sabe que los clientes frecuentes tienen teléfono registrado (C-07, C-15). Falta: ¿dónde está registrado (cuaderno, Excel, contactos del celular, WhatsApp)? ¿Cuántos son? ¿Con o sin código de país? ¿Se importan? | Importación inicial |
| P-02 | Se sabe que el sticker indica el próximo mantenimiento (C-14). Falta: ¿qué datos lleva exactamente (fecha, km, próximo km, tipo de aceite, placa)? ¿Indica km, fecha o ambos? | Diseño del registro de mantenimiento |
| P-03 | ¿Cómo decide hoy el próximo mantenimiento? ¿Qué factores considera (vehículo, tipo de aceite, uso)? ¿Con qué palabras lo explica? | Regla de mantenimiento (BR-M) |
| P-04 | Si define km y fecha, ¿el aviso es cuando ocurre **lo primero** o cuando ocurren **ambos**? | DEC-01 |
| P-05 | ¿Con cuánta anticipación quiere avisar al cliente (días o km)? | DEC-03 |
| P-06 | ¿Pregunta el km en cada cambio de aceite? ¿El cliente siempre lo sabe? | Recordatorios por km |
| P-07 | Se conocen las marcas Repsol, Vistony y Valvoline (C-10). Falta: **transcribir los productos y presentaciones** que Brigith mencionó, con su precio si lo dio. ¿Son esas todas las marcas, incluyendo filtros y otros productos? ¿Se venden por unidad, litro o granel? | Catálogo y unidades |
| P-08 | Brigith ya indicó códigos de filtros (C-11). Falta: **transcribir los códigos**. ¿Qué determina que un filtro sirva para un vehículo (marca/modelo, año, motor)? ¿Cómo sabe hoy qué código va con qué vehículo? | DEC-07 |
| P-09 | Se sabe que se cobra por Yape y efectivo (C-17). Falta: ¿son los únicos métodos? ¿Alguna vez usa tarjeta u otro? ¿Fía a clientes? ¿Registra hoy los pagos de alguna forma? | Modelo de pagos (Fase 2) |
| P-10 | Brigith ya indicó precios de lavado (C-12) y un volumen aproximado (C-13). Falta: **transcribir tipos de lavado y precios**. ¿Hay diferencias de precio por tipo de vehículo? ¿Registra hoy cuántos lava al día o es una estimación? | Lavado / cierre |
| P-11 | ¿Cuándo ocurre el momento "recibir/cobrar" del lavado? ¿Quién cobra? | UX de lavado |
| P-12 | ¿Hay empleados que vayan a usar la app? ¿Qué debería poder hacer cada uno? | Roles |
| P-13 | ¿Qué mensaje de WhatsApp enviaría hoy a un cliente? (texto real, tono) | Plantilla |
| P-14 | ¿Los clientes aceptaron recibir avisos? ¿Hay requisitos legales de datos personales que cumplir? | Recordatorios; legal (verificar norma peruana de protección de datos) |
| P-15 | ¿Qué smartphone usa (marca, Android/iOS)? ¿Hay dispositivo compartido? | PWA; instalación |
| P-16 | Se sabe que los aceites se reponen semanalmente (C-18). Falta: ¿qué otros productos se reponen y con qué frecuencia (filtros, etc.)? ¿A qué proveedor(es)? ¿Quiere registrar el ingreso de mercadería? ¿Cómo decide cuánto pedir? | Inventario Fase 2 |
| P-17 | ¿Qué otros mantenimientos hace además del aceite (filtros, refrigerante, frenos)? | Catálogo de tipos de mantenimiento |
| P-18 | ¿Tiene otros lubricentros/sucursales en mente? ¿Conoce otros dueños interesados? | Multi-negocio real |
| P-19 | Se sabe que atiende por orden de llegada (C-19). Falta: ¿aplica al lavado, al cambio de aceite o a ambos? ¿Hay clientes que reservan o piden hora? ¿Qué pasa cuando hay varios vehículos esperando? | H-11; flujo de recepción |
| P-20 | ¿Se conservan los mensajes de WhatsApp del levantamiento? ¿Pueden pegarse tal cual en la sección 6? | Evidencia textual |

## 5. Guía de entrevista (para completar la sección 4)

1. Pedirle que **cuente un día típico** y observar 10 atenciones reales antes de preguntar.
2. Mostrarle un sticker real y pedirle que explique cada campo (P-02).
3. Pedirle tres ejemplos reales de "cuándo toca el próximo cambio" para vehículos distintos (P-03, P-04).
4. Ver el registro actual de teléfonos (P-01).
5. Pedirle el texto real de un mensaje de aviso (P-13).
6. Mostrar bocetos de pantallas (ver `/docs/07-UI-UX.md`) y anotar reacciones.

## 6. Respuestas textuales del dueño

*(Vacío. Aquí van las citas textuales, con fecha y canal (presencial/WhatsApp), de los mensajes de Brigith. Prioridad: la lista de productos y marcas (C-10), los códigos de filtros (C-11) y los tipos y precios de lavado (C-12), que están confirmados pero sin sus valores.)*

| Fecha | Pregunta | Respuesta textual | Promovida a |
|---|---|---|---|
| | | | |
