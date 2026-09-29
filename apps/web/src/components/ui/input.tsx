import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Clase común de los controles de formulario (Input, Select, Textarea). */
export const controlClass =
  'w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-base text-[var(--foreground)] transition-[border-color,box-shadow] placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/20 focus-visible:outline-none disabled:opacity-60 aria-[invalid=true]:border-[var(--danger)] aria-[invalid=true]:ring-[var(--danger)]/20';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return <input ref={ref} className={cn(controlClass, 'h-12', className)} {...props} />;
  },
);
Input.displayName = 'Input';
