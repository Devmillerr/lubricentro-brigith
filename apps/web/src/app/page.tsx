'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoadingState } from '@/components/ui/states';
import { HOME_PATH } from '@/lib/auth/redirect';
import { useSession } from '@/lib/auth/session';

/** `/` solo decide a dónde ir: con sesión al inicio de la app; sin sesión, al login. */
export default function RootPage() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'authenticated' || session.status === 'error') {
      router.replace(HOME_PATH);
    } else if (session.status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [session.status, router]);

  return (
    <main className="flex min-h-dvh flex-col">
      <LoadingState />
    </main>
  );
}
