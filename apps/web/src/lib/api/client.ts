import createClient from 'openapi-fetch';
import type { components, paths } from './generated/schema';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Único módulo de acceso a la API en el frontend (04-ARCHITECTURE.md §8, DEC-12).
 * Los tipos salen del contrato OpenAPI (`pnpm api:generate`); rutas relativas a
 * `/api/v1`, p. ej. `api.GET('/customers', { params: { query: { search } } })`.
 */
export const api = createClient<paths>({ baseUrl, credentials: 'include' });

/** Esquemas del contrato, p. ej. `Schemas['CustomerResponse']`. No duplicar a mano. */
export type Schemas = components['schemas'];
