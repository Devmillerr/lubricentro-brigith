import {
  forwardRef,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { controlClass } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Etiqueta, control, ayuda y error de un campo (07-UI-UX.md §5: "mensaje junto al campo"). */
export function Field({
  id,
  label,
  hint,
  error,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-[var(--muted-foreground)]">(opcional)</span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} rows={3} className={cn(controlClass, 'py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(controlClass, 'h-12', className)} {...props} />
  ),
);
Select.displayName = 'Select';
