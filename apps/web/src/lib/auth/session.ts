import { useSyncExternalStore } from 'react';
import { api, onSessionExpired, type Schemas } from '@/lib/api/client';
import { classifyError, type ClassifiedError } from '@/lib/api/errors';
import {
  clearTokens,
  onTokensChangedInOtherTab,
  readTokens,
  writeTokens,
} from '@/lib/auth/token-storage';

export type Me = Schemas['MeResponse'];

/** Por qué no hay sesión: nunca la hubo, venció, o el usuario la cerró. */
export type UnauthenticatedReason = 'none' | 'expired' | 'logout';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; me: Me }
  | { status: 'unauthenticated'; reason: UnauthenticatedReason }
  /** Hay tokens pero no se pudo confirmar la sesión (red o servidor): no se cierra. */
  | { status: 'error'; error: ClassifiedError };

const LOADING: SessionState = { status: 'loading' };

let state: SessionState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    onSessionExpired(() => setState({ status: 'unauthenticated', reason: 'expired' }));
    onTokensChangedInOtherTab(() => {
      const hasTokens = readTokens() !== null;
      if (!hasTokens && state.status !== 'unauthenticated') {
        // Otra pestaña cerró sesión.
        setState({ status: 'unauthenticated', reason: 'logout' });
      } else if (hasTokens && state.status === 'unauthenticated') {
        void loadSession();
      }
    });
    void loadSession();
  }
  return () => listeners.delete(listener);
}

/**
 * Estado de la sesión compartido por toda la app. En el servidor (prerender)
 * siempre es `loading`: la sesión solo existe en el navegador.
 */
export function useSession(): SessionState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
}

/** Confirma la sesión guardada con `GET /auth/me` (renueva el token si hace falta). */
async function loadSession(): Promise<void> {
  if (!readTokens()) {
    setState({ status: 'unauthenticated', reason: 'none' });
    return;
  }
  if (state.status !== 'loading') setState(LOADING);

  try {
    const { data, error, response } = await api.GET('/auth/me');
    if (data) {
      setState({ status: 'authenticated', me: data });
    } else if (response.status === 401) {
      clearTokens();
      setState({ status: 'unauthenticated', reason: 'expired' });
    } else {
      setState({ status: 'error', error: classifyError(error, false) });
    }
  } catch {
    setState({ status: 'error', error: { kind: 'network' } });
  }
}

export function retrySession(): void {
  void loadSession();
}

export type LoginResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid-credentials' | 'rate-limited' | 'validation' | 'network' | 'server';
    };

/** `POST /auth/login` y luego `GET /auth/me`, para dejar la sesión lista. */
export async function login(username: string, password: string): Promise<LoginResult> {
  let result;
  try {
    result = await api.POST('/auth/login', { body: { username, password } });
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!result.data) {
    const status = result.response.status;
    if (status === 401) return { ok: false, reason: 'invalid-credentials' };
    if (status === 429) return { ok: false, reason: 'rate-limited' };
    if (status === 400) return { ok: false, reason: 'validation' };
    return { ok: false, reason: 'server' };
  }

  writeTokens(result.data);
  await loadSession();
  const current = state as SessionState;
  if (current.status === 'authenticated') return { ok: true };
  return {
    ok: false,
    reason: current.status === 'error' && current.error.kind === 'network' ? 'network' : 'server',
  };
}

/**
 * `POST /auth/logout` invalida el token de refresco en la API. La sesión
 * local se cierra igual aunque la llamada falle (p. ej. sin red).
 */
export async function logout(): Promise<void> {
  const tokens = readTokens();
  if (tokens) {
    try {
      await api.POST('/auth/logout', { body: { refreshToken: tokens.refreshToken } });
    } catch {
      // Sin red: el token de refresco sigue válido en la API hasta que venza.
    }
  }
  clearTokens();
  setState({ status: 'unauthenticated', reason: 'logout' });
}
