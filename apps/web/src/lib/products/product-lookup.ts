import { api } from '@/lib/api/client';
import { callApi, type ApiResult } from '@/lib/api/request';
import type { Product } from './format';

/**
 * La API no tiene `GET /products/{id}` (06-API.md solo lista `GET /products`).
 * El detalle de un producto sale de lo que ya trajo el listado; si se entra
 * directo por URL, se recorre `GET /products` página a página (orden por
 * nombre, 100 por página) hasta encontrarlo.
 */
const seen = new Map<string, Product>();

export function rememberProducts(products: Product[]): void {
  for (const product of products) seen.set(product.id, product);
}

export function forgetProduct(id: string): void {
  seen.delete(id);
}

const MAX_PAGES = 20;

export async function findProduct(
  id: string,
  { useCache = true } = {},
): Promise<ApiResult<Product>> {
  const cached = useCache ? seen.get(id) : undefined;
  if (cached) return { ok: true, data: cached };

  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await callApi(
      api.GET('/products', { params: { query: { limit: 100, ...(cursor ? { cursor } : {}) } } }),
    );
    if (!result.ok) return result;
    rememberProducts(result.data.items);
    const found = result.data.items.find((product) => product.id === id);
    if (found) return { ok: true, data: found };
    if (!result.data.nextCursor) break;
    cursor = result.data.nextCursor;
  }

  return {
    ok: false,
    failure: {
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
      fieldErrors: {},
      classified: { kind: 'client', code: 'PRODUCT_NOT_FOUND', detail: 'Producto no encontrado' },
    },
  };
}
