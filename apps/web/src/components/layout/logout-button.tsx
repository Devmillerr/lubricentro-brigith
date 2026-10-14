'use client';

import { LoaderCircle, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

/** Cerrar sesión: en la barra lateral (escritorio) y en Más → Cuenta (teléfono). */
export function LogoutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await logout();
    // El layout protegido redirige al login al quedar sin sesión.
  }

  const Icon = pending ? LoaderCircle : LogOut;
  return (
    <Button variant="outline" onClick={handleLogout} disabled={pending} className={className}>
      <Icon className={cn('mr-2 size-4', pending && 'animate-spin')} aria-hidden />
      {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </Button>
  );
}
