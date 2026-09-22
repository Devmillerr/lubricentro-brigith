# 04 — Arquitectura

**Versión:** 0.3 · **Actualizado:** 2026-09-21
Etiquetas: ver `03-BUSINESS-RULES.md`. Este documento define **cómo** se construye lo que `03` y `01-VISION.md` definen.

## 1. Stack [DECISIÓN] D-11

| Capa | Tecnología |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui, PWA |
| Backend | NestJS, TypeScript, API REST, JWT, Swagger/OpenAPI |
| Base de datos | PostgreSQL con Prisma |

No se usa Supabase como backend. No se agrega ninguna otra tecnología de datos (sin cola, sin caché, sin base local en el navegador).

## 2. Vista general

```
 Teléfono (PWA instalada)
        │ HTTPS
        ▼
 Next.js (apps/web) ──── REST + JWT ────▶ NestJS (apps/api) ────▶ PostgreSQL
  interfaz y carcasa PWA                   módulos por dominio      (Prisma)
                                           Swagger: /api/docs
```

- El frontend **no** accede a la base de datos. Solo habla con la API.
- WhatsApp: el frontend abre un enlace `wa.me`. No hay integración de servidor (D-04).

## 3. Repositorio [TÉCNICO] DEC-09

Monorepo con dos aplicaciones independientes:

```
apps/web     Next.js
apps/api     NestJS
docs/        documentación
research/    descubrimiento
```

El frontend usa un cliente **tipado generado desde el OpenAPI** de la API. El contrato tiene una sola fuente de verdad.

## 4. Backend: módulos NestJS [TÉCNICO]

| Módulo | Responsabilidad |
|---|---|
| `auth` | Login, JWT de acceso y refresco |
| `business` | Negocio y configuración |
| `users` | Usuarios del negocio |
| `customers` | Clientes |
| `vehicles` | Vehículos, modelos y búsqueda por placa |
| `products` | Categorías y catálogo |
| `compatibility` | Relación producto ↔ modelo |
| `inventory` | Movimientos, saldos, conteos, ingresos, ajustes |
| `maintenance` | Mantenimientos, productos usados, anulación |
| `due-rules` | Reglas de vencimiento (módulo puro, sin acceso a datos) |
| `reminders` | Recordatorios, contactos y enlaces de WhatsApp |
| `indicators` | Indicadores del piloto (solo lectura) |
| *(Fase 2)* `sales`, `washes`, `daily-close` | Ventas, lavado y cierre |

Cada módulo: controlador → servicio → acceso a datos con Prisma. DTOs validados. Un módulo no lee tablas de otro: pide al servicio del otro módulo.

## 5. Multi-negocio [DECISIÓN] D-06 · mecanismo [TÉCNICO] DEC-13

- Toda tabla de negocio tiene `businessId`. Unicidades por negocio.
- El `businessId` sale del **token**. El cliente nunca lo envía (BR-G3).
- Una capa única de acceso a datos (extensión de Prisma o repositorio base) aplica el filtro por negocio. Ningún servicio escribe el filtro a mano.
- Pruebas de aislamiento obligatorias (§10).
- No se implementa: registro de negocios, planes, facturación, subdominios, usuarios en varios negocios, Row Level Security de Postgres (se puede añadir después sin cambiar el modelo).

## 6. Autenticación [TÉCNICO] DEC-11

- Login con usuario y contraseña → JWT de acceso corto + token de refresco.
- `POST /auth/login` recibe solo `{ username, password }`, sin negocio ni slug: `username` es único globalmente (DEC-25) y el `businessId` se resuelve del usuario encontrado, nunca lo envía el cliente (BR-G3).
- Contraseñas con hash (argon2 o bcrypt).
- Sin registro público.
- Un rol en el MVP: `OWNER`. Otros usuarios y permisos dependen de P-12; agregarlos no cambia la estructura.

## 7. Integridad de datos [TÉCNICO]

### 7.1 Operaciones indivisibles
Guardar un mantenimiento es **una transacción de base de datos** que:
1. valida el vehículo y los productos del negocio;
2. crea el mantenimiento y sus productos;
3. inserta un movimiento `MAINTENANCE_USE` por cada producto con control de stock;
4. evalúa stock insuficiente (política del negocio, BR-P11);
5. cierra el recordatorio anterior y crea el nuevo, si aplica.

Si cualquier paso falla, no se guarda nada. Anular un mantenimiento es igualmente una sola transacción (movimientos inversos y recordatorio descartado).

