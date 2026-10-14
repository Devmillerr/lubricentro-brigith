'use client';

import { ChevronRight, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useSession } from '@/lib/auth/session';
import { LogoutButton } from './logout-button';

/**
 * Más → Cuenta: quién usa BRIGITH, cambiar la contraseña y cerrar sesión. En
 * el teléfono es el único lugar de Cerrar sesión (la cabecera queda solo con
 * la marca); en escritorio también está en la barra lateral.
 */
export function AccountSection() {
  const session = useSession();
  const me = session.status === 'authenticated' ? session.me : null;

  return (
    <section aria-labelledby="account-title" className="flex flex-col gap-3">
      <h2 id="account-title" className="text-lg font-semibold">
        Cuenta
      </h2>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {me && (
          <div className="flex min-w-0 flex-col border-b border-[var(--border)] px-4 py-3">
            <span className="truncate font-semibold">{me.user.name}</span>
            <span className="truncate text-sm text-[var(--muted-foreground)]">
              @{me.user.username}
            </span>
          </div>
        )}
        <Link
          href="/cuenta/contrasena"
          className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--muted)]">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 font-semibold">Cambiar contraseña</span>
          <ChevronRight className="size-5 text-[var(--muted-foreground)]" aria-hidden />
        </Link>
      </div>
      <LogoutButton className="h-12 w-full" />
    </section>
  );
}
