# Brigith

Sistema móvil (PWA mobile-first) para un lubricentro y lavado de vehículos en Perú. Primer cliente piloto: Brigith. Reduce el desorden operativo **sin interrumpir el trabajo**.

**Estado:** documentación aprobada. En implementación — corte **C0 (base del proyecto)** en curso. Ver [`docs/08-ROADMAP.md`](docs/08-ROADMAP.md) para los cortes siguientes.

## Documentos

Orden de lectura recomendado:

| # | Documento | Contenido |
|---|---|---|
| — | [`research/BRIGITH-DISCOVERY.md`](research/BRIGITH-DISCOVERY.md) | **Fuente de verdad** de lo que Brigith dijo: hechos, decisiones, hipótesis y pendientes |
| 01 | [`docs/01-VISION.md`](docs/01-VISION.md) | **Fuente de verdad** de producto: problema, usuario, solución, alcance |
| 03 | [`docs/03-BUSINESS-RULES.md`](docs/03-BUSINESS-RULES.md) | Reglas de negocio, cada una con su estado |
| 02 | [`docs/02-PRD.md`](docs/02-PRD.md) | Requisitos y flujos del MVP |
| 04 | [`docs/04-ARCHITECTURE.md`](docs/04-ARCHITECTURE.md) | Arquitectura y decisiones técnicas |
| 05 | [`docs/05-DATABASE.md`](docs/05-DATABASE.md) | Modelo de datos |
| 06 | [`docs/06-API.md`](docs/06-API.md) | Diseño de la API REST |
| 07 | [`docs/07-UI-UX.md`](docs/07-UI-UX.md) | Flujos y pantallas (sin diseño visual) |
| 08 | [`docs/08-ROADMAP.md`](docs/08-ROADMAP.md) | Fases y cortes de implementación |
| 09 | [`docs/09-BACKLOG.md`](docs/09-BACKLOG.md) | Bloqueos, registro de decisiones y backlog |

## Alcance en una mirada

- **MVP (Fase 1):** Cliente → Vehículo → Mantenimiento → Productos → **Inventario** → Recordatorio → WhatsApp. El stock se actualiza mediante movimientos desde el inicio.
- **Fase 2:** venta rápida, lavado y cierre del día.
- **Fuera de alcance:** offline, WhatsApp API, facturación electrónica, IA, Kanban de lavado, SaaS con planes y facturación.

## Stack

Next.js + TypeScript + Tailwind + shadcn/ui + PWA · NestJS + REST + JWT + Swagger · PostgreSQL + Prisma.

## Etiquetas usadas en los documentos

| Etiqueta | Significado |
|---|---|
| [CONFIRMADO] | Hecho dicho por Brigith |
| [DECISIÓN] | Decisión de producto aprobada |
| [TÉCNICO] | Decisión técnica adoptada; se aprueba con el conjunto de documentos |
| [HIPÓTESIS] | Sin validar; no se implementa como regla |
| [PENDIENTE] | Falta información de Brigith (P-xx) |
| [DECISIÓN PENDIENTE] | Falta que alguien decida |

## Desarrollo local

Requisitos: Node 22 (ver `.nvmrc`), pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # ajusta DATABASE_URL, secretos JWT y SEED_OWNER_PASSWORD
cp apps/web/.env.example apps/web/.env
pnpm --filter @brigith/api prisma:generate
pnpm --filter @brigith/api prisma:migrate   # crea las tablas de C0 en tu Postgres local
pnpm --filter @brigith/api prisma:seed      # negocio "brigith" + "demo"
pnpm dev:api                                # http://localhost:4000/api/v1 · Swagger en /api/docs
pnpm dev:web                                # http://localhost:3000
```

## Producción

Todo en planes gratuitos, sin métodos de pago asociados (DEC-89):

| Pieza | Dónde | URL |
| --- | --- | --- |
| Web (Next.js) | Vercel, proyecto `brigith`, raíz `apps/web` | https://lubricentro-brigith.vercel.app |
| API (NestJS) | Vercel, proyecto `brigith-api`, raíz `apps/api` | https://brigith-api.vercel.app/api/v1 (salud: `/health`) |
| Base de datos | Supabase Free, `us-east-1` | — |

- **Despliegue:** cada push a `main` despliega ambos proyectos (la configuración de build está en `apps/*/vercel.json`). Otras ramas generan *previews* protegidas.
- **Variables de la API** (Vercel → `brigith-api` → Settings → Environment Variables): `DATABASE_URL` (pooler de transacciones de Supabase, puerto 6543), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` (URL de la web, separadas por coma), `RATE_LIMIT_STORE=database`, `TRUST_PROXY=1`. `NODE_ENV=production` lo pone Vercel.
- **Variables de la web:** `NEXT_PUBLIC_API_URL` (pública, no es secreto).
- **Migraciones:** no corren en el build. Se aplican a mano con `pnpm --filter @brigith/api prisma:deploy` y `DIRECT_URL` (session pooler, puerto 5432) en `apps/api/.env`.
- **Dominio propio (si el cliente lo contrata):** agregarlo en el proyecto `brigith` de Vercel y sumarlo a `CORS_ORIGIN` de `brigith-api` (y opcionalmente otro para la API, cambiando `NEXT_PUBLIC_API_URL`). Luego redesplegar.
- **Migrar a un hosting pagado:** la API es un servidor Node normal (`pnpm --filter @brigith/api build && pnpm --filter @brigith/api start`) con las mismas variables; con una sola instancia puede usarse `RATE_LIMIT_STORE=memory`. La base se mueve con `pg_dump`/`pg_restore` y se cambia `DATABASE_URL`.

## Antes de programar

El registro de decisiones y lo que bloquea el inicio están en [`docs/09-BACKLOG.md`](docs/09-BACKLOG.md) §1 y §2.
