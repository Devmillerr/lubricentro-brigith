import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Acción principal de una operación (Cobrar, Guardar) al alcance del pulgar.
 * En el teléfono queda pegada justo encima de la barra inferior mientras se
 * recorre el formulario, de borde a borde (respeta los márgenes seguros de
 * AppShell: `--gutter-l` / `--gutter-r`); desde `md` vuelve a su lugar en la
 * columna. No tapa contenido: es `sticky`, así que al final del formulario
 * ocupa su propio espacio.
 *
 * Para acompañar todo el recorrido debe ser hija directa del <form> (o de un
 * contenedor tan alto como él).
 */
export function StickyActionBar({
  action,
  summary,
  children,
}: {
  /** El botón principal (ocupa el ancho disponible). */
  action: ReactNode;
  /**
   * Total breve junto al botón, solo en el teléfono: en pantallas anchas el
   * total ya se ve en la columna, justo encima.
   */
  summary?: { label: string; value: ReactNode };
  /** Avisos que deben verse junto al botón (errores del envío). */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[5] -mr-[var(--gutter-r,1rem)] -ml-[var(--gutter-l,1rem)] flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface)] py-3 pr-[var(--gutter-r,1rem)] pl-[var(--gutter-l,1rem)] shadow-[0_-4px_16px_rgb(0_0_0/0.05)]',
        'md:static md:m-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none',
      )}
    >
      {children}
      <div className="flex items-center gap-3">
        {summary && (
          // Repite el total de la sección (que es el que leen los lectores de pantalla).
          <div className="flex shrink-0 flex-col md:hidden" aria-hidden>
            <span className="text-xs font-medium text-[var(--muted-foreground)]">
              {summary.label}
            </span>
            <span className="text-lg leading-tight font-semibold">{summary.value}</span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">{action}</div>
      </div>
    </div>
  );
}
