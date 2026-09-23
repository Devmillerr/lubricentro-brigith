'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

function readStorage(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    // Almacenamiento no disponible (privado/bloqueado): se sigue sin borrador.
    return null;
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * Guarda un borrador de formulario en localStorage mientras se escribe, para
 * no perderlo si falla el envío por red (04-ARCHITECTURE.md §8, "los
 * formularios conservan lo escrito si falla el envío"). No es persistencia
 * de datos de negocio: solo evita retipear tras un error.
 *
 * El borrador guardado se lee como fuente externa (en el servidor no hay
 * borrador); lo que se escribe en esta pestaña tiene prioridad sobre él.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  initialValue: T,
): [T, (value: T) => void, () => void] {
  const storageKey = `brigith:draft:${key}`;
  const [edited, setEdited] = useState<T | null>(null);

  const raw = useSyncExternalStore(
    subscribeToStorage,
    () => readStorage(storageKey),
    () => null,
  );

  const stored = useMemo<T | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [raw]);

  const value = edited ?? stored ?? initialValue;

  function update(next: T) {
    setEdited(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignorar: el borrador es una comodidad, no un requisito.
    }
  }

  function clear() {
    setEdited(initialValue);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // no-op
    }
  }

  return [value, update, clear];
}
