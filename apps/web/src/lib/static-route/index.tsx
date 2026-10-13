'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore, type ReactNode } from 'react';

/** Export estático: el id real se lee de la URL del navegador (segmento `index`). */
export function useRouteId(index: number): string {
  const pathname = usePathname();
  const fromRouter = pathname.split('/').filter(Boolean)[index];
  if (fromRouter && fromRouter !== '_') return fromRouter;
  if (typeof window === 'undefined') return '_';
  return window.location.pathname.split('/').filter(Boolean)[index] ?? '_';
}

const noopSubscribe = () => () => {};

/**
 * No pinta la vista en el HTML exportado, solo en el navegador: así la página
 * con id comodín "_" nunca pide `/x/_` a la API.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return isClient ? <>{children}</> : null;
}
