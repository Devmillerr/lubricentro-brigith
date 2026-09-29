import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tarjeta base: mismo radio, borde y relleno en todas las pantallas.
 * `muted` para bloques informativos secundarios; `danger` para confirmaciones
 * destructivas (Anular).
 */
export const cardVariants = cva('flex flex-col rounded-lg border', {
  variants: {
    tone: {
      default: 'border-[var(--border)] bg-[var(--surface)]',
      muted: 'border-[var(--border)] bg-[var(--muted)]',
      danger: 'border-[var(--danger)] bg-[var(--surface)]',
    },
    padding: {
      default: 'gap-3 p-4',
      compact: 'gap-2 p-3',
      none: '',
    },
  },
  defaultVariants: { tone: 'default', padding: 'default' },
});

export function Card({
  tone,
  padding,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ tone, padding }), className)} {...props} />;
}
