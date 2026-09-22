import { CircleAlert, Inbox, LoaderCircle, RotateCw } from 'lucide-react';
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
      <LoaderCircle className="size-6 animate-spin text-[var(--muted-foreground)]" aria-hidden />
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
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
        'flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center',
        className,
      )}
    >
      <CircleAlert className="size-8 text-[var(--danger)]" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
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
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center',
        className,
      )}
    >
      <Inbox className="size-8 text-[var(--muted-foreground)]" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="max-w-sm text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
