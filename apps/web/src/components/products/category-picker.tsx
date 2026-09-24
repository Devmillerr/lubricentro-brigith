'use client';

import { Chip, ChipRow } from '@/components/ui/chip';
import { buildCategoryTree } from '@/lib/products/categories';
import type { ProductCategory } from '@/lib/products/format';

/**
 * Categoría del producto con chips de 2 niveles (BR-P18): primero la
 * categoría y, si tiene, la subcategoría. Se puede dejar el producto en la
 * categoría de primer nivel o sin categoría.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: ProductCategory[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  const tree = buildCategoryTree(categories);
  const selected = categories.find((category) => category.id === value);
  const topId = selected?.parentId ?? selected?.id ?? '';
  const top = tree.find((node) => node.id === topId);

  return (
    <div className="flex flex-col gap-2">
      <ChipRow label="Categoría">
        <Chip selected={!value} onClick={() => onChange('')}>
          Sin categoría
        </Chip>
        {tree.map((node) => (
          <Chip key={node.id} selected={topId === node.id} onClick={() => onChange(node.id)}>
            {node.name}
          </Chip>
        ))}
      </ChipRow>
      {top && top.children.length > 0 && (
        <ChipRow label={`Subcategoría de ${top.name}`}>
          <Chip selected={value === top.id} onClick={() => onChange(top.id)}>
            Solo {top.name}
          </Chip>
          {top.children.map((child) => (
            <Chip key={child.id} selected={value === child.id} onClick={() => onChange(child.id)}>
              {child.name}
            </Chip>
          ))}
        </ChipRow>
      )}
    </div>
  );
}
