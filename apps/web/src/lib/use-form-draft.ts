'use client';

import { useEffect, useState } from 'react';

/**
 * Guarda un borrador de formulario en localStorage mientras se escribe, para
 * no perderlo si falla el envío por red (04-ARCHITECTURE.md §8, "los
 * formularios conservan lo escrito si falla el envío"). No es persistencia
 * de datos de negocio: solo evita retipear tras un error.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  initialValue: T,
): [T, (value: T) => void, () => void] {
  const storageKey = `brigith:draft:${key}`;
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      // Almacenamiento no disponible (privado/bloqueado): se sigue sin borrador.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function update(next: T) {
    setValue(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignorar: el borrador es una comodidad, no un requisito.
    }
  }

  function clear() {
    setValue(initialValue);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // no-op
    }
  }

  return [value, update, clear];
}
