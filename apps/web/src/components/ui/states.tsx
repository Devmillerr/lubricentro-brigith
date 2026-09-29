import { CircleAlert, Inbox, LoaderCircle, RotateCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Estados de pantalla comunes (07-UI-UX.md §5): cargando, error con reintento y vacío. */

export function LoadingState({
  label = 'Cargando…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-1 flex-col items-center justify-center gap-3 py-12', className)}
    >
      <LoaderCircle className="size-7 animate-spin text-[var(--muted-foreground)]" aria-hidden />
      <p className="text-sm font-medium text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}

/** Bloque gris del esqueleto de carga; el tamaño lo da quien lo usa. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block rounded-md bg-[var(--muted)] motion-safe:animate-pulse', className)}
    />
  );
}

/** Anuncia la carga a lectores de pantalla; el esqueleto en sí es decorativo. */
function SkeletonStatus({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function SkeletonRow() {
  return (
    <li className="flex min-h-16 items-center gap-3 px-4 py-3">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <span className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </span>
      <Skeleton className="h-4 w-14" />
    </li>
  );
}

/**
 * Esqueleto de una lista mientras carga: la misma forma que la lista real
 * (filas dentro de una tarjeta, o la grilla de tarjetas de Productos).
 */
export function ListSkeleton({
  label = 'Cargando…',
  rows = 5,
  variant = 'rows',
  className,
}: {
  label?: string;
  rows?: number;
  variant?: 'rows' | 'grid';
  className?: string;
}) {
  const keys = Array.from({ length: rows }, (_, index) => index);
  return (
    <SkeletonStatus label={label} className={className}>
      {variant === 'grid' ? (
        <ul aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {keys.map((key) => (
            <li
              key={key}
              className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <Skeleton className="size-12 rounded-lg" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-1/2 rounded-full" />
            </li>
          ))}
        </ul>
      ) : (
        <ul
          aria-hidden
          className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
        >
          {keys.map((key) => (
            <SkeletonRow key={key} />
          ))}
        </ul>
      )}
    </SkeletonStatus>
  );
}

/**
 * Esqueleto de una pantalla completa (detalle o historial) mientras carga:
 * título, un bloque de datos y una lista, para que la pantalla no quede en
 * blanco con solo un spinner.
 */
export function PageSkeleton({ label = 'Cargando…' }: { label?: string }) {
  return (
    <SkeletonStatus label={label} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <ul
        aria-hidden
        className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
      >
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </ul>
    </SkeletonStatus>
  );
}

export function ErrorState({
  title = 'No se pudo cargar',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-[var(--danger-soft)]">
        <CircleAlert className="size-7 text-[var(--danger)]" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="max-w-sm text-sm text-[var(--muted-foreground)]">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCw className="mr-2 size-4" aria-hidden />
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Ícono temático de la pantalla (llave, gota, caja, campana…). */
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-10 text-center',
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-[var(--muted)]">
        <Icon className="size-7 text-[var(--muted-foreground)]" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
        {description && (
          <p className="max-w-sm text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
