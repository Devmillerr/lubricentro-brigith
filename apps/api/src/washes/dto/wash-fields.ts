import { Transform } from 'class-transformer';

/** Límites de la configuración de lavados (DEC-66). */
export const MAX_WASH_TEXT = 100;
/** `imageKey` no tiene regla de negocio (sin subida, DEC-34); solo un tope técnico. */
export const MAX_WASH_IMAGE_KEY = 255;
/** `WashPriceOption.amount` es Decimal(10,2): el mayor valor que cabe en la columna. */
export const MAX_WASH_AMOUNT = 99_999_999.99;
/** `sortOrder` es un `Int` de Postgres: tope técnico para no terminar en un 500. */
export const MAX_WASH_SORT_ORDER = 2_147_483_647;

/** Quita los espacios de los extremos; otro tipo queda tal cual para que lo rechace el validador. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/** Como {@link Trim}, pero un texto vacío (o solo espacios) pasa a `null`: campo sin valor. */
export function TrimToNull(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });
}
