'use client';

import { Bell, ChartColumn, Droplets, ShoppingCart, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Figure } from '@/components/pilot/indicators-view';
import { PlateSearch } from '@/components/vehicles/plate-search';
import { buttonVariants } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { useSession } from '@/lib/auth/session';
import { describePeriod, periodFor } from '@/lib/pilot/period';

/**
 * Inicio (07-UI-UX.md §3.1). Muestra datos reales: la sesión (`GET /auth/me`),
 * la búsqueda por placa (`GET /vehicles/lookup`) y el resumen del mes de
 * `GET /pilot-indicators` (conteos, sin metas: BR-I4 pendiente).
 */
export default function DashboardPage() {
  const session = useSession();
  const [now] = useState(() => new Date());
  const period = periodFor('month', { from: '', to: '' }, now);
  const indicators = useApiQuery(`pilot:${period.from}|${period.to}`, () =>
    callApi(
      api.GET('/pilot-indicators', {
        params: { query: { from: period.from!, to: period.to! } },
      }),
    ),
  );

  if (session.status !== 'authenticated') return null;
  const { user, business } = session.me;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <p className="text-sm text-[var(--muted-foreground)]">{business.name}</p>
        <h2 className="text-2xl font-semibold">Hola, {user.name}</h2>
      </section>

      <PlateSearch />

      <section className="grid grid-cols-2 gap-3">
        <Link href="/ventas/nueva" className={buttonVariants({ size: 'lg' })}>
          <ShoppingCart className="mr-2 size-5" aria-hidden />
          Vender
        </Link>
        <Link href="/lavado" className={buttonVariants({ size: 'lg' })}>
          <Droplets className="mr-2 size-5" aria-hidden />
          Lavado
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-semibold">Este mes</h3>
          <span className="text-xs text-[var(--muted-foreground)]">{describePeriod(period)}</span>
        </div>
        {indicators.status === 'loading' && <LoadingState label="Cargando resumen…" />}
        {indicators.status === 'error' && (
          <ErrorState message={failureMessage(indicators.failure)} onRetry={indicators.reload} />
        )}
        {indicators.status === 'success' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure
              value={indicators.data.adoption.activeMaintenances}
              label="Mantenimientos registrados"
            />
            <Figure
              value={indicators.data.maintenance.remindersOpenedInWhatsApp}
              label="Avisos abiertos en WhatsApp"
            />
            <Figure value={indicators.data.inventory.totalMovements} label="Movimientos de stock" />
          </div>
        )}
        <Link href="/resumen" className={buttonVariants({ variant: 'outline' })}>
          <ChartColumn className="mr-2 size-4" aria-hidden />
          Ver resumen del piloto
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link href="/avisar" className={buttonVariants({ size: 'lg' })}>
          <Bell className="mr-2 size-4" aria-hidden />
          Avisar
        </Link>
        <Link href="/clientes" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          <Users className="mr-2 size-4" aria-hidden />
          Clientes
        </Link>
      </section>
    </div>
  );
}
