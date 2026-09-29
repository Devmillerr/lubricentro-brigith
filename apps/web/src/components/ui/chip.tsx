'use client';

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
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
  const ref = useRef<HTMLButtonElement>(null);

  // En una fila con scroll (ChipRow), el elegido queda a la vista aunque se
  // llegue con el filtro ya puesto (p. ej. `/ventas?source=MAINTENANCE`).
  // Solo mueve la fila en horizontal: nunca la página.
  useEffect(() => {
    const chip = ref.current;
    const row = chip?.parentElement;
    if (!selected || !chip || !row || row.scrollWidth <= row.clientWidth) return;
    const left = chip.offsetLeft - row.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < row.scrollLeft) row.scrollLeft = left - 16;
    else if (right > row.scrollLeft + row.clientWidth)
      row.scrollLeft = right - row.clientWidth + 16;
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(chipClass(selected), className)}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Estilo de chip, compartido con los filtros que se anuncian como pestañas
 * (Avisar, Inventario): mismo alto táctil y mismo estado elegido.
 */
export function chipClass(selected: boolean): string {
  return cn(
    'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50',
    selected
      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
      : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--muted)]',
  );
}

/** Fila de chips con scroll horizontal (sin desbordar la página en 360 px). */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
