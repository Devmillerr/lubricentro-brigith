'use client';

import { useEffect, useState } from 'react';

/** Devuelve `value` recién cuando deja de cambiar durante `delayMs` (búsqueda mientras se escribe). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
