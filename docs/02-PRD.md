# 02 — PRD (Documento de requisitos de producto)

**Versión:** 0.3 · **Actualizado:** 2026-09-21
Etiquetas: ver `03-BUSINESS-RULES.md`. Alcance: `01-VISION.md` §7 y §11. Reglas: `03-BUSINESS-RULES.md`.

## 1. Alcance del MVP (Fase 1) [DECISIÓN]

```
Cliente → Vehículo → Mantenimiento → Productos → Inventario → Recordatorio → WhatsApp
```

Un cambio de aceite debe poder:
1. identificar el vehículo (por placa, o registrarlo);
2. registrar los productos usados;
3. **descontar esos productos del stock mediante movimientos**;
4. definir el próximo mantenimiento (km, fecha o ambos);
5. generar un recordatorio y un enlace de WhatsApp para avisar al cliente.

### Dentro de la Fase 1

| # | Capacidad | Notas |
|---|---|---|
| F1-1 | Autenticación y negocio | Un negocio sembrado: Brigith. Sin auto-registro |
| F1-2 | Clientes | Nombre obligatorio; teléfono opcional |
| F1-3 | Vehículos | Búsqueda por placa. Cliente opcional |
| F1-4 | Catálogo de productos | Categorías, marca, código, unidad. Precios opcionales |
| F1-5 | Compatibilidad de productos | Relación explícita, creada o confirmada por el usuario |
| F1-6 | **Inventario** | Movimientos que actualizan el stock: conteo (stock inicial), ingreso, ajuste, descuento por mantenimiento y reverso por anulación |
| F1-7 | Mantenimientos | Fecha, km opcional, tipo, productos usados, próximo km/fecha configurable |
| F1-8 | Recordatorios | Lista "por avisar" derivada de los próximos mantenimientos |
| F1-9 | WhatsApp por enlace | `wa.me` con plantilla configurable. Envío siempre manual |
| F1-10 | Indicadores del piloto | Adopción, mantenimiento, inventario |
| F1-11 | PWA online | Instalable. Errores de conexión bien manejados |
| F1-12 | Swagger/OpenAPI | Desde el inicio |

### Fase 2 [DECISIÓN] DEC-08
Venta rápida y pagos (Yape/efectivo), lavado con registro rápido, recepción en lote, ajuste, cobro del mantenimiento como monto único y dashboard. Sin cierre del día. Diseño en `10-OPERACION-REAL.md` (alineado al mapa funcional).

### Fuera de alcance
Offline, WhatsApp API, facturación electrónica, IA, Kanban de lavado, SaaS con planes y facturación, aprendizaje automático de compatibilidades. Lista completa en `01-VISION.md` §8.

## 2. Flujos de usuario

### 2.1 Cambio de aceite (flujo principal)
**Placa (o cliente) → vehículo → mantenimiento.**
1. El usuario escribe la placa (la búsqueda ignora mayúsculas, guiones y espacios) o busca al cliente y elige uno de sus vehículos.
2. Si el vehículo existe, se ve su ficha. Si no, se crea con solo la placa.
3. Se elige el tipo de mantenimiento.
4. Se agregan los productos usados y sus cantidades.
5. Se ingresa el km (opcional) y el próximo mantenimiento (km, fecha, ambos o ninguno).
6. Se guarda. En la misma operación se descuenta el stock y se crea o actualiza el recordatorio.
7. Si hay teléfono, se ofrece "Avisar por WhatsApp".

### 2.2 Cliente nuevo
Se registra con su nombre, una sola vez. Las placas de sus vehículos se asocian cuando corresponda. El teléfono es opcional al registrar y solo se pide al enviar un WhatsApp (D-08).

### 2.3 Recordatorios
Lista de vehículos a los que corresponde avisar → "WhatsApp" abre el mensaje listo → el usuario lo envía → el recordatorio queda como contactado.

### 2.4 Inventario
- **Stock inicial:** contar cada producto (un conteo por producto).
- **Reposición:** registrar el ingreso de mercadería.
- **Descuadre:** contar de nuevo o ajustar con motivo.
- **Stock insuficiente al guardar un mantenimiento:** el sistema avisa; si guarda o no lo define DEC-05.

