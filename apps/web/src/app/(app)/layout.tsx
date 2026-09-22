'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { describeError } from '@/lib/api/errors';
import { loginPathFor } from '@/lib/auth/redirect';
import { retrySession, useSession } from '@/lib/auth/session';

/**
 * Rutas con sesión. La sesión vive en el navegador (tokens de la API), así
 * que la protección es del lado del cliente: sin sesión se va al login; si no
 * se pudo confirmar por red o servidor, se ofrece reintentar sin cerrarla.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status !== 'unauthenticated') return;
    router.replace(session.reason === 'logout' ? '/login' : loginPathFor(pathname));
  }, [session, router, pathname]);

  if (session.status === 'authenticated') {
    return <AppShell me={session.me}>{children}</AppShell>;
  }

  return (
    <main className="flex min-h-dvh flex-col px-4">
      {session.status === 'error' ? (
        <ErrorState
          title="No se pudo confirmar tu sesión"
          message={describeError(session.error)}
          onRetry={retrySession}
        />
      ) : (
        <LoadingState label={session.status === 'loading' ? 'Cargando…' : 'Redirigiendo…'} />
      )}
    </main>
  );
}
