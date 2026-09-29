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
