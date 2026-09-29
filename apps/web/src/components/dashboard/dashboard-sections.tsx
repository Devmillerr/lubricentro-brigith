'use client';

import {
  Bell,
  ChevronRight,
  CircleAlert,
  Droplets,
  PackageOpen,
  ShoppingCart,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cardVariants } from '@/components/ui/card';
import {
  formatAmount,
  formatCentsMoney,
  formatUnits,
  plural,
  toCents,
  type Dashboard,
} from '@/lib/dashboard/format';
import { formatQuantity } from '@/lib/inventory/format';
import { cn } from '@/lib/utils';
import { Swatch } from './revenue-chart';

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
 * Ingresos del período: el total grande, cuántas ventas y la división
 * Efectivo / Yape ("¿cuánto debería haber en caja y cuánto en Yape?").
 */
export function IncomeSummary({ totals }: { totals: Dashboard['totals'] }) {
  const cash = toCents(totals.cash);
  const yape = toCents(totals.yape);
  const total = cash + yape;
  return (
    <Panel>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Ingresos totales</span>
        <span className="font-display text-5xl leading-none font-bold tracking-tight">
          {formatAmount(totals.total)}
        </span>
        <span className="text-sm text-[var(--muted-foreground)]">
          {plural(totals.salesCount, 'venta cobrada', 'ventas cobradas')}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div
          className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--chart-track)]"
          role="img"
          aria-label={`Efectivo ${formatCentsMoney(cash)}, Yape ${formatCentsMoney(yape)}`}
        >
          {total > 0 && cash > 0 && (
            <span style={{ width: `${(cash / total) * 100}%`, background: 'var(--series-cash)' }} />
          )}
          {total > 0 && yape > 0 && (
            <span style={{ width: `${(yape / total) * 100}%`, background: 'var(--series-yape)' }} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PaymentFigure color="var(--series-cash)" label="Efectivo" cents={cash} total={total} />
          <PaymentFigure color="var(--series-yape)" label="Yape" cents={yape} total={total} />
        </div>
      </div>
    </Panel>
  );
}

