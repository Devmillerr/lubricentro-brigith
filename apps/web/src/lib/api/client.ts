import createClient, { type Middleware } from 'openapi-fetch';
import { clearTokens, readTokens, writeTokens } from '@/lib/auth/token-storage';
import type { components, paths } from './generated/schema';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Único módulo de acceso a la API en el frontend (04-ARCHITECTURE.md §8, DEC-12).
 * Los tipos salen del contrato OpenAPI (`pnpm api:generate`); rutas relativas a
 * `/api/v1`, p. ej. `api.GET('/customers', { params: { query: { search } } })`.
 * Toda llamada lleva el token de sesión y, si vence, se renueva en segundo
 * plano y se reintenta una vez (07-UI-UX.md §5, "Sesión vencida").
 */
export const api = createClient<paths>({ baseUrl, credentials: 'include' });

/** Esquemas del contrato, p. ej. `Schemas['CustomerResponse']`. No duplicar a mano. */
export type Schemas = components['schemas'];

/** Rutas que no llevan Bearer ni se reintentan tras renovar. */
const WITHOUT_SESSION = new Set(['/auth/login', '/auth/refresh']);

const sessionExpiredListeners = new Set<() => void>();

/** Se dispara cuando la API rechaza el token de refresco: hay que volver a iniciar sesión. */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

let refreshing: Promise<string | null> | null = null;

/**
 * Renueva el token de acceso con `POST /auth/refresh`. Un solo vuelo a la
 * vez: la API rota el token de refresco y, si uno ya rotado se vuelve a usar,
 * cierra todas las sesiones del usuario (auth.service.ts). Por eso las
 * llamadas simultáneas comparten la misma renovación y, entre pestañas, se
 * coordinan con Web Locks: si otra pestaña ya renovó, se usa su token.
 *
 * Devuelve el token nuevo, o null si no se pudo (sin sesión, rechazo o red).
 */
export function refreshAccessToken(failedAccessToken: string | null): Promise<string | null> {
  refreshing ??= withRefreshLock(() => performRefresh(failedAccessToken)).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request('brigith:auth-refresh', task);
  }
  return task();
}

async function performRefresh(failedAccessToken: string | null): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (failedAccessToken && tokens.accessToken !== failedAccessToken) {
    // Otra pestaña (u otra llamada) ya renovó mientras esperábamos el lock.
    return tokens.accessToken;
  }

  let result;
  try {
    result = await api.POST('/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
  } catch {
    // Error de red: la sesión no se cierra; el llamador ve el 401 original.
    return null;
  }

  if (result.data) {
    writeTokens(result.data);
    return result.data.accessToken;
  }
  if (result.response.status === 401) {
    clearTokens();
    sessionExpiredListeners.forEach((listener) => listener());
  }
  return null;
}

const pendingRequests = new Map<string, { retry: Request; accessToken: string | null }>();

const sessionMiddleware: Middleware = {
  onRequest({ request, schemaPath, id }) {
    if (WITHOUT_SESSION.has(schemaPath)) return undefined;
    const accessToken = readTokens()?.accessToken ?? null;
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
    pendingRequests.set(id, { retry: request.clone(), accessToken });
    return request;
  },
  async onResponse({ response, id }) {
    const pending = pendingRequests.get(id);
    pendingRequests.delete(id);
    if (!pending || response.status !== 401 || !pending.accessToken) return undefined;

    const renewed = await refreshAccessToken(pending.accessToken);
    if (!renewed) return undefined;

    const retry = new Request(pending.retry);
    retry.headers.set('Authorization', `Bearer ${renewed}`);
    return fetch(retry);
  },
  onError({ id }) {
    pendingRequests.delete(id);
    return undefined;
  },
};

api.use(sessionMiddleware);
