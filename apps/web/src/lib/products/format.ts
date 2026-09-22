import type { Schemas } from '@/lib/api/client';

export type Product = Schemas['ProductResponse'];
export type ProductCategory = Schemas['ProductCategoryResponse'];

/**
 * `salePrice` viaja como string (Decimal) y es opcional (BR-P17). Se muestra
 * con 2 decimales y sin símbolo: la moneda del negocio sigue sin definir.
 */
export function formatPrice(salePrice: string | null): string | null {
  if (salePrice === null) return null;
  const value = Number(salePrice);
  return Number.isFinite(value) ? value.toFixed(2) : salePrice;
}
