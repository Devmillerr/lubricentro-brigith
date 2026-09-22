import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Único módulo de acceso a la API en el frontend (04-ARCHITECTURE.md §8, DEC-12). */
export const api = createClient<paths>({ baseUrl, credentials: 'include' });
