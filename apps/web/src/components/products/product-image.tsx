import { Package } from 'lucide-react';
import type { Product } from '@/lib/products/format';
import { cn } from '@/lib/utils';

/**
 * Imagen del producto. Por ahora siempre es un placeholder: `imageKey` existe
 * pero todavía no hay subida ni almacenamiento (DEC-34). Si el producto tiene
 * código (los filtros), el código es lo que se reconoce en el estante, así que
 * se muestra grande; si no, las iniciales del nombre.
 */
export function ProductImage({
  product,
  size = 'md',
}: {
  product: Pick<Product, 'name' | 'code'>;
  size?: 'md' | 'lg';
}) {
  const label = product.code ?? initials(product.name);
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]',
        size === 'lg' ? 'size-24' : 'size-16',
      )}
    >
      <Package className={size === 'lg' ? 'size-6' : 'size-4'} />
      {label && (
        <span
          className={cn(
            'max-w-full truncate px-1 font-semibold text-[var(--foreground)]',
            size === 'lg' ? 'text-base' : 'text-xs',
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
