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
  decorative = false,
  className,
}: {
  /** Ancho en px CSS; el alto sale de la proporción del logo. */
  size: number;
  /** Solo para el emblema que es el elemento más grande de la pantalla (LCP). */
  priority?: boolean;
  /** Junto al texto "BRIGITH": el lector de pantalla no lo repite. */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={emblem}
      alt={decorative ? '' : 'Lubricentro BRIGITH'}
      width={size}
      height={Math.round((size * emblem.height) / emblem.width)}
      // `preload` reemplaza a `priority` (obsoleto en Next 16); `fetchPriority`
      // hace que el navegador lo pida antes que el resto de imágenes y scripts.
      preload={priority}
      fetchPriority={priority ? 'high' : undefined}
      className={cn('shrink-0 select-none', className)}
    />
  );
}

/** Emblema + "BRIGITH" para cabeceras (la marca siempre en mayúsculas). */
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
      {/* Sin precarga: hay dos lockups (barra lateral y header móvil) y uno siempre está
          oculto; con carga diferida el navegador solo descarga el que se ve. */}
      <BrandEmblem size={emblemSize} decorative />
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-lg leading-none font-bold">BRIGITH</span>
        {subtitle && (
          <span className="truncate text-xs leading-tight text-[var(--muted-foreground)]">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
