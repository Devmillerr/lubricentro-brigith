import { cn } from '@/lib/utils';

/**
 * Placa del vehículo: el dato con el que se busca todo en el lubricentro.
 * Recuadro con borde oscuro, como la placa física, para reconocerla de un vistazo.
 */
export function Plate({
  plate,
  size = 'md',
  className,
}: {
  plate: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-[0.3rem] border-2 border-[var(--foreground)] bg-[var(--surface)] font-display leading-none font-bold tracking-[0.08em] break-all text-[var(--foreground)] uppercase',
        size === 'sm' && 'px-1.5 py-0.5 text-sm',
        size === 'md' && 'px-2 py-1 text-base',
        size === 'lg' && 'px-2.5 py-1 text-2xl',
        className,
      )}
    >
      {plate}
    </span>
  );
}
