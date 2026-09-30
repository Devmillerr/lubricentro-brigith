'use client';

import {
  Droplets,
  LoaderCircle,
  PackagePlus,
  RotateCw,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import {
  AlertChips,
  AlertChipsSkeleton,
  Collapsible,
  DashboardSkeleton,
  IncomeSummary,
  Panel,
  SourceDetails,
  TopProducts,
} from '@/components/dashboard/dashboard-sections';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { Button } from '@/components/ui/button';
import { DocumentTitle } from '@/components/ui/document-title';
import { ErrorState } from '@/components/ui/states';
import { PlateSearch } from '@/components/vehicles/plate-search';
import { api } from '@/lib/api/client';
import { callApi, failureMessage } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { useSession } from '@/lib/auth/session';
import {
  PERIOD_OPTIONS,
  describeDashboardPeriod,
  type Dashboard,
  type DashboardPeriodKind,
} from '@/lib/dashboard/format';
import { cn } from '@/lib/utils';

/** Refresco mientras Inicio está visible (DEC-84). */
const REFRESH_MS = 60_000;
/** Separación mínima entre dos refrescos automáticos. */
const MIN_GAP_MS = 5_000;

/**
 * Inicio con el dashboard de R7 (07-UI-UX.md §3.1; `GET /dashboard`, 06-API.md
 * §2). Mobile-first a 390 px. Datos con `useApiQuery` (DEC-84): se vuelven a
 * pedir al volver a la pestaña, cada 60 s mientras está visible y al volver a
 * Inicio después de una operación (la pantalla se monta de nuevo). Ante un 429
 * no reintenta sola (07-UI-UX.md §5): espera a que el usuario toque Reintentar.
 */
export default function DashboardPage() {
  const session = useSession();
  const [kind, setKind] = useState<DashboardPeriodKind>('today');
  const dashboard = useApiQuery(`dashboard:${kind}`, () =>
    callApi(api.GET('/dashboard', { params: { query: { period: kind } } })),
  );
  const { reload } = dashboard;
  const rateLimited = dashboard.status === 'error' && dashboard.failure.status === 429;
  usePassiveRefresh(reload, !rateLimited);

  if (session.status !== 'authenticated') return null;
  const { user } = session.me;
  const data: Dashboard | undefined =
    dashboard.status === 'success' ? dashboard.data : dashboard.previousData;

  return (
    <div className="flex flex-col gap-5">
      <DocumentTitle title="Inicio" />
      {/* Orden: qué necesita atención → qué puedo hacer → qué está pasando. */}
      <h1 className="-mb-2 text-sm font-medium text-[var(--muted-foreground)]">
        Hola, {user.name}
      </h1>

      <PlateSearch />

      {data ? (
        <AlertChips reminders={data.reminders} stock={data.stock} />
      ) : (
        dashboard.status === 'loading' && <AlertChipsSkeleton />
      )}

      <nav aria-label="Acciones principales" className="grid grid-cols-4 gap-2">
        <ActionTile href="/ventas/nueva" icon={ShoppingCart} label="Vender" />
        <ActionTile href="/lavado" icon={Droplets} label="Lavado" />
        <ActionTile href="/mantenimientos/nuevo" icon={Wrench} label="Mantenimiento" />
        <ActionTile href="/inventario/recepciones/nueva" icon={PackagePlus} label="Recibir" />
      </nav>

      <section aria-labelledby="period-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 id="period-title" className="text-lg font-bold">
              Resumen
            </h3>
            <RefreshIndicator
              refreshing={dashboard.status === 'loading' && data !== undefined}
              onRefresh={reload}
            />
          </div>
          <PeriodSelector value={kind} onChange={setKind} />
          {data && data.period.kind === kind && (
            <p className="text-sm text-[var(--muted-foreground)] first-letter:uppercase">
              {describeDashboardPeriod(data.period)}
            </p>
          )}
        </div>

        {dashboard.status === 'error' && data && (
          <FormError>
            {rateLimited ? failureMessage(dashboard.failure) : 'No se pudo actualizar el resumen.'}{' '}
            <button type="button" className="font-medium underline" onClick={reload}>
              Reintentar
            </button>
          </FormError>
        )}

        {!data && dashboard.status === 'loading' && <DashboardSkeleton />}
        {!data && dashboard.status === 'error' && (
          <ErrorState message={failureMessage(dashboard.failure)} onRetry={reload} />
        )}
        {data && <DashboardBody data={data} />}
      </section>
    </div>
  );
}

function DashboardBody({ data }: { data: Dashboard }) {
  const empty = data.totals.salesCount === 0 && data.maintenances.count === 0;
  return (
    <div className="flex flex-col gap-3">
      {empty ? (
        <Panel>
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <p className="font-medium">Sin ventas en este período</p>
            <p className="max-w-xs text-sm text-[var(--muted-foreground)]">
              Cuando cobres con Vender, Lavado o un mantenimiento, aparecerá aquí.
            </p>
          </div>
        </Panel>
      ) : (
        <>
          <IncomeSummary totals={data.totals} />
          <SourceDetails
            totals={data.totals}
            washes={data.washes}
            maintenances={data.maintenances}
          />
          <Collapsible
            summary="Ver evolución"
            hint={data.period.kind === 'today' ? 'por hora' : 'por día'}
          >
            <RevenueChart
              key={`${data.period.kind}:${data.period.from}`}
              series={data.series}
              kind={data.period.kind}
              timeZone={data.period.timezone}
              periodTo={data.period.to}
            />
          </Collapsible>
          <TopProducts items={data.topProducts} />
        </>
      )}
    </div>
  );
}

/** Acción rápida: superficie del tema con borde sutil; el rojo Brigith solo en el ícono. */
function ActionTile({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-0.5 text-[var(--foreground)] transition-[background-color,transform] hover:bg-[var(--muted)] active:scale-[0.97]"
    >
      <Icon className="size-6 shrink-0 text-[var(--brand)]" aria-hidden />
      <span className="w-full truncate text-center text-xs leading-tight font-semibold tracking-tight">
        {label}
      </span>
    </Link>
  );
}

/** Hoy · Semana · Mes como control segmentado (un solo valor elegido). */
function PeriodSelector({
  value,
  onChange,
}: {
  value: DashboardPeriodKind;
  onChange: (kind: DashboardPeriodKind) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--muted)] p-1"
    >
      {PERIOD_OPTIONS.map((option) => {
        const selected = option.kind === value;
        return (
          <button
            key={option.kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.kind)}
            className={cn(
              'min-h-11 rounded-lg text-sm font-medium transition-colors',
              selected
                ? 'bg-[var(--segment-selected)] text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RefreshIndicator({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Button
      variant="outline"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={refreshing ? 'Actualizando' : 'Actualizar'}
      size="icon"
    >
      {refreshing ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <RotateCw className="size-4" aria-hidden />
      )}
    </Button>
  );
}

/**
 * Refresco pasivo (DEC-84): al volver a la pestaña o a la app y cada 60 s
 * mientras la página está visible. `enabled = false` (tras un 429) lo pausa
 * hasta que el usuario reintenta a mano.
 */
function usePassiveRefresh(reload: () => void, enabled: boolean) {
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    // Al volver a la app llegan `visibilitychange` y `focus` juntos: una sola petición.
    let last = Date.now();
    const refreshIfVisible = () => {
      if (!enabledRef.current || document.visibilityState !== 'visible') return;
      if (Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      reload();
    };
    const timer = window.setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [reload]);
}
