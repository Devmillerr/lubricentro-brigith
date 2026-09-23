import { api } from '@/lib/api/client';
import { callApi, type ApiResult } from '@/lib/api/request';
import { rememberProducts } from '@/lib/products/product-lookup';
import type { ProductWithStock } from './format';

const PAGE_SIZE = 100;
export const MAX_PAGES = 20;

export interface CatalogWithStock {
  products: ProductWithStock[];
  /** true si quedaron productos sin cargar (más de MAX_PAGES × 100). */
  truncated: boolean;
}

/**
 * Catálogo completo con saldo (`GET /products?includeStock=true`). La API no
 * filtra por stock, así que "sin stock" / "con stock" / "sin conteo" se
 * calculan sobre la lista completa en el cliente.
 */
export async function loadCatalogWithStock(): Promise<ApiResult<CatalogWithStock>> {
  const products: ProductWithStock[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await callApi(
      api.GET('/products', {
        params: {
          query: { limit: PAGE_SIZE, includeStock: true, ...(cursor ? { cursor } : {}) },
        },
      }),
    );
    if (!result.ok) return result;
    products.push(...result.data.items);
    if (!result.data.nextCursor) {
      rememberProducts(products);
      return { ok: true, data: { products, truncated: false } };
    }
    cursor = result.data.nextCursor;
  }

  rememberProducts(products);
  return { ok: true, data: { products, truncated: true } };
}