### 2.4.1 Consulta de filtro
Desde un vehículo, ver los productos con compatibilidad confirmada. Desde un producto, ver los modelos compatibles. Crear una compatibilidad es una acción explícita.

## 3. Requisitos funcionales

| ID | Requisito | Prioridad | Regla |
|---|---|---|---|
| RF-01 | Buscar vehículo por placa normalizada, con coincidencia parcial | Must | BR-C1, C6 |
| RF-02 | Crear un vehículo con solo la placa | Must | BR-C5 |
| RF-03 | Crear un cliente sin teléfono | Must | BR-C3 |
| RF-04 | Registrar un mantenimiento con 0 a n productos y cantidades | Must | BR-M8 |
| RF-05 | Guardar el mantenimiento como una operación indivisible | Must | BR-M10 |
| RF-06 | Definir próximo km, próxima fecha, ambos o ninguno | Must | BR-M2 |
| RF-07 | Elegir `ANY` o `ALL` cuando hay km y fecha | Must | BR-M5 |
| RF-08 | Crear o actualizar el recordatorio al guardar | Must | BR-R1, R2 |
| RF-09 | Listar recordatorios que corresponde avisar, con motivo | Must | BR-R3 a R6 |
| RF-10 | Generar el enlace de WhatsApp con la plantilla del negocio | Must | BR-W1 a W5 |
| RF-11 | Crear, confirmar y quitar compatibilidades de forma explícita | Must | BR-F1, F2 |
| RF-12 | Descontar del stock los productos de cada mantenimiento | Must | BR-P5 |
| RF-13 | Registrar conteo físico (stock inicial y recuentos) | Must | BR-P7 |
| RF-14 | Registrar ingreso de mercadería | Must | BR-P6 |
| RF-15 | Registrar ajustes con motivo | Must | BR-P10 |
| RF-16 | Detectar y informar stock insuficiente, con política configurable | Must | BR-P11 |
| RF-17 | Anular un mantenimiento y revertir su stock | Must | BR-M12, P9 |
| RF-18 | Avisar sin bloquear por km o fechas inconsistentes | Should | BR-M7 |
| RF-19 | Mostrar los indicadores del piloto | Must | BR-I1 a I3 |
| RF-20 | Configurar plantilla, anticipación, regla por defecto, política de stock y código de país | Must | BR-M5, R5, W3, P11 |
| RF-21 | Importar clientes y vehículos | Could | P-01 |

## 4. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF-01 | Mobile-first, pensado desde 360 px de ancho, objetivos táctiles cómodos |
| RNF-02 | Errores de conexión: mensaje claro, reintento, sin perder lo escrito y sin duplicar registros |
| RNF-03 | Aislamiento por negocio, verificado con pruebas |
| RNF-04 | La meta de 5 s es un objetivo de uso, aún sin medir (D-02) |
| RNF-05 | Seguridad: JWT, contraseñas con hash, validación de entradas, CORS restringido |
| RNF-06 | Costo: dentro de planes gratuitos, verificando condiciones vigentes (DEC-10) |
| RNF-07 | Trazabilidad: quién y cuándo en los registros de negocio |
| RNF-08 | Integridad del inventario: saldo igual a la suma de movimientos; movimientos inmutables |
| RNF-09 | Datos personales: mínimo necesario. Requisitos legales por confirmar (P-14) |

## 5. Indicadores del piloto [DECISIÓN]

1. **Adopción:** operaciones reales registradas.
2. **Mantenimiento:** próximos mantenimientos registrados y recordatorios enviados (medidos como avisos abiertos en WhatsApp).
3. **Inventario:** stock actualizado mediante movimientos.

Los umbrales de éxito se acuerdan con Brigith durante el piloto (BR-I4).

## 6. Puntos abiertos que afectan este PRD

DEC-01, DEC-03, DEC-05, DEC-21, DEC-22. Preguntas: P-02, P-03, P-04, P-05, P-07, P-08, P-13, P-16, P-17. Ver `09-BACKLOG.md` §2 y Discovery §4.
