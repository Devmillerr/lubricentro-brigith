import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plate } from '@/components/ui/plate';
import { cn } from '@/lib/utils';

/**
 * Título de pantalla con enlace "volver" y acción opcional a la derecha.
 * `asPlate`: el título es una placa y se muestra como en las listas.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
  asPlate = false,
}: {
  title: string;
  asPlate?: boolean;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-md pr-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[1.75rem] leading-tight font-bold break-words">
            {asPlate ? <Plate plate={title} size="lg" /> : title}
          </h2>
          {subtitle && <div className="text-sm text-[var(--muted-foreground)]">{subtitle}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'dark';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--muted)] text-[var(--muted-foreground)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  dark: 'bg-[var(--primary)] text-[var(--primary-foreground)]',
};

/** Etiqueta de estado (Anulada, Sin precio, Contactado…). El tono acompaña al texto. */
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
