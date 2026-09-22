export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * A partir de `limit + 1` filas leídas (el servicio pide `take: limit + 1`),
 * separa la página y calcula el cursor siguiente (06-API.md §1: `?limit=&cursor=`).
 */
export function paginate<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? last.id : null,
  };
}
