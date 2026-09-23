# STATUS — Estado del proyecto

**Actualizado:** 2026-09-22

## Corte actual

**Frontend del MVP (`apps/web`) completo: todas las pantallas de 07-UI-UX.md §3.** Backend C0–C6 cerrado (ver historial en `git log`; último commit de API: `d2625e8`, contrato OpenAPI + cliente tipado).

Pantallas commiteadas: sesión y shell (`935272d`), clientes y vehículos (`0cf1b40`), productos y compatibilidades (`503ab4d`), inventario (`aa360b5`), mantenimientos (`447e284`), Avisar + WhatsApp (`58eda28`).

**En el commit "feat(web): complete MVP dashboard and business settings":**

- **Resumen del piloto** (07-UI-UX.md §3.8): `/resumen`, `components/pilot/indicators-view.tsx`, `lib/pilot/period.ts`. Períodos: este mes, últimos 7/30 días, todo, fechas elegidas (validación desde ≤ hasta). Solo conteos de BR-I1 a BR-I3, sin metas ni colores (BR-I4 pendiente). Enlazado desde "Más" y desde Inicio.
- **Inicio** (§3.1): búsqueda por placa mientras se escribe (`components/vehicles/plate-search.tsx`, `GET /vehicles/lookup`, debounce 250 ms, misma normalización que BR-C6), resultado con vehículo, cliente, último mantenimiento, último km y próximo km/fecha, y **Nuevo mantenimiento** por resultado; si ninguna placa coincide completa, "Crear vehículo con esta placa". Resumen del mes (3 cifras) y accesos a Avisar y Clientes.
- **Vehículo sin cliente**: `/vehiculos/nuevo?placa=` (BR-C4); `VehicleForm` acepta `customerId: null` e `initialPlate`, y al crear sin cliente lleva a la ficha del vehículo.
- **Configuración** (§3.7): `/configuracion` (`app/(app)/configuracion/page.tsx`, `components/business/settings-form.tsx`, `lib/business/settings.ts`). `GET /business` + `PATCH /business/settings` con solo los campos cambiados; vaciar un campo envía `null`. Cada campo sin definir explica qué hace el sistema mientras tanto (BR-W4, BR-R5, BR-M5; código de país y moneda aún no se usan). Guardar deshabilitado sin cambios, "Guardando…", confirmación "Cambios guardados", errores 400 por campo, 404/red/servidor con mensaje, reintento de carga. Enlazada desde "Más".

**Verificación:** `typecheck` web limpio, `next build` OK (27 rutas), ESLint y Prettier limpios en los archivos tocados. `lint` global de web sigue con los 2 errores preexistentes (ver Pendiente). Sin pruebas automáticas en `apps/web`. **No probado en navegador contra la API real.** Configuración: comprobado contra la API real (Supabase, negocio `brigith`) `GET /business` 200, 401 sin token en GET y PATCH, PATCH inválido 400 con `errors[].field` iguales a los campos del formulario y sin cambiar `updatedAt`. No se ejecutó un guardado exitoso para no escribir en el negocio real.

## Pendiente

- **Inicio — estado del recordatorio**: §3.1 pide mostrarlo en el resultado, pero `GET /vehicles/lookup` no lo devuelve. Opciones: agregarlo a la respuesta de lookup (cambio de API + contrato) o dejarlo en la ficha. Sin decidir.
- **Prueba manual en navegador** de todas las pantallas contra la API real (requiere usuario y datos en el negocio "demo"; escritura en Supabase pendiente de autorización).
- **Rate limit** (sin modificar): `ttl 60 s / limit 20` por IP y por endpoint, en memoria; 429 con `code: HTTP_ERROR` y texto en inglés, sin documentar; `Retry-After` no expuesto por CORS; `/auth/login` sin límite propio; sin `trust proxy` (DEC-10). La búsqueda por placa con debounce hace más llamadas a `/vehicles/lookup`: tenerlo en cuenta al decidir el límite.
- **`docs/06-API.md` no lista 6 endpoints que sí existen**: `GET/POST /vehicle-models`, `PATCH /vehicle-models/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`.
- **Mensajes de validación 400 en inglés** (class-validator): los formularios los muestran junto al campo tal cual. Poco probable en Configuración (el formulario valida antes), pero visible si ocurre.
- **Lint de `apps/web`**: 2 errores preexistentes de `fe6959e` (`connectivity.tsx:15`, `use-form-draft.ts:21`, `setState` síncrono en un efecto). Hacen fallar el paso "Lint" de CI.
- **Paso de CI** `pnpm api:generate`: verificado localmente, no en CI real.
- **Sincronización del recordatorio** (`d269493`): probada con el fake de Prisma, no contra Postgres real.
- Ítems que dependen de Brigith (no de código): B-021/B-030/B-042 (DEC-22), B-023 (P-07, P-08), B-046 (P-02, P-03), B-053 / BR-W5 (P-01), B-061 (P-01), B-063 / BR-I4 (umbrales).
- `docs/09-BACKLOG.md` marca B-010 como "Config abierta"; cambiar ese estado queda a criterio del usuario.

## Bloqueos

- Ninguno para terminar el frontend. DEC-22 sigue abierto (descuento de productos por unidad/presentación); C2–C4 usan el modelo provisional.
- Antes del piloto: decisiones de `docs/09-BACKLOG.md` §2 (DEC-01, DEC-03, DEC-05, DEC-10 hosting, P-01, P-13) y el rate limit.

## Último commit

"feat(web): complete MVP dashboard and business settings" (Inicio con búsqueda por placa, Resumen del piloto, Configuración, navegación y este `STATUS.md`), sobre `58eda28` — "feat(web): add reminders and whatsapp". Sin push. La migración `20260922200000_idempotency_key_per_endpoint` está aplicada en Supabase: no borrarla ni renombrarla.

## Próximo paso

1. Prueba manual en navegador de todo el flujo (incluido un guardado real de Configuración, con autorización).
2. Decidir el estado del recordatorio en la búsqueda por placa y el rate limit; luego prueba manual completa contra la API real.
