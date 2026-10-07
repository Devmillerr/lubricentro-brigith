import type { Schemas } from '@/lib/api/client';
import { formatQuantity } from '@/lib/inventory/format';

export type SaleUnit = Schemas['ProductSaleUnitResponse'];

/**
 * Unidades de stock sugeridas cuando `GET /products/facets` no responde. La
 * API devuelve las que ya usa el catálogo más estas (DEC-92).
 */
export const UNIT_SUGGESTIONS = ['unidad', 'galón', 'litro'];

/**
 * Una unidad es un nombre ("unidad", "galón", "litro"…), nunca solo un
 * número: "0" no dice en qué se cuenta el stock. Misma regla que la API.
 */
export function isValidUnit(unit: string): boolean {
  return /\p{L}/u.test(unit);
}

export const UNIT_ERROR =
  'Elige la unidad (p. ej. unidad, galón o litro); un número no es una unidad.';

function normalized(value: string): string {
  // Sin tildes: "galón" y "galon" son la misma unidad.
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '');
}

/** "galón", "Galon", "gl", "galones": el stock se cuenta en galones. */
export function isGallonUnit(unit: string): boolean {
  return ['galon', 'galones', 'gl', 'gal'].includes(normalized(unit));
}

/**
 * Formas habituales para un producto que se cuenta en galones (el aceite a
 * granel se vende por octavo, cuarto, galón o balde). Son solo atajos para
 * llenar la lista: la capacidad del balde no se asume, la escribe el dueño
 * porque cambia de un producto a otro.
 */
export const GALLON_PRESETS: { label: string; factor: string }[] = [
  { label: 'Octavo', factor: '0.125' },
  { label: 'Cuarto', factor: '0.25' },
  { label: 'Galón', factor: '1' },
  { label: 'Balde', factor: '' },
];

/** "litro", "Litros", "l", "lt": el stock se cuenta en litros. */
export function isLiterUnit(unit: string): boolean {
  return ['litro', 'litros', 'l', 'lt', 'lts'].includes(normalized(unit));
}

/**
 * Formas del aceite de balde contado en litros (DEC-93): 1 galón = 4 litros,
 * así que 1/4 de galón = 1 L y 1/8 de galón = 0.5 L. Solo atajos; el precio
 * no se asume.
 */
export const LITER_PRESETS: { label: string; factor: string }[] = [
  { label: '1/4 de galón', factor: '1' },
  { label: '1/8 de galón', factor: '0.5' },
];

/** Atajos de formas de venta según la unidad de stock. */
export function saleUnitPresets(unit: string): { label: string; factor: string }[] {
  if (isGallonUnit(unit)) return GALLON_PRESETS;
  if (isLiterUnit(unit)) return LITER_PRESETS;
  return [];
}

/** "= 0.125 galón" para mostrar la equivalencia de una forma. */
export function equivalenceLabel(factor: string | number, unit: string): string {
  return `${formatQuantity(factor)} ${unit}`;
}

/**
 * Stock que descuenta `quantity` unidades de una forma con equivalencia
 * `factor`, redondeado a 3 decimales como la base.
 */
export function stockFor(quantity: number, factor: string | number): number {
  return Math.round(quantity * Number(factor) * 1000) / 1000;
}

/** La cantidad × equivalencia cabe en 3 decimales (si no, la API responde 400). */
export function fitsStockDecimals(quantity: number, factor: string | number): boolean {
  const exact = quantity * Number(factor);
  return Math.abs(exact - stockFor(quantity, factor)) < 1e-9;
}
