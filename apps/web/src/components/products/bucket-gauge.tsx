import { useId } from 'react';
import { Badge } from '@/components/ui/page-header';
import { formatQuantity } from '@/lib/inventory/format';
import { containerState, gallonsFor, shortUnit } from '@/lib/products/container';
import { cn } from '@/lib/utils';

interface ContainerProduct {
  unit: string;
  containerCapacity: string | null;
  containerLabel: string | null;
}

/** El producto se vende de un envase abierto (DEC-93). */
export function hasContainer(
  product: ContainerProduct,
): product is ContainerProduct & { containerCapacity: string } {
  return product.containerCapacity !== null && Number(product.containerCapacity) > 0;
}

/**
 * Envase abierto dibujado en SVG (DEC-93): el nivel baja con cada venta. El
 * contenido se deriva del saldo (`containerState`): el abierto y, aparte, los
 * envases cerrados. `size="lg"` en el inventario y la ficha del producto;
 * `size="sm"` (barra) en listas y en la línea de venta. Sin conteo inicial el
 * saldo no es confiable y se dice.
 */
export function BucketGauge({
  product,
  balance,
  counted = true,
  size = 'lg',
  className,
}: {
  product: ContainerProduct & { containerCapacity: string };
  balance: number;
  counted?: boolean;
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const capacity = Number(product.containerCapacity);
  const state = containerState(balance, capacity);
  const unit = shortUnit(product.unit);
  const label = product.containerLabel ?? 'Envase';
  const valueText = state.empty
    ? `${label} agotado`
    : `${formatQuantity(state.open)} ${unit} de ${formatQuantity(capacity)} ${unit}`;

  if (size === 'sm') {
    return (
      <span
        role="meter"
        aria-label={`Contenido del ${label.toLocaleLowerCase('es')}`}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={state.open}
        aria-valuetext={valueText}
        className={cn('flex items-center gap-2', className)}
      >
        <span className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--muted)] ring-1 ring-[var(--border)]">
          <span
            className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${state.fraction * 100}%` }}
          />
        </span>
        <span className="text-xs whitespace-nowrap text-[var(--muted-foreground)]">
          {state.empty ? (
            <span className="font-semibold text-[var(--danger)]">Agotado</span>
          ) : (
            <>
              <span className="font-semibold text-[var(--foreground)]">
                {formatQuantity(state.open)}
              </span>{' '}
              / {formatQuantity(capacity)} {unit}
              {state.sealed > 0 && ` · +${state.sealed}`}
            </>
          )}
        </span>
      </span>
    );
  }

  const gallons = gallonsFor(state.open, product.unit);
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4',
        className,
      )}
    >
      <BucketSvg
        fraction={state.fraction}
        empty={state.empty}
        role="meter"
        aria-label={`Contenido del ${label.toLocaleLowerCase('es')} abierto`}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={state.open}
        aria-valuetext={valueText}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">{label} abierto</span>
        {state.empty ? (
          <span className="flex flex-col items-start gap-1">
            <span className="font-display text-3xl leading-none font-bold text-[var(--danger)]">
              Agotado
            </span>
            <span className="text-sm text-[var(--muted-foreground)]">
              0 {unit} de {formatQuantity(capacity)} {unit}
            </span>
          </span>
        ) : (
          <span className="font-display text-3xl leading-none font-bold">
            {formatQuantity(state.open)} {unit}
            <span className="ml-1 text-base font-normal text-[var(--muted-foreground)]">
              / {formatQuantity(capacity)} {unit}
            </span>
          </span>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-[var(--muted-foreground)]">Contenido</dt>
          <dd>
            {formatQuantity(state.open)} {unit}
          </dd>
          <dt className="text-[var(--muted-foreground)]">Capacidad</dt>
          <dd>
            {formatQuantity(capacity)} {unit}
          </dd>
          {gallons !== null && (
            <>
              <dt className="text-[var(--muted-foreground)]">Equivale a</dt>
              <dd>
                {formatQuantity(gallons)} {gallons === 1 ? 'galón' : 'galones'}
              </dd>
            </>
          )}
        </dl>
        {state.sealed > 0 && (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <BucketSvg fraction={1} empty={false} className="h-5 w-5" aria-hidden />
            Además {state.sealed}{' '}
            {state.sealed === 1
              ? `${label.toLocaleLowerCase('es')} cerrado`
              : `${label.toLocaleLowerCase('es')}s cerrados`}{' '}
            ({formatQuantity(state.sealed * capacity)} {unit})
          </p>
        )}
        {!counted && (
          <Badge tone="warning" className="self-start">
            Sin conteo inicial: el contenido no es confiable
          </Badge>
        )}
      </div>
    </div>
  );
}

/** Balde con asa; el contenido se recorta a la forma del balde y sube según `fraction`. */
function BucketSvg({
  fraction,
  empty,
  className,
  ...aria
}: {
  fraction: number;
  empty: boolean;
  className?: string;
} & React.AriaAttributes & { role?: string }) {
  const clipId = useId();
  // Interior del balde: de y = 34 (borde) a y = 122 (fondo).
  const top = 34;
  const bottom = 122;
  const level = bottom - (bottom - top) * Math.max(0, Math.min(fraction, 1));
  const body = 'M16 30 L104 30 L94 120 Q93.5 124 89.5 124 L30.5 124 Q26.5 124 26 120 Z';

  return (
    <svg
      viewBox="0 0 120 130"
      className={cn('h-28 w-24 shrink-0', className)}
      focusable="false"
      {...aria}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={body} />
        </clipPath>
      </defs>
      {/* Asa */}
      <path
        d="M22 32 C22 2 98 2 98 32"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Cuerpo vacío */}
      <path d={body} fill="var(--muted)" />
      {/* Contenido */}
      {!empty && (
        <g clipPath={`url(#${clipId})`}>
          <rect
            x="0"
            y={level}
            width="120"
            height={130 - level}
            fill="var(--accent)"
            className="transition-[y,height] duration-500 motion-reduce:transition-none"
          />
          <rect x="0" y={level} width="120" height="3" fill="var(--accent-strong)" opacity="0.35" />
        </g>
      )}
      {/* Marcas de 1/4, 1/2 y 3/4 */}
      {[0.25, 0.5, 0.75].map((mark) => {
        const y = bottom - (bottom - top) * mark;
        return (
          <line
            key={mark}
            x1="84"
            x2="94"
            y1={y}
            y2={y}
            stroke="var(--border-strong)"
            strokeWidth="1.5"
            clipPath={`url(#${clipId})`}
            opacity="0.7"
          />
        );
      })}
      {/* Contorno y borde superior */}
      <path d={body} fill="none" stroke="var(--border-strong)" strokeWidth="3" />
      <rect
        x="12"
        y="24"
        width="96"
        height="9"
        rx="4.5"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="3"
      />
    </svg>
  );
}
