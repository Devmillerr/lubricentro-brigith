import type { Schemas } from '@/lib/api/client';

export type WashType = Schemas['WashTypeWithPricesResponse'];
export type WashPriceOption = Schemas['WashPriceOptionResponse'];

/**
 * Tipos que se pueden cobrar en la pantalla Lavado: activos y con al menos
 * una opción de precio activa, cada uno solo con sus precios activos. Un tipo
 * activo sin precio (Minibán, Combi, Moto carguera mientras el dueño no lo
 * defina, `10-OPERACION-REAL.md` §0.3) no se muestra: `POST /washes` exige una
 * opción activa (DEC-55) y no se inventa ningún monto. Se sigue viendo en
 * Configuración → Tipos de lavado para agregarle precio.
 */
export function chargeableWashTypes(types: WashType[]): WashType[] {
  return types
    .filter((type) => type.isActive)
    .map((type) => ({ ...type, prices: type.prices.filter((price) => price.isActive) }))
    .filter((type) => type.prices.length > 0);
}

/**
 * Monto escrito por el usuario (acepta coma decimal): mayor que 0 y con hasta
 * 2 decimales, como exige la API (DEC-66). null si no es válido.
 */
export function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Monto para precargar un campo de edición: sin ceros de más ("8", "25.5"). */
export function amountInput(amount: string): string {
  const value = Number(amount);
  return Number.isFinite(value) ? String(value) : amount;
}

/** Errores de la configuración y del cobro de lavados (DEC-55, DEC-65). */
export const WASH_ERRORS: Record<string, string> = {
  WASH_TYPE_ALREADY_EXISTS: 'Ya existe un tipo de lavado con ese nombre.',
  WASH_TYPE_NOT_FOUND: 'Ese tipo de lavado ya no existe.',
  WASH_PRICE_NOT_FOUND: 'Ese precio ya no existe.',
  WASH_PRICE_NOT_IN_TYPE: 'Ese precio no pertenece al tipo elegido.',
  WASH_TYPE_INACTIVE: 'Ese tipo de lavado fue desactivado. Elige otro.',
  WASH_PRICE_INACTIVE: 'Ese precio fue desactivado. Elige otro.',
  IDEMPOTENCY_KEY_IN_PROGRESS: 'El cobro todavía se está procesando. Espera un momento.',
};
