import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-base',
          'placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
