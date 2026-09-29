import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Error general de un formulario (lo que no corresponde a un campo). */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-[var(--danger)]/50 bg-[var(--danger-soft)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
