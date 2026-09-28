'use client';

import { useMemo, useRef } from 'react';

/**
 * Candado de envío (07-UI-UX.md §5: "el botón no se puede pulsar dos veces").
 * El `disabled` del botón depende del estado de React, que no se actualiza
 * entre dos clics seguidos: el segundo clic ve todavía el estado viejo y
 * dispara otra petición. Un `ref` cambia en el acto y la frena.
 *
 * Uso: `if (!lock.acquire()) return;` justo antes de llamar a la API y
 * `.finally(lock.release)` sobre la llamada (`callApi` no lanza).
 */
export function useSubmitLock(): { acquire: () => boolean; release: () => void } {
  const locked = useRef(false);
  return useMemo(
    () => ({
      acquire: () => {
        if (locked.current) return false;
        locked.current = true;
        return true;
      },
      release: () => {
        locked.current = false;
      },
    }),
    [],
  );
}
