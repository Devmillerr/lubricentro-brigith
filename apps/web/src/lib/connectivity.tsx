'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

const ConnectivityContext = createContext<boolean>(true);

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Detección de conexión para la carcasa PWA (04-ARCHITECTURE.md §8). Solo
 * informa al usuario; no cachea datos de negocio ni encola escrituras.
 * En el servidor se asume conexión para no mostrar el aviso en el HTML inicial.
 */
export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  return <ConnectivityContext.Provider value={isOnline}>{children}</ConnectivityContext.Provider>;
}

export function useOnlineStatus(): boolean {
  return useContext(ConnectivityContext);
}

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="w-full bg-[var(--accent)] px-4 py-2 text-center text-sm font-semibold text-[var(--accent-foreground)]"
    >
      Sin conexión. Lo que escribas se conserva; revisa tu red para guardar.
    </div>
  );
}
