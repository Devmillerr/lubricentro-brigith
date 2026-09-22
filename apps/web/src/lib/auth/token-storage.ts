import type { Schemas } from '@/lib/api/client';

export type TokenPair = Schemas['TokenPairDto'];

const STORAGE_KEY = 'brigith:session';

/**
 * Tokens de sesión tal como los devuelve `POST /auth/login` y `/auth/refresh`.
 * La API los entrega en el cuerpo (no hay cookie), así que se guardan en
 * `localStorage` para sobrevivir a recargas y compartirse entre pestañas. Si
 * el almacenamiento no está disponible (modo privado o bloqueado), se usa
 * memoria: la sesión dura lo que la pestaña.
 */
let memoryTokens: TokenPair | null = null;

export function readTokens(): TokenPair | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TokenPair>;
    return typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string'
      ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
      : null;
  } catch {
    return memoryTokens;
  }
}

export function writeTokens(tokens: TokenPair): void {
  memoryTokens = tokens;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
}

export function clearTokens(): void {
  memoryTokens = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

/** Avisa cuando otra pestaña inicia o cierra sesión. */
export function onTokensChangedInOtherTab(listener: () => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
