import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Acción principal de un cobro (Vender, Lavado, Mantenimiento), siempre a
 * mano en el teléfono: queda pegada justo encima de la barra inferior (pestañas
 * `h-16`, su `border-t` de 1 px y el área segura) mientras se recorre el
 * formulario, sin taparla.
 * En pantallas anchas no hay barra inferior y vuelve a su lugar normal.
 *
 * `error` va dentro de la barra para que el motivo de un rechazo se vea junto
 * al botón y no arriba, fuera de la vista.
 */
export function CheckoutBar({
  children,
  error,
  className,
}: {
  children: ReactNode;
  error?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-[5] -mx-4 flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3',
        'md:static md:mx-0 md:border-0 md:bg-transparent md:p-0',
        className,
      )}
    >
      {error}
      {children}
    </div>
  );
}

/**
 * Clases del botón principal de la barra: deshabilitado sigue legible, porque
 * su texto dice qué falta ("Elige el vehículo", "Agrega un producto"…).
 */
export const CHECKOUT_BUTTON_CLASS =
  'w-full disabled:bg-[var(--muted)] disabled:text-[var(--muted-foreground)] disabled:opacity-100';

/**
 * Botón que todavía no puede cobrar pero sigue activo: su texto dice qué
 * falta y, al tocarlo, la pantalla va a ese paso (`revealStep`).
 */
export const CHECKOUT_PENDING_CLASS =
  'bg-[var(--muted)] text-[var(--muted-foreground)] hover:opacity-100';

/** Lleva a la vista el paso que falta (respeta "reducir movimiento"). */
export function revealStep(element: HTMLElement | null): void {
  if (!element) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}
