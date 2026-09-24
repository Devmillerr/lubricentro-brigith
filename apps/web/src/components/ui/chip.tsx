import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Opción que se toca para elegir o filtrar (R2: "elegir en vez de escribir").
 * `selected` se anuncia con `aria-pressed`. Alto mínimo de 44 px para tocar
 * con una mano (07-UI-UX.md).
 */
export function Chip({
  selected = false,
  children,
  className,
  ...props
}: { selected?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-sm font-medium whitespace-nowrap',
        selected
          ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
          : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Fila de chips con scroll horizontal (sin desbordar la página en 360 px). */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {children}
    </div>
  );
}
