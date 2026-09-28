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
 *
 * `previousData` es el último resultado correcto de la **misma** `key`: permite
 * refrescar en segundo plano (`reload`) sin vaciar la pantalla mientras carga
 * o si el refresco falla (DEC-84). Con otra `key` no se arrastra.
 */
export function useApiQuery<T>(
  key: string | null,
  fetcher: () => Promise<ApiResult<T>>,
): QueryState<T> & { reload: () => void; previousData: T | undefined } {
  const fetcherRef = useRef(fetcher);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: QueryState<T> } | null>(null);
  const [lastSuccess, setLastSuccess] = useState<{ key: string; data: T } | null>(null);
  const requestKey = key === null ? null : `${key}#${attempt}`;

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (requestKey === null || key === null) return;
    let cancelled = false;
    fetcherRef.current().then((result) => {
      if (cancelled) return;
      setSettled({
        key: requestKey,
        state: result.ok
          ? { status: 'success', data: result.data }
          : { status: 'error', failure: result.failure },
      });
      if (result.ok) setLastSuccess({ key, data: result.data });
    });
    return () => {
      cancelled = true;
    };
    // `key` va dentro de `requestKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const state: QueryState<T> =
    settled && settled.key === requestKey ? settled.state : { status: 'loading' };
  const previousData = lastSuccess && lastSuccess.key === key ? lastSuccess.data : undefined;
  return { ...state, reload, previousData };
}
