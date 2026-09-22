'use client';

import { Users } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { useSession } from '@/lib/auth/session';

/**
 * Inicio (07-UI-UX.md §3.1). Por ahora solo muestra datos reales de la sesión
 * (`GET /auth/me`) y el acceso a Clientes. La búsqueda por placa y "Nuevo
 * mantenimiento" llegan en los próximos pasos; no se muestran métricas que la
 * API no entrega.
 */
export default function DashboardPage() {
  const session = useSession();
  if (session.status !== 'authenticated') return null;
  const { user, business } = session.me;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <p className="text-sm text-[var(--muted-foreground)]">{business.name}</p>
        <h2 className="text-2xl font-semibold">Hola, {user.name}</h2>
      </section>

      <EmptyState
        title="La búsqueda por placa llega pronto"
        description="Mientras tanto, puedes registrar clientes y sus vehículos."
        action={
          <Link href="/clientes" className={buttonVariants()}>
            <Users className="mr-2 size-4" aria-hidden />
            Ir a clientes
          </Link>
        }
      />
    </div>
  );
}
