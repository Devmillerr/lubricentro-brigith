# 01 — Visión de Brigith OS

**Estado:** borrador para aprobación (decisiones de alcance e indicadores aprobadas) · **Versión:** 0.4 · **Actualizado:** 2026-09-21
**Fuente de verdad:** [`/research/BRIGITH-DISCOVERY.md`](../research/BRIGITH-DISCOVERY.md). Los IDs entre paréntesis (C-xx, D-xx, H-xx, P-xx) remiten a ese documento. Este documento no afirma como hecho nada que no esté allí.

Etiquetas: **[CONFIRMADO]** hecho dicho por Brigith · **[DECISIÓN]** decisión de producto tomada · **[HIPÓTESIS]** sin validar · **[PENDIENTE]** falta información · **[PROPUESTA]** espera aprobación.

---

## 1. Qué es Brigith OS

Un sistema móvil (PWA mobile-first) para un lubricentro con lavado de vehículos en Perú. **[DECISIÓN]** D-01
Su primer cliente piloto es Brigith. La arquitectura debe soportar más negocios desde el inicio, sin construir todavía un SaaS complejo. **[DECISIÓN]** D-06

**Propósito:** reducir el desorden operativo **sin interrumpir el trabajo**. No se busca digitalizar por digitalizar. **[DECISIÓN]**

---

## 2. Problema real

### 2.1 Cómo trabaja hoy el negocio **[CONFIRMADO]**

- Es un lubricentro con lavado de vehículos; el dueño atiende personalmente. (C-01, C-02)
- Vende lubricantes (marcas Repsol, Vistony y Valvoline) y filtros; hace cambios de aceite y lava vehículos. (C-03, C-10)
- Se hacen aproximadamente **10 a 15 lavados diarios**. (C-13)
- Los clientes se atienden por **orden de llegada**. (C-19)
- Se cobra por **Yape y efectivo**. (C-17)
- El inventario se controla **visualmente**. (C-04, C-16)
- Los aceites se reponen **semanalmente**. (C-18)
- Los filtros se manejan por **códigos**. (C-05, C-11)
- El próximo cambio de aceite se indica con un **sticker físico**. (C-06, C-14)
- Los clientes frecuentes ya tienen **teléfono registrado**. (C-07, C-15)
- Durante el lavado **no hay tiempo** para usar el celular. (C-08)
- El próximo mantenimiento **depende del vehículo y su uso**; no hay un intervalo único. (C-09)

### 2.2 El problema, en una frase **[DECISIÓN]**

La información que sostiene la operación (qué se le hizo a cada vehículo, cuándo toca volver, qué filtro corresponde, cuánto queda en el estante) vive en la memoria del dueño y en objetos físicos, mientras el dueño no puede detenerse a registrar nada.

### 2.3 Lo que esto significa (lectura del equipo) **[HIPÓTESIS]**

Estas lecturas no fueron dichas por Brigith; hay que validarlas antes de tratarlas como problemas confirmados:

- El sticker solo sirve si el cliente lo conserva y vuelve; el negocio no tiene forma de invitarlo a volver. (H-06, H-10)
- Depender de la memoria para códigos de filtros es frágil cuando cambian los vehículos atendidos. (H-05)
- El control visual del inventario no deja saber qué falta hasta que se mira el estante. (H-10)

---

## 3. Usuario principal

| Rol | Descripción | Estado |
|---|---|---|
| **Brigith, dueño-operador** | Atiende, vende, cambia aceite y lava. Usa la app desde su teléfono, con el tiempo muy limitado durante el trabajo. | [CONFIRMADO] C-02, C-08 |
| Empleados | Se desconoce si existen o usarán la app. | [PENDIENTE] P-12 |
| Clientes finales | No usan la app. Su contacto es un mensaje de WhatsApp enviado por el negocio. | [DECISIÓN] D-04 |

Hipótesis de uso: un solo dispositivo y usuario al inicio; uso con una mano y manos ocupadas o sucias. **[HIPÓTESIS]** H-04, H-09

---

## 4. Solución propuesta

Una aplicación que funciona principalmente desde el teléfono y organiza el trabajo alrededor de la cadena: **[DECISIÓN]** D-13

```
Cliente → Vehículo → Mantenimiento → Productos → Inventario → Recordatorio → WhatsApp
```

En términos de producto:

1. **Recordar el historial de cada vehículo**: qué mantenimiento se le hizo, con qué productos y cuándo corresponde el siguiente.
2. **Reemplazar el sticker como memoria**, sin eliminar la conversación con el cliente.
3. **Avisar al cliente por WhatsApp** mediante un mensaje pre-armado que el dueño envía; sin WhatsApp API. **[DECISIÓN]** D-04
4. **Conocer los productos usados** en cada mantenimiento y **mantener el stock actualizado mediante movimientos** de inventario, en lugar del control visual de hoy. **[DECISIÓN]** D-13, aprobado en sección 11
5. **Consultar filtros** con compatibilidades que el usuario crea o confirma; nunca inferidas. **[DECISIÓN]** D-12
6. **Registrar ventas y lavados sin interrumpir el trabajo**: registro rápido al cobrar, sin cliente ni placa. El dashboard del día hace de resumen; no hay cierre posterior. **[DECISIÓN]** D-14, ajustada por el mapa funcional (ver `10-OPERACION-REAL.md`)

Lo que la solución **no** hace: decidir por el negocio cuándo toca el próximo mantenimiento. Esa regla depende del vehículo y su uso (C-09) y la define el usuario en cada caso. **[DECISIÓN]** D-09

---

## 5. Propuesta de valor **[HIPÓTESIS]**

Ninguna de estas promesas está validada; son lo que el piloto debe demostrar:

