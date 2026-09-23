'use client';

import { useCallback, useRef } from 'react';

/**
 * `Idempotency-Key` para escrituras críticas (06-API.md §1, 04-ARCHITECTURE.md
 * §7.3). La misma operación reintentada (misma carga) reusa la misma clave,
 * así la API devuelve el resultado original en vez de duplicar el movimiento
 * (07-UI-UX.md §5). Si el usuario cambia los datos, es otra operación y lleva
 * clave nueva (reusar una clave con otro cuerpo da 409 IDEMPOTENCY_KEY_REUSED).
 */
export function useIdempotencyKey() {
  const current = useRef<{ payload: string; key: string } | null>(null);

  const keyFor = useCallback((payload: unknown): string => {
    const serialized = JSON.stringify(payload);
    if (current.current?.payload !== serialized) {
      current.current = { payload: serialized, key: crypto.randomUUID() };
    }
    return current.current.key;
  }, []);

  /** Tras un éxito: la próxima operación, aunque sea igual, es una nueva. */
  const reset = useCallback(() => {
    current.current = null;
  }, []);

  return { keyFor, reset };
}
