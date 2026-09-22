'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker mínimo (public/sw.js): solo carcasa de la app y
 * pantalla "sin conexión" (04-ARCHITECTURE.md §8). No cachea datos de negocio.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // El registro es una mejora progresiva; si falla, la app sigue online.
      });
    }
  }, []);

  return null;
}
