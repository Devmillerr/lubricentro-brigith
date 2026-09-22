'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const ConnectivityContext = createContext<boolean>(true);

/**
 * Detección de conexión para la carcasa PWA (04-ARCHITECTURE.md §8). Solo
 * informa al usuario; no cachea datos de negocio ni encola escrituras.
 */
export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      className="w-full bg-[var(--danger)] px-4 py-2 text-center text-sm font-medium text-white"
    >
      Sin conexión. Lo que escribas se conserva; revisa tu red para guardar.
    </div>
  );
}
