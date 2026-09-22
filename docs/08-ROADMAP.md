# 08 — Roadmap

**Versión:** 0.3 · **Actualizado:** 2026-09-21
Etiquetas: ver `03-BUSINESS-RULES.md`. Sin fechas: no hay base para estimarlas. El alcance por fase sale de `01-VISION.md` §7 y §11.

## Fase 0 — Definición (actual)

- Documentación alineada: `/docs` y `/research`.
- Aprobación del conjunto de documentos, lo que incluye las decisiones [TÉCNICO].
- Transcripción de los valores confirmados por Brigith: productos y presentaciones (C-10), códigos de filtros (C-11) y precios de lavado (C-12).

**Salida:** documentos aprobados por escrito y decidido DEC-22 (cómo se modelan y descuentan los productos). Ver `09-BACKLOG.md` §1.

## Fase 1 — MVP: núcleo [DECISIÓN]

```
Cliente → Vehículo → Mantenimiento → Productos → Inventario → Recordatorio → WhatsApp
```

**Entra:** autenticación y negocio; clientes y vehículos; catálogo de productos; compatibilidad explícita; **inventario con movimientos que actualizan el stock desde el inicio** (conteo, ingreso, ajuste, descuento por mantenimiento); mantenimientos con productos y próximo km/fecha configurable; recordatorios; enlaces de WhatsApp; indicadores del piloto; PWA online.

**No entra:** venta rápida, lavado, cierre del día (Fase 2), offline, WhatsApp API, facturación electrónica.

### Cortes de implementación (orden sugerido)

| Corte | Contenido | Depende de |
|---|---|---|
| **C0. Base** | Repositorio, CI, Prisma, autenticación, contexto de negocio, aislamiento y sus pruebas, Swagger, formato de errores, idempotencia, carcasa PWA | Aprobación |
| **C1. Clientes y vehículos** | CRUD, normalización de placa, búsqueda por placa | C0 |
| **C2. Catálogo** | Categorías, productos, modelos, compatibilidad explícita | C0; DEC-22 para cerrar `unit` y presentaciones |
| **C3. Inventario** | Movimientos, saldo, conteo, ingreso, ajuste, política de stock insuficiente | C2 |
| **C4. Mantenimiento** | Reglas de vencimiento, mantenimiento indivisible con descuento de stock, anulación | C1, C3 |
| **C5. Recordatorios y WhatsApp** | Ciclo del recordatorio, lista "Avisar", enlace y historial de contactos | C4 |
| **C6. Piloto** | Indicadores, negocio demo, importación de datos reales, medición de tiempos | C5; P-01, P-07 |

C0 y C1 no dependen de ningún dato pendiente de Brigith.

**Salida de la Fase 1:**
- Brigith registra cambios de aceite reales en su teléfono, usando la app en lugar del sticker.
- Los tres indicadores del piloto se pueden leer en la app: adopción, mantenimiento e inventario.
- Los umbrales de éxito de cada indicador están acordados (BR-I4).
- Están decididos DEC-05 y DEC-21, y elegido el hosting (DEC-10).

## Fase 2 — Ventas y lavado [DECISIÓN] DEC-08

- Venta rápida: producto → cantidad → pago (Yape o efectivo). Descuenta stock con el mismo mecanismo del MVP.
- Lavado: registro rápido opcional al recibir o cobrar, sin estados.
- Cierre/resumen del día.
- Da el punto de entrada completo (con precio y pago) a las salidas por venta de producto, que el inventario ya contempla como `SALE` (BR-P14). Si DEC-24 incluye antes una salida solo de stock, la venta rápida la reutiliza.

**Depende de:** P-09, P-10, P-11, DEC-15.

## Más allá de la Fase 2

No está planificado. Solo se reabre con evidencia de uso:

| Tema | Se reabre si… |
|---|---|
| Offline | El uso real muestra pérdida de registros o falta de señal (D-10, H-02) |
| WhatsApp API | El envío manual resulta insuficiente (D-04) |
| Segundo negocio | Aparece un segundo negocio real (D-06) |

## Dependencias con información pendiente

| Fase / corte | Depende de |
|---|---|
| C2, C3 (modelo de producto) | P-07 (DEC-22) |
| C4 (formulario de mantenimiento) | P-02, P-03 (P-04 para el valor por defecto) |
| C5 | P-05, P-13 |
| C6 | P-01, P-07, P-08 |
| Fase 2 | P-09, P-10, P-11 |

## Riesgos de calendario

- Falta de tiempo de Brigith para las validaciones.
- Hosting gratuito inadecuado (DEC-10).
- Carga inicial de datos: clientes, vehículos, productos y **conteo inicial de stock** (DEC-21). El inventario es visual hoy (C-16), así que no existen cifras de partida.
- Salidas por venta de producto sin un punto de entrada definido: el saldo pierde fiabilidad si Brigith vende productos sin mantenimiento (DEC-24).
