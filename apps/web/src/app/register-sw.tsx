'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Cada cuánto se pregunta si hay versión nueva mientras la app sigue abierta. */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * Registra el service worker (`/sw.js`, ver lib/pwa/service-worker-source.ts)
 * y avisa cuando hay una versión nueva de BRIGITH. Nunca recarga sola mientras
 * la app está en uso: el usuario elige cuándo actualizar, así no se pierde una
 * venta o un formulario a medio llenar.
 */
export function RegisterServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;
    let cancelled = false;

    const watchInstalling = (reg: ServiceWorkerRegistration) => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        // Solo es "actualización" si ya había una versión controlando la página.
        if (installing.state === 'installed' && container.controller && !cancelled) {
          setWaiting(installing);
        }
      });
    };

    container
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        // Una versión nueva que ya esperaba al abrir la app: esta página recién
        // cargada ya trae el código nuevo y no tiene nada a medio hacer, así que
        // se activa sin preguntar y sin recargar.
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', () => watchInstalling(reg));
      })
      .catch(() => {
        // Mejora progresiva: sin service worker la app sigue funcionando online.
      });

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', checkForUpdate);
    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_MS);

    const onControllerChange = () => {
      // Solo recarga si el usuario tocó "Actualizar" en esta pestaña.
      if (updateRequested.current) window.location.reload();
    };
    container.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', checkForUpdate);
      window.clearInterval(interval);
      container.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  const update = () => {
    updateRequested.current = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-[max(1rem,env(safe-area-inset-left))] md:bottom-6"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 pl-4 shadow-lg">
        <RefreshCw className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
        <p className="flex-1 text-sm">
          <span className="font-semibold">Hay una versión nueva de BRIGITH.</span>{' '}
          <span className="text-[var(--muted-foreground)]">Guarda lo que estés haciendo.</span>
        </p>
        <Button type="button" size="sm" className="h-11 shrink-0" onClick={update}>
          Actualizar
        </Button>
      </div>
    </div>
  );
}