### 7.2 Concurrencia de stock
El saldo es la suma de movimientos. Para que la verificación de stock y la inserción no se crucen entre dos peticiones simultáneas, la transacción bloquea las filas de los productos involucrados. Con un solo dispositivo es un caso raro, pero es barato y evita errores silenciosos.

### 7.3 Idempotencia
Las escrituras críticas (mantenimientos y operaciones de inventario) exigen `Idempotency-Key`. Repetir la petición devuelve el resultado original y no duplica movimientos. Protege contra reintentos en redes inestables sin necesitar offline.

### 7.4 Movimientos inmutables
Los movimientos de inventario solo se insertan (BR-G5). Cualquier corrección es un movimiento nuevo.

### 7.5 Reglas de vencimiento aisladas
El módulo `due-rules` recibe datos (recordatorio, último km, fecha de hoy, días de anticipación) y devuelve si corresponde avisar y por qué. No toca la base de datos. Así las reglas de BR-M/BR-R se prueban solas, y cambiar lo que Brigith decida (DEC-01, DEC-03) es cambiar configuración o una función.

## 8. PWA online [DECISIÓN] D-10

**Se implementa:**
- Manifiesto e instalación en la pantalla de inicio.
- Service worker limitado a la carcasa de la app y a una pantalla "sin conexión".
- Detección de conexión y mensajes claros.
- Reintentos con espera creciente en lecturas.
- Escrituras seguras ante reintentos (§7.3).
- Los formularios conservan lo escrito si falla el envío.

**No se implementa:** IndexedDB, cola de escrituras sin conexión, sincronización, resolución de conflictos, caché de datos de negocio.

### Preparado para agregar offline después, sin implementarlo [TÉCNICO] DEC-12
Prácticas ya incluidas en el diseño:
1. IDs UUID que el cliente puede generar.
2. `Idempotency-Key` en escrituras críticas.
3. Fecha del hecho (`occurredAt`, `performedAt`) separada de la de registro.
4. Operaciones completas en una sola petición (un mantenimiento entero, no una cadena de llamadas).
5. Movimientos de inventario inmutables y sumables, que se combinan sin conflictos.
6. Un único módulo de acceso a la API en el frontend.

Se reabre solo si el uso real muestra pérdida de registros o imposibilidad de trabajar por falta de señal (H-02).

## 9. Manejo de errores [TÉCNICO]

- API: formato uniforme (problem details), código HTTP correcto y un `code` estable para el frontend. Los avisos de negocio (`warnings`) no bloquean.
- Frontend: distingue error de red (reintentar), validación (mostrar el campo), sesión vencida (renovar o volver a iniciar sesión sin perder el formulario) y error del servidor (mensaje simple y reintento).

## 10. Calidad [TÉCNICO]

Pruebas que deben existir antes del piloto:

| Prueba | Qué protege |
|---|---|
| Aislamiento entre negocios | Un usuario de A no lee ni escribe datos de B |
| Suma de movimientos | Saldo = Σ movimientos; `COUNT` deja el saldo igual a lo contado |
| Transacción del mantenimiento | Falla a mitad ⇒ no queda nada guardado |
| Idempotencia | Repetir la petición no duplica mantenimiento ni movimientos |
| Anulación | Los movimientos inversos devuelven el saldo |
| Stock insuficiente | Con cada política (`ALLOW_WITH_WARNING`, `BLOCK`) y con producto sin conteo inicial |
| `due-rules` | `KM`, `DATE`, `ANY`, `ALL`, con y sin días de anticipación |
| Placa | Normalización y unicidad por negocio |
| Enlace de WhatsApp | Con y sin plantilla, con y sin teléfono |

Además: linter, formato y CI básico; migraciones Prisma versionadas; semillas.

## 11. Despliegue y costos [DECISIÓN PENDIENTE] DEC-10

Restricción: tecnologías gratuitas (D-03). Hay que **verificar las condiciones vigentes** de cada plan antes de elegir; cambian con frecuencia.

Riesgos a evaluar:
- **Arranque en frío:** algunos planes gratuitos apagan la API tras inactividad. La primera petición puede tardar segundos y rompería la meta de 5 s (D-02).
- **Términos de uso:** algunos planes gratuitos restringen el uso comercial.
- **Base de datos:** límites de almacenamiento, conexiones y pausa por inactividad.

Se decide hosting de web, API y PostgreSQL. No bloquea el desarrollo local; sí bloquea el piloto.

## 12. Puntos abiertos y dónde se resuelven

Ver `05-DATABASE.md` §7. Todos se resuelven con configuración o datos, no con cambios de arquitectura.
