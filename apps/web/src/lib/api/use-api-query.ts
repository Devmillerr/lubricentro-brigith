'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiFailure, ApiResult } from './request';

export type QueryState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; failure: ApiFailure };

/**
 * Lectura simple con estados de carga, error y reintento. `key` identifica la
 * consulta (cambia → se vuelve a pedir); `null` la deja en espera. El resultado
 * se guarda junto a la clave que lo pidió, así una respuesta vieja nunca pisa
 * a una consulta nueva y "cargando" se deriva sin tocar estado en el efecto.
 */
export function useApiQuery<T>(
  key: string | null,
  fetcher: () => Promise<ApiResult<T>>,
): QueryState<T> & { reload: () => void } {
  const fetcherRef = useRef(fetcher);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: QueryState<T> } | null>(null);
  const requestKey = key === null ? null : `${key}#${attempt}`;

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (requestKey === null) return;
    let cancelled = false;
    fetcherRef.current().then((result) => {
      if (cancelled) return;
      setSettled({
        key: requestKey,
        state: result.ok
          ? { status: 'success', data: result.data }
          : { status: 'error', failure: result.failure },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const state: QueryState<T> =
    settled && settled.key === requestKey ? settled.state : { status: 'loading' };
  return { ...state, reload };
}
