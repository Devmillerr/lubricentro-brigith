'use client';

import { useCallback, useRef } from 'react';

const STORAGE_PREFIX = 'brigith:idem:';

/**
 * Cuánto se recuerda una clave sin respuesta confirmada. Cubre el caso que
 * importa: la API guardó la operación pero la respuesta se perdió (red, app
 * cerrada, actualización) y el usuario la repite al volver. Pasado este
 * tiempo, la misma carga se trata como una operación nueva.
 */
const PENDING_TTL_MS = 10 * 60 * 1000;

type StoredKey = { key: string; at: number };

/**
 * `Idempotency-Key` para escrituras críticas (06-API.md §1, 04-ARCHITECTURE.md
 * §7.3). La misma operación reintentada (misma carga) reusa la misma clave,
 * así la API devuelve el resultado original en vez de duplicar el movimiento
 * (07-UI-UX.md §5). Si el usuario cambia los datos, es otra operación y lleva
 * clave nueva (reusar una clave con otro cuerpo da 409 IDEMPOTENCY_KEY_REUSED).
 *
 * La clave pendiente también se guarda en `sessionStorage` hasta el éxito:
 * si la página se recarga después de que la API guardó una venta, recepción o
 * pago pero antes de recibir la respuesta, repetirla no la duplica. Un error
 * de la API libera la clave en el servidor, así que reusarla es seguro.
 */
export function useIdempotencyKey() {
  const current = useRef<{ payload: string; key: string } | null>(null);

  const keyFor = useCallback((payload: unknown): string => {
    const serialized = JSON.stringify(payload);
    if (current.current?.payload !== serialized) {
      const storageKey = STORAGE_PREFIX + hashPayload(serialized);
      const key = readPending(storageKey) ?? crypto.randomUUID();
      writePending(storageKey, key);
      current.current = { payload: serialized, key };
    }
    return current.current.key;
  }, []);

  /** Tras un éxito: la próxima operación, aunque sea igual, es una nueva. */
  const reset = useCallback(() => {
    if (current.current) removePending(STORAGE_PREFIX + hashPayload(current.current.payload));
    current.current = null;
  }, []);

  return { keyFor, reset };
}

/** FNV-1a de 32 bits: solo identifica la carga, no es seguridad. */
function hashPayload(serialized: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + serialized.length.toString(36);
}

function readPending(storageKey: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredKey>;
    if (typeof stored.key !== 'string' || typeof stored.at !== 'number') return null;
    if (Date.now() - stored.at > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return stored.key;
  } catch {
    return null;
  }
}

function writePending(storageKey: string, key: string): void {
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({ key, at: Date.now() } satisfies StoredKey),
    );
  } catch {
    // Sin almacenamiento: la clave vive solo en memoria, como antes.
  }
}

function removePending(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // no-op
  }
}
