'use client';

import {
  Bell,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Droplets,
  PackageOpen,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cardVariants } from '@/components/ui/card';
import {
  formatAmount,
  formatCentsMoney,
  formatUnits,
  plural,
  toCents,
  type Dashboard,
} from '@/lib/dashboard/format';
import { cn } from '@/lib/utils';
import { Swatch } from './revenue-chart';

/** Productos visibles sin desplegar "Ver todos". */
const TOP_VISIBLE = 3;

/** Tarjeta del Inicio: la `Card` del sistema como `<section>` con título. */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(cardVariants(), className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h3 className="text-base font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Sección plegable del Inicio (`<details>` nativo: accesible y sin estado).
 * Cerrada por defecto para que la pantalla no se sienta cargada; el detalle
 * sigue ahí, a un toque.
 */
export function Collapsible({
  summary,
  hint,
  children,
}: {
  summary: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-sm font-semibold">{summary}</span>
        {hint && <span className="text-sm text-[var(--muted-foreground)]">{hint}</span>}
        <ChevronRight
          className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3">
        {children}
      </div>
    </details>
  );
}

type AlertTone = 'warning' | 'danger' | 'neutral';

const ALERT_TONES: Record<AlertTone, string> = {
  warning: 'border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  danger: 'border-[var(--danger)]/50 bg-[var(--danger-soft)] text-[var(--danger)]',
  neutral: 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]',
};