function PaymentFigure({
  color,
  label,
  cents,
  total,
}: {
  color: string;
  label: string;
  cents: number;
  total: number;
}) {
  const share = total > 0 ? Math.round((cents / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-[3px]"
          style={{ background: color }}
        />
        {label}
        {total > 0 && <span className="tabular-nums">· {share}%</span>}
      </span>
      <span className="text-lg font-semibold tabular-nums">{formatCentsMoney(cents)}</span>
    </div>
  );
}

/** Mostrador · Lavados · Mantenimiento, cada uno con su monto y su color de la serie. */
export function SourceBreakdown({
  totals,
  washes,
  maintenances,
}: {
  totals: Dashboard['totals'];
  washes: Dashboard['washes'];
  maintenances: Dashboard['maintenances'];
}) {
  return (
    <Panel title="Por fuente">
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
    </Panel>
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
  icon: typeof ShoppingCart;
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
        <span className="shrink-0 text-lg font-semibold tabular-nums">{formatAmount(amount)}</span>
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
 * Más vendidos (hasta 10): lo vendido en mostrador y, aparte y con otra
 * etiqueta, lo usado en mantenimientos, que es inventario y no suma a las
 * ventas (BR-D5).
 */
export function TopProducts({ items }: { items: Dashboard['topProducts'] }) {
  return (
    <Panel title="Productos más vendidos">
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Sin productos vendidos ni usados en este período.
        </p>
      ) : (
        <>
          <ol className="flex flex-col divide-y divide-[var(--border)]">
            {items.map((item, index) => {
              const sold = Number(item.soldUnits);
              const used = Number(item.maintenanceUnits);
              return (
                <li
                  key={item.productId}
                  className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="w-5 shrink-0 pt-0.5 text-right text-sm font-medium text-[var(--muted-foreground)] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      href={`/productos/${item.productId}`}
                      className="font-medium break-words underline-offset-4 hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span className="flex flex-wrap gap-x-3 text-sm">
                      {sold > 0 && (
                        <span>
                          <span className="text-[var(--muted-foreground)]">Vendido </span>
                          <span className="font-medium tabular-nums">
                            {formatUnits(item.soldUnits)}
                          </span>
                          <span className="text-[var(--muted-foreground)] tabular-nums">
                            {' '}
                            · {formatAmount(item.soldAmount)}
                          </span>
                        </span>
                      )}
                      {used > 0 && (
                        <span>
                          <span className="text-[var(--muted-foreground)]">
                            Usado en mantenimientos{' '}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatUnits(item.maintenanceUnits)}
                          </span>
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-[var(--muted-foreground)]">
            Lo usado en mantenimientos es consumo de inventario: no suma a las ventas ni a los
            ingresos.
          </p>
        </>
      )}
    </Panel>
  );
}

/** Stock que requiere atención (lista, no gráfico): negativos, agotados y sin conteo. */
export function StockAttention({ stock }: { stock: Dashboard['stock'] }) {
  const clean = stock.negative === 0 && stock.outOfStock === 0;
  return (
    <Panel
      title="Stock que requiere atención"
      action={
        <Link href="/inventario" className="text-sm font-medium underline-offset-4 hover:underline">
          Inventario
        </Link>
      }
    >
      <div className="flex flex-wrap gap-2 text-sm">
        <Count
          value={stock.negative}
          label={stock.negative === 1 ? 'negativo' : 'negativos'}
          danger={stock.negative > 0}
        />
        <Count value={stock.outOfStock} label={stock.outOfStock === 1 ? 'agotado' : 'agotados'} />
        <Count value={stock.notCounted} label="sin conteo" />
      </div>
      {clean ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Ningún producto contado está agotado ni en negativo.
        </p>
      ) : (
        <ul className="-mx-1 flex flex-col divide-y divide-[var(--border)]">
          {stock.items.map((item) => (
            <li key={item.productId}>
              <Link
                href={`/inventario/${item.productId}`}
                className="flex min-h-12 items-center gap-3 rounded-md px-1 py-2 hover:bg-[var(--muted)]"
              >
                {item.balance < 0 ? (
                  <CircleAlert
                    className="size-4 shrink-0 text-[var(--danger)]"
                    aria-label="Negativo"
                  />
                ) : (
                  <PackageOpen
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-label="Agotado"
                  />
                )}
                <span className="min-w-0 flex-1 break-words">{item.name}</span>
                <span
                  className={cn(
                    'shrink-0 font-semibold tabular-nums',
                    item.balance < 0 && 'text-[var(--danger)]',
                  )}
                >
                  {formatQuantity(item.balance)}
                  <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
                    {item.unit}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Count({
  value,
  label,
  danger = false,
}: {
  value: number;
  label: string;
  danger?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 rounded-full border px-3 py-1',
        danger
          ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          : 'border-[var(--border)] bg-[var(--surface)]',
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span className={danger ? '' : 'text-[var(--muted-foreground)]'}>{label}</span>
    </span>
  );
}

/** Recordatorios por avisar ahora (no depende del período), con acceso a Avisar. */
export function RemindersDue({ dueNow }: { dueNow: number }) {
  return (
    <Link
      href="/avisar"
      className={cn(
        'flex min-h-16 items-center gap-3 rounded-lg border p-4 transition-colors',
        // Con recordatorios pendientes, amarillo aceite: atención, no error.
        dueNow > 0
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] hover:brightness-[0.98]'
          : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--muted)]',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          dueNow > 0 ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'bg-[var(--muted)]',
        )}
      >
        <Bell className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">
          {dueNow === 0
            ? 'Nadie por avisar ahora'
            : plural(dueNow, 'recordatorio', 'recordatorios') + ' por avisar'}
        </span>
        <span className="text-sm text-[var(--muted-foreground)]">
          {dueNow === 0 ? 'Revisa los próximos en Avisar.' : 'Toca para avisar por WhatsApp.'}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
    </Link>
  );
}

/** Esqueleto de tarjetas mientras llega el primer dato (07-UI-UX.md §3.1). */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Cargando el resumen" className="flex flex-col gap-3">
      <div className="h-40 animate-pulse rounded-lg bg-[var(--muted)]" />
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-16 animate-pulse rounded-lg bg-[var(--muted)]" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-lg bg-[var(--muted)]" />
    </div>
  );
}

export function ViewAllLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
      {children}
    </Link>
  );
}
