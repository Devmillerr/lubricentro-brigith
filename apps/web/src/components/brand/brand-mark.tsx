import Image from 'next/image';
import emblem from '@/assets/brand/brigith-emblem.png';
import { cn } from '@/lib/utils';

/**
 * Emblema oficial de Lubricentro Brigith.
 * No se deforma ni se le pone nada encima: solo cambia el tamaño.
 */
export function BrandEmblem({
  size,
  priority = false,
  className,
}: {
  /** Ancho en px CSS; el alto sale de la proporción del logo. */
  size: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={emblem}
      alt="Lubricentro Brigith"
      width={size}
      height={Math.round((size * emblem.height) / emblem.width)}
      priority={priority}
      className={cn('shrink-0 select-none', className)}
    />
  );
}

/** Emblema + "BRIGITH" para cabeceras. */
export function BrandLockup({
  subtitle,
  emblemSize = 40,
  className,
}: {
  subtitle?: string;
  emblemSize?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandEmblem size={emblemSize} priority />
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-lg leading-none font-bold tracking-wide uppercase">
          Brigith
        </span>
        {subtitle && (
          <span className="truncate text-xs leading-tight text-[var(--muted-foreground)]">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
