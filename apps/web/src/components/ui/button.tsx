import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botones del sistema visual. Carbón para la acción principal; el rojo de
 * marca no se usa en botones (compite con "Anular"). `destructive` solo
 * dentro de una confirmación.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-semibold transition-[color,background-color,border-color,opacity,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
        outline:
          'border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--muted)]',
        destructive: 'bg-[var(--danger)] text-[var(--primary-foreground)] hover:opacity-90',
        ghost: 'text-[var(--foreground)] hover:bg-[var(--muted)]',
        link: 'text-[var(--foreground)] underline underline-offset-4 hover:opacity-80',
      },
      size: {
        default: 'h-12 px-4 py-2',
        sm: 'h-10 px-3',
        lg: 'h-14 px-6 text-base',
        icon: 'size-11 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';
