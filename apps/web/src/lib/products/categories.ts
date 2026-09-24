import type { ProductCategory } from './format';

export type CategoryNode<T extends ProductCategory = ProductCategory> = T & { children: T[] };

/**
 * Arma el árbol de 2 niveles (BR-P18) desde la lista plana de
 * `GET /product-categories`, que ya viene ordenada por `sortOrder` y nombre.
 * Una subcategoría cuyo padre no está en la lista (p. ej. desactivado) queda
 * como raíz para que no desaparezca.
 */
export function buildCategoryTree<T extends ProductCategory>(categories: T[]): CategoryNode<T>[] {
  const ids = new Set(categories.map((category) => category.id));
  const roots = categories
    .filter((category) => !category.parentId || !ids.has(category.parentId))
    .map((category) => ({ ...category, children: [] as T[] }));
  const byId = new Map(roots.map((root) => [root.id, root]));
  for (const category of categories) {
    if (category.parentId && byId.has(category.parentId)) {
      byId.get(category.parentId)!.children.push(category);
    }
  }
  return roots;
}

/** "Filtro › Filtro de aire" o solo el nombre si es de primer nivel. */
export function categoryPath(
  categories: ProductCategory[],
  categoryId: string | null,
): string | null {
  if (!categoryId) return null;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;
  const parent = category.parentId ? categories.find((c) => c.id === category.parentId) : null;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}
