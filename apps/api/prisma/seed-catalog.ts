import type { PrismaClient } from '@prisma/client';

/**
 * Catálogo inicial del negocio **brigith** (R2, 10-OPERACION-REAL.md §2.2b).
 * Solo datos confirmados por el dueño (§0.4); nada se inventa:
 *
 * - Árbol de categorías (DEC-37), armado debajo de "Lubricante" y "Filtro" sin
 *   renombrarlas. Es solo el punto de partida: se edita desde Configuración.
 * - 13 filtros de aire y 14 de aceite como productos, con su código tal cual.
 *   Sin marca, precio, imagen ni conteo (quedan pendientes, BR-P19b).
 * - 11 compatibilidades de filtros de aire, con el texto del vehículo tal como
 *   lo dio el dueño en `VehicleModel.model` (sin `make`, BR-F6). 2001 y 0Y040
 *   quedan sin compatibilidad hasta que se confirme.
 *
 * No siembra aceites ni fluidos: no se sabe qué combinaciones de marca y
 * presentación existen en el estante (§0.5). No toca el negocio demo.
 *
 * Idempotente: todo es alta si no existe (`update: {}`), así que volver a
 * correrlo nunca pisa lo que el dueño cambió desde la app.
 */

const OWNER_SOURCE_NOTE = 'Indicado por el dueño (2026-09-23)';

/** Categoría de primer nivel → subcategorías, en el orden en que se muestran. */
const CATEGORY_TREE: { name: string; children: string[] }[] = [
  {
    name: 'Lubricante',
    children: ['Aceite auto', 'Aceite moto', 'Aceite 2 tiempos', 'Aceite de transmisión'],
  },
  { name: 'Filtro', children: ['Filtro de aire', 'Filtro de aceite'] },
  {
    name: 'Fluidos',
    children: ['Refrigerante', 'Líquido de freno', 'Limpiaparabrisas', 'Hidrolina'],
  },
  { name: 'Siliconas', children: ['Silicona', 'Silicona de empaque'] },
];

/** 13 filtros de aire. `vehicle` = texto del dueño; `null` = compatibilidad pendiente. */
export const AIR_FILTERS: { code: string; vehicle: string | null }[] = [
  { code: '21050', vehicle: 'Yaris' },
  { code: '1030', vehicle: 'Probox' },
  { code: '2000', vehicle: 'Tercel' },
  { code: '2002', vehicle: 'Tico' },
  { code: '2001', vehicle: null },
  { code: 'BZ200', vehicle: 'Yaris moderno' },
  { code: '1R100', vehicle: 'Kia 2016' },
  { code: 'H9100', vehicle: 'Hyundai' },
  { code: '1W100', vehicle: 'Kia 2014' },
  { code: '0Y040', vehicle: null },
  { code: '2K000', vehicle: 'Kia 2025' },
  { code: '52164', vehicle: 'Chevrolet N300' },
  { code: 'B400', vehicle: 'Grand i10 2025' },
];

/** 14 filtros de aceite. Sus compatibilidades no se dieron: ninguna se siembra. */
export const OIL_FILTERS: string[] = [
  '3007',
  '3001',
  '1616',
  '3003',
  '68',
  '833N',
  '356',
  '916',
  '1446',
  '54',
  '838',
  '304',
  '27',
  '9',
];

export interface CatalogSeedSummary {
  categories: number;
  airFilters: number;
  oilFilters: number;
  compatibilities: number;
}

export async function seedBrigithCatalog(
  prisma: PrismaClient,
  businessId: string,
  ownerUserId: string,
): Promise<CatalogSeedSummary> {
  const categoryIds = new Map<string, string>();
  let categories = 0;

  for (const [parentIndex, parent] of CATEGORY_TREE.entries()) {
    const top = await prisma.productCategory.upsert({
      where: { businessId_name: { businessId, name: parent.name } },
      update: {},
      create: { businessId, name: parent.name, sortOrder: parentIndex },
    });
    categoryIds.set(parent.name, top.id);
    categories++;

    for (const [childIndex, name] of parent.children.entries()) {
      const child = await prisma.productCategory.upsert({
        where: { businessId_name: { businessId, name } },
        update: {},
        create: { businessId, name, parentId: top.id, sortOrder: childIndex },
      });
      categoryIds.set(name, child.id);
      categories++;
    }
  }

  const upsertFilter = (code: string, kind: 'aire' | 'aceite') =>
    prisma.product.upsert({
      where: { businessId_code: { businessId, code } },
      update: {},
      create: {
        businessId,
        categoryId: categoryIds.get(kind === 'aire' ? 'Filtro de aire' : 'Filtro de aceite'),
        code,
        name: `Filtro de ${kind} ${code}`,
        unit: 'unidad',
        tracksStock: true,
      },
    });

  let compatibilities = 0;
  for (const filter of AIR_FILTERS) {
    const product = await upsertFilter(filter.code, 'aire');
    if (!filter.vehicle) continue;

    // VehicleModel no tiene unique: se busca por el mismo texto antes de crear.
    const model =
      (await prisma.vehicleModel.findFirst({
        where: { businessId, make: null, model: filter.vehicle },
      })) ??
      (await prisma.vehicleModel.create({
        data: { businessId, createdById: ownerUserId, model: filter.vehicle },
      }));

    await prisma.productCompatibility.upsert({
      where: { productId_vehicleModelId: { productId: product.id, vehicleModelId: model.id } },
      update: {},
      create: {
        businessId,
        productId: product.id,
        vehicleModelId: model.id,
        confirmedById: ownerUserId,
        note: OWNER_SOURCE_NOTE,
      },
    });
    compatibilities++;
  }

  for (const code of OIL_FILTERS) {
    await upsertFilter(code, 'aceite');
  }

  return {
    categories,
    airFilters: AIR_FILTERS.length,
    oilFilters: OIL_FILTERS.length,
    compatibilities,
  };
}
