'use client';

import { ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { useState } from 'react';
import { FormError } from '@/components/customers/form-error';
import { NewCategoryForm } from '@/components/products/new-category-form';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge, PageHeader } from '@/components/ui/page-header';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { api, type Schemas } from '@/lib/api/client';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { useApiQuery } from '@/lib/api/use-api-query';
import { buildCategoryTree } from '@/lib/products/categories';
import type { ProductCategoryWithCount } from '@/lib/products/format';

const CATEGORY_ERRORS = {
  PRODUCT_CATEGORY_ALREADY_EXISTS: 'Ya existe una categoría con ese nombre.',
  CATEGORY_IN_USE:
    'Tiene productos o subcategorías activos: muévelos o desactívalos antes de desactivarla.',
  CATEGORY_DEPTH_EXCEEDED: 'Las categorías tienen como máximo 2 niveles.',
  INVALID_REFERENCE: 'La categoría principal elegida no está disponible (¿está desactivada?).',
};

/**
 * Configuración → Categorías (R2, BR-P18): el árbol de 2 niveles es un dato
 * del negocio, no una taxonomía fija. Aquí se crea, renombra, mueve, ordena,
 * desactiva y reactiva. Nada se borra (BR-G5).
 */
export default function CategoriesSettingsPage() {
  const query = useApiQuery('product-categories:all', () =>
    callApi(api.GET('/product-categories', { params: { query: { includeInactive: true } } })),
  );
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(id: string, body: Schemas['UpdateProductCategoryDto']): Promise<boolean> {
    setBusy(true);
    setFailure(null);
    const result = await callApi(
      api.PATCH('/product-categories/{id}', { params: { path: { id } }, body }),
    );
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return false;
    }
    query.reload();
    return true;
  }

  /** Reordena entre hermanas: guarda la posición nueva solo de las que cambian. */
  async function move(siblings: ProductCategoryWithCount[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    setBusy(true);
    setFailure(null);
    for (const [position, category] of reordered.entries()) {
      if (category.sortOrder === position) continue;
      const result = await callApi(
        api.PATCH('/product-categories/{id}', {
          params: { path: { id: category.id } },
          body: { sortOrder: position },
        }),
      );
      if (!result.ok) {
        setFailure(result.failure);
        break;
      }
    }
    setBusy(false);
    query.reload();
  }

  const header = (
    <PageHeader
      title="Categorías"
      subtitle="Máximo 2 niveles: categoría y subcategoría"
      back={{ href: '/configuracion', label: 'Configuración' }}
    />
  );

  if (query.status === 'loading') return <LoadingState label="Cargando categorías…" />;
  if (query.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message={failureMessage(query.failure)} onRetry={query.reload} />
      </div>
    );
  }

  const categories = query.data;
  const tree = buildCategoryTree(categories);
  const parents = categories.filter((category) => !category.parentId && category.isActive);

  return (
    <div className="flex flex-col gap-5">
      {header}
      {failure && <FormError>{failureMessage(failure, { byCode: CATEGORY_ERRORS })}</FormError>}

      <NewCategoryForm categories={parents} onCreated={() => query.reload()} />

      <ul className="flex flex-col gap-3">
        {tree.map((node, index) => (
          <li key={node.id} className="rounded-lg border border-[var(--border)]">
            <CategoryRow
              category={node}
              parents={parents}
              busy={busy}
              onPatch={patch}
              onMove={(delta) => move(tree, index, delta)}
              first={index === 0}
              last={index === tree.length - 1}
            />
            {node.children.length > 0 && (
              <ul className="flex flex-col border-t border-[var(--border)] pl-4">
                {node.children.map((child, childIndex) => (
                  <li key={child.id} className="border-b border-[var(--border)] last:border-b-0">
                    <CategoryRow
                      category={child}
                      parents={parents}
                      busy={busy}
                      onPatch={patch}
                      onMove={(delta) => move(node.children, childIndex, delta)}
                      first={childIndex === 0}
                      last={childIndex === node.children.length - 1}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryRow({
  category,
  parents,
  busy,
  onPatch,
  onMove,
  first,
  last,
}: {
  category: ProductCategoryWithCount;
  parents: ProductCategoryWithCount[];
  busy: boolean;
  onPatch: (id: string, body: Schemas['UpdateProductCategoryDto']) => Promise<boolean>;
  onMove: (delta: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? '');

  async function save() {
    const body: Schemas['UpdateProductCategoryDto'] = {};
    if (name.trim() && name.trim() !== category.name) body.name = name.trim();
    if ((parentId || null) !== category.parentId) body.parentId = parentId || null;
    if (Object.keys(body).length === 0 || (await onPatch(category.id, body))) {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <Field id={`name-${category.id}`} label="Nombre">
          <Input
            id={`name-${category.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field id={`parent-${category.id}`} label="Dentro de">
          <Select
            id={`parent-${category.id}`}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">Ninguna (categoría principal)</option>
            {parents
              .filter((parent) => parent.id !== category.id)
              .map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1">
            Guardar
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <span className="flex min-w-0 flex-col">
        <span className="font-medium break-words">{category.name}</span>
        <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          {category.productCount} {category.productCount === 1 ? 'producto' : 'productos'}
          {!category.isActive && <Badge>Inactiva</Badge>}
        </span>
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="w-11 shrink-0 px-0"
          aria-label={`Subir ${category.name}`}
          onClick={() => onMove(-1)}
          disabled={busy || first}
        >
          <ArrowUp className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          className="w-11 shrink-0 px-0"
          aria-label={`Bajar ${category.name}`}
          onClick={() => onMove(1)}
          disabled={busy || last}
        >
          <ArrowDown className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          className="w-11 shrink-0 px-0"
          aria-label={`Editar ${category.name}`}
          onClick={() => setEditing(true)}
          disabled={busy}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          onClick={() => onPatch(category.id, { isActive: !category.isActive })}
          disabled={busy}
          className="flex-1"
        >
          {category.isActive ? 'Desactivar' : 'Reactivar'}
        </Button>
      </div>
    </div>
  );
}