| Para el dueño | Base |
|---|---|
| Deja de depender del sticker y de la memoria para saber cuándo vuelve cada cliente. | C-14, H-06 |
| Puede avisar a un cliente en pocos toques, con un mensaje ya escrito. | D-04, H-06 |
| Encuentra rápido el filtro correcto para un vehículo ya confirmado. | C-11, D-12 |
| Ve qué productos gastó cada mantenimiento, base para saber qué reponer. | C-18, D-13 |
| No pierde tiempo: la app se adapta al flujo real y no le exige nada durante el lavado. | C-08, D-05, D-07 |

---

## 6. Objetivos del producto

1. **Registro sin fricción:** las operaciones frecuentes deben tomar menos de cinco segundos. **[DECISIÓN]** D-02. Es una meta de diseño; aún no se ha medido ni definido por operación.
2. **Mantenimiento con regla propia:** guardar el próximo kilometraje, la próxima fecha o ambos, según el vehículo. Sin intervalos por defecto. **[DECISIÓN]** D-09
3. **Recordatorios accionables:** saber a quién corresponde avisar y hacerlo por WhatsApp. **[DECISIÓN]** D-04, D-13
4. **Inventario actualizado por movimientos:** el stock se actualiza mediante movimientos de inventario desde el inicio del MVP. **[DECISIÓN]** D-13, aprobado en sección 11
5. **Nada obligatorio durante el lavado.** **[DECISIÓN]** D-05
6. **Adaptarse al flujo real:** la placa es un atajo, no un requisito; el teléfono es opcional. **[DECISIÓN]** D-07, D-08
7. **Multi-negocio en la arquitectura, sin SaaS complejo.** **[DECISIÓN]** D-06

Indicadores del piloto: **[DECISIÓN]**
1. **Adopción:** operaciones reales registradas.
2. **Mantenimiento:** próximos mantenimientos registrados y recordatorios enviados.
3. **Inventario:** stock actualizado mediante movimientos.

---

## 7. Alcance inicial del MVP (Fase 1) **[DECISIÓN]** D-13, D-10

La Fase 1 construye el **núcleo**, no solo el reemplazo del sticker.

**Entra:**
- Clientes y vehículos, con la placa como atajo (no obligatoria) y el teléfono opcional.
- Registro de mantenimiento (cambio de aceite y otros por definir), con los **productos usados**.
- **Próximo mantenimiento** configurable: km, fecha o ambos.
- **Recordatorios** de mantenimiento y **enlace de WhatsApp** con mensaje pre-armado.
- Catálogo de productos y **compatibilidad explícita** de filtros.
- **Inventario**: los movimientos de inventario actualizan el stock desde el inicio. **[DECISIÓN]** DEC-04
- PWA **online**, con manejo correcto de errores de conexión.
- Preparación para varios negocios; Brigith es el primero.

**Queda para la Fase 2** **[DECISIÓN]** DEC-08:
- Venta rápida y pagos (Yape/efectivo).
- Lavado: registro rápido (tipo → precio → pago → confirmar). Sin cierre del día: el resumen lo da el dashboard.
- Diseño de la Fase 2: `10-OPERACION-REAL.md`, alineado al mapa funcional.

Lo que aún condiciona el alcance: P-01 (dónde están los teléfonos), P-02 (qué lleva el sticker), P-03/P-04 (cómo se decide el próximo mantenimiento), P-07/P-08 (productos y códigos concretos) y P-13 (mensaje de aviso).

---

## 8. Fuera de alcance

**Del MVP, por decisión:** **[DECISIÓN]**
- Offline, IndexedDB, sincronización y resolución de conflictos. Se prepara la arquitectura, pero no se implementa hasta que el uso real lo justifique. (D-10)
- WhatsApp API. (D-04)
- Sistema SaaS complejo: auto-registro de negocios, planes y facturación. (D-06)
- Kanban o estados de trabajo durante el lavado. (D-05)
- Aprendizaje automático de compatibilidades: una venta nunca crea una compatibilidad. (D-12)
- Intervalos de mantenimiento predeterminados. (D-09)

**No tratado, por lo tanto no asumido:**
- Facturación electrónica o integración tributaria.
- Citas o turnos previos: se atiende por orden de llegada (C-19); si aplica a todo el negocio, queda por confirmar (P-19, H-11).
- Otros métodos de pago además de Yape y efectivo (P-09).

---

## 9. Restricciones **[DECISIÓN]**

- Tecnologías gratuitas. (D-03)
- Prioridad a la experiencia móvil. (D-01)
- Stack definido (D-11); detalle en `04-ARCHITECTURE.md`.
- No se escribe código hasta aprobar la documentación. (D-15)

## 10. Riesgos de producto

| Riesgo | Efecto | Estado |
|---|---|---|
| La regla real de mantenimiento es más compleja que km/fecha | Recordatorios poco útiles | Se aclara con P-03, P-04 |
| Falta de tiempo del dueño para usar la app | Baja adopción | Registros opcionales y mínimos; medir en piloto |
| No se cargan los datos iniciales (clientes, vehículos, productos) | Sistema vacío al arrancar | Depende de P-01, P-07, P-08 |
| La conexión del local es insuficiente | Una PWA online no sirve | Hipótesis H-02; medir antes de asumir |
| Los planes gratuitos limitan la calidad del servicio | Se rompe la meta de 5 s | Ver DEC-10 |

---

## 11. Decisiones aprobadas

1. **Lavado y venta rápida (DEC-08):** Fase 2.
2. **Inventario (DEC-04):** entra al MVP; los movimientos de inventario actualizan el stock desde el inicio.
3. **Indicadores del piloto (sección 6):** adopción, mantenimiento e inventario, según se listan arriba.
