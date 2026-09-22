# STATUS — Estado del proyecto

**Actualizado:** 2026-09-21

## Corte actual

**C0 — Base del proyecto.** Implementado y verificado localmente. **Aún sin commitear** (el repositorio no tiene ningún commit; los 125 archivos de C0 están en el working tree, actualmente en staging).

## Completado (C0)

Verificado en esta sesión: `apps/api` typecheck limpio (`tsc --noEmit`), 16/16 tests unitarios en verde (3 suites), `apps/web` compila (`next build`) sin errores.

| ID | Ítem |
|---|---|
| B-001 | Repositorio, lint, formato, CI (`.github/workflows/ci.yml`) |
| B-002 | Prisma + PostgreSQL: `apps/api/prisma/schema.prisma`, migraciones, seed (`prisma/seed.ts`, negocios "brigith" y "demo") |
| B-003 | Autenticación JWT (acceso y refresco) — `apps/api/src/auth/**` |
| B-004 | Contexto de negocio y capa de datos aislada — `apps/api/src/prisma/business-scope.ts` |
| B-005 | Pruebas de aislamiento entre negocios — `apps/api/test/business-scope.spec.ts` |
| B-006 | Swagger/OpenAPI + cliente tipado — `apps/api/scripts/generate-openapi.ts`, `apps/web/src/lib/api/generated/` (generado, gitignored) |
| B-007 | Formato uniforme de errores (Problem Details) — `apps/api/src/common/**` |
| B-008 | Idempotencia en escrituras críticas — `apps/api/src/idempotency/**` |
| B-009 | Carcasa PWA, detección de conexión y reintentos — `apps/web/src/app/register-sw.tsx`, `apps/web/src/app/offline/`, `apps/web/public/sw.js`, `apps/web/src/lib/connectivity.tsx` |

## Pendiente

- **B-010** (config abierta): configuración del negocio como valores editables. No implementado aún; no bloquea el resto de C0.
- **Commit inicial**: nada está commiteado todavía. Ver "Próximo paso".
- **C1 — Clientes y vehículos** (B-011 a B-014): CRUD de clientes, vehículos con normalización/unicidad de placa, búsqueda por placa, modelos de vehículo. No iniciado. No depende de ningún dato pendiente de Brigith.
- **C2 en adelante**: ver `docs/08-ROADMAP.md` y `docs/09-BACKLOG.md` §3 para el detalle completo por corte.

## Bloqueos

Ninguno bloquea C0 ni C1 (confirmado en `docs/09-BACKLOG.md` §1).

- **DEC-22** (modelado de presentaciones/unidad de producto): bloquea **C2** (catálogo) y **C3** (inventario) en lo que toca `Product.unit`. Pendiente de que Brigith confirme datos de productos y presentaciones (P-07).
- El resto de decisiones pendientes en `docs/09-BACKLOG.md` §2 son configuración de negocio o de proceso (p. ej. DEC-05 política de stock insuficiente, DEC-10 hosting) — se necesitan antes del piloto, no antes de programar.

## Último commit

Ninguno. `git log` reporta "your current branch 'master' does not have any commits yet".

## Próximo paso

1. Crear el commit inicial con todo el trabajo de C0 (repo, docs, `apps/api`, `apps/web`).
2. Empezar **C1 — Clientes y vehículos**: CRUD de clientes (nombre y teléfono opcionales), vehículos con placa (normalización y unicidad por negocio), modelos de vehículo (año y motor opcionales), búsqueda rápida por placa parcial.
