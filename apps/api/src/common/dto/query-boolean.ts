import { Transform } from 'class-transformer';

/**
 * Booleano de query string: "true"/"false" (o el booleano ya convertido).
 * `@Type(() => Boolean)` no sirve aquí: convierte cualquier string no vacío,
 * incluido "false", en `true`. Otro valor queda tal cual para que
 * `@IsBoolean()` lo rechace con 400.
 */
export function QueryBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  });
}