function AlertChip({
  href,
  icon: Icon,
  tone,
  children,
}: {
  href: string;
  icon: LucideIcon;
  tone: AlertTone;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-opacity hover:opacity-85',
        ALERT_TONES[tone],
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}

/**
 * Lo que necesita atención, en píldoras que llevan a su pantalla: recordatorios
 * por avisar (Avisar) y stock (Inventario). No dependen del período.
 */
export function AlertChips({
  reminders,
  stock,
}: {
  reminders: Dashboard['reminders'];
  stock: Dashboard['stock'];
}) {
  const clean =
    reminders.dueNow === 0 &&
    stock.negative === 0 &&
    stock.outOfStock === 0 &&
    stock.notCounted === 0;

  return (
    <nav aria-label="Atención" className="flex flex-wrap gap-2">
      {reminders.dueNow > 0 && (
        <AlertChip href="/avisar" icon={Bell} tone="warning">
          {reminders.dueNow} por avisar
        </AlertChip>
      )}
      {stock.negative > 0 && (
        <AlertChip href="/inventario" icon={CircleAlert} tone="danger">
          {plural(stock.negative, 'en negativo', 'en negativo')}
        </AlertChip>
      )}
      {stock.outOfStock > 0 && (
        <AlertChip href="/inventario" icon={PackageOpen} tone="warning">
          {plural(stock.outOfStock, 'agotado', 'agotados')}
        </AlertChip>
      )}
      {stock.notCounted > 0 && (
        <AlertChip href="/inventario" icon={ClipboardList} tone="neutral">
          {stock.notCounted} sin conteo
        </AlertChip>
      )}
      {clean && (
        <span className="inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
          <CircleCheck className="size-4 text-[var(--success)]" aria-hidden />
          Sin avisos ni stock por revisar
        </span>
      )}
    </nav>
  );
}

function PaymentChip({ color, label, cents }: { color: string; label: string; cents: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-3 py-1.5 text-sm">
      <span
        aria-hidden
        className="inline-block size-2.5 rounded-full"
        style={{ background: color }}
      />
      <span className="font-semibold tabular-nums">{formatCentsMoney(cents)}</span>
      <span className="text-[var(--muted-foreground)]">{label}</span>
    </span>
  );
}

/** Ingresos del período: el total grande y, debajo, cuánto fue en efectivo y cuánto por Yape. */
export function IncomeSummary({ totals }: { totals: Dashboard['totals'] }) {
  return (
    <section className={cn(cardVariants(), 'gap-2')} aria-label="Ingresos totales">
      <div className="flex items-baseline justify-between gap-3 text-sm text-[var(--muted-foreground)]">
        <span className="font-medium">Ingresos totales</span>
        <span>{plural(totals.salesCount, 'venta cobrada', 'ventas cobradas')}</span>
      </div>
      <span className="font-display text-5xl leading-none font-bold tracking-tight">
        {formatAmount(totals.total)}
      </span>
      <div className="flex flex-wrap gap-2 pt-1">
        <PaymentChip color="var(--series-cash)" label="Efectivo" cents={toCents(totals.cash)} />
        <PaymentChip color="var(--series-yape)" label="Yape" cents={toCents(totals.yape)} />
      </div>
    </section>
  );
}

/** Mostrador · Lavados · Mantenimiento, plegado: el detalle se abre a pedido. */
export function SourceDetails({
  totals,
  washes,
  maintenances,
}: {
  totals: Dashboard['totals'];
  washes: Dashboard['washes'];
  maintenances: Dashboard['maintenances'];
}) {
  return (
    <Collapsible summary="Detalle por fuente">
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        <SourceRow
          source="counter"
          icon={ShoppingCart}
          label="Mostrador"
          amount={totals.bySource.counter}
        />
        <SourceRow
          source="wash"
          icon={Droplets}
          label="Lavados"
          amount={totals.bySource.wash}
          detail={plural(washes.count, 'lavado', 'lavados')}
        >
          {washes.byType.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1 rounded-lg bg-[var(--muted)] px-3 py-2 text-sm">
              {washes.byType.map((type) => (
                <li
                  key={type.washTypeId ?? type.name}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0 break-words">
                    {type.name}{' '}
                    <span className="text-[var(--muted-foreground)]">× {type.count}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatAmount(type.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </SourceRow>
        <SourceRow
          source="maintenance"
          icon={Wrench}
          label="Mantenimiento"
          amount={totals.bySource.maintenance}
          detail="Por el día del cobro"
        />
      </ul>
      <MaintenancesCard maintenances={maintenances} />
    </Collapsible>
  );
}

function SourceRow({
  source,
  icon: Icon,
  label,
  amount,
  detail,
  children,
}: {
  source: 'counter' | 'wash' | 'maintenance';
  icon: LucideIcon;
  label: string;
  amount: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          <Swatch source={source} />
          <Icon className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span>{label}</span>
            {detail && (
              <span className="text-xs font-normal text-[var(--muted-foreground)]">{detail}</span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums">
          {formatAmount(amount)}
        </span>
      </div>
      {children}
    </li>
  );
}

/** Mantenimientos del período por fecha del servicio; los sin cobro, como recordatorio (BR-D4). */
function MaintenancesCard({ maintenances }: { maintenances: Dashboard['maintenances'] }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-[var(--muted)] px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Wrench className="size-4 text-[var(--muted-foreground)]" aria-hidden />
        Mantenimientos del período
      </span>
      <span className="text-sm">
        <span className="text-lg font-semibold tabular-nums">{maintenances.count}</span>{' '}
        <span className="text-[var(--muted-foreground)]">
          por fecha del servicio · {maintenances.charged}{' '}
          {maintenances.charged === 1 ? 'cobrado' : 'cobrados'}
        </span>
      </span>
      {maintenances.uncharged > 0 && (
        <span className="text-sm text-[var(--muted-foreground)]">
          {maintenances.uncharged === 1
            ? '1 sigue sin cobro: puedes cobrarlo desde el mantenimiento.'
            : `${maintenances.uncharged} siguen sin cobro: puedes cobrarlos desde cada mantenimiento.`}
        </span>
      )}
    </div>
  );
}

/**
 * Más vendidos: los 3 primeros en filas de una línea y el resto (hasta 10) al
 * desplegar "Ver todos". Lo usado en mantenimientos es consumo de inventario y
 * no suma a las ventas (BR-D5).
 */
export function TopProducts({ items }: { items: Dashboard['topProducts'] }) {
  const visible = items.slice(0, TOP_VISIBLE);
  const rest = items.slice(TOP_VISIBLE);
  const anyUsed = items.some((item) => Number(item.maintenanceUnits) > 0);

  return (
    <Panel title="Productos más vendidos" className="gap-2">
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Sin productos vendidos ni usados en este período.
        </p>
      ) : (
        <>
          <ol className="flex flex-col divide-y divide-[var(--border)]">
            {visible.map((item, index) => (
              <ProductRow key={item.productId} item={item} rank={index + 1} />
            ))}
          </ol>
          {rest.length > 0 && (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-4 transition-transform group-open:rotate-90"
                  aria-hidden
                />
                <span className="group-open:hidden">Ver todos ({items.length})</span>
                <span className="hidden group-open:inline">Ver menos</span>
              </summary>
              <ol start={TOP_VISIBLE + 1} className="flex flex-col divide-y divide-[var(--border)]">
                {rest.map((item, index) => (
                  <ProductRow key={item.productId} item={item} rank={TOP_VISIBLE + index + 1} />
                ))}
              </ol>
            </details>
          )}
          {anyUsed && (
            <p className="text-xs text-[var(--muted-foreground)]">
              “En mant.” es consumo de inventario en mantenimientos: no suma a las ventas.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function ProductRow({ item, rank }: { item: Dashboard['topProducts'][number]; rank: number }) {
  const sold = Number(item.soldUnits);
  const used = Number(item.maintenanceUnits);
  const parts = [
    sold > 0 ? `${formatUnits(item.soldUnits)} · ${formatAmount(item.soldAmount)}` : null,
    used > 0 ? `${formatUnits(item.maintenanceUnits)} en mant.` : null,
  ].filter(Boolean);

  return (
    <li>
      <Link
        href={`/productos/${item.productId}`}
        className="flex min-h-11 items-center gap-3 py-1.5 hover:opacity-80"
      >
        <span className="w-4 shrink-0 text-right text-sm font-medium text-[var(--muted-foreground)] tabular-nums">
          {rank}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
        <span className="shrink-0 text-sm text-[var(--muted-foreground)] tabular-nums">
          {parts.join(' · ')}
        </span>
      </Link>
    </li>
  );
}

/** Esqueleto mientras llega el primer dato (07-UI-UX.md §3.1). */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Cargando el resumen" className="flex flex-col gap-3">
      <div className="h-36 animate-pulse rounded-lg bg-[var(--muted)]" />
      <div className="h-12 animate-pulse rounded-lg bg-[var(--muted)]" />
      <div className="h-12 animate-pulse rounded-lg bg-[var(--muted)]" />
      <div className="h-40 animate-pulse rounded-lg bg-[var(--muted)]" />
    </div>
  );
}

/** Píldoras de atención mientras llega el primer dato. */
export function AlertChipsSkeleton() {
  return (
    <div aria-hidden className="flex gap-2">
      <div className="h-11 w-28 animate-pulse rounded-full bg-[var(--muted)]" />
      <div className="h-11 w-24 animate-pulse rounded-full bg-[var(--muted)]" />
    </div>
  );
}
