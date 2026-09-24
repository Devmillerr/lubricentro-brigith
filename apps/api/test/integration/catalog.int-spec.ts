import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { AIR_FILTERS, OIL_FILTERS, seedBrigithCatalog } from '../../prisma/seed-catalog';
import type { Env } from '../../src/config/env.validation';
import { ProductCategoriesService } from '../../src/products/product-categories.service';
import { ProductsService } from '../../src/products/products.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Catálogo (R2) contra Postgres real: lo que el fake no puede probar
 * (búsqueda por vehículo compatible con filtro de relación, NULL real,
 * aislamiento con SQL real) y la siembra idempotente. Cada corrida crea sus
 * propios negocios: nunca usa ni pisa "brigith" ni "demo".
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan Postgres.',
  );
}
// Salvaguarda: estas pruebas escriben. Nunca contra una base que no sea de prueba.
if (!/\/[^/?]*_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test".');
}

const prisma = new PrismaService({ get: () => url } as unknown as ConfigService<Env, true>);
const products = new ProductsService(prisma);
const categories = new ProductCategoriesService(prisma);

async function createTenant() {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R2 ${suffix}`, slug: `r2-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'R2', username: `r2-${suffix}`, passwordHash: 'x' },
  });
  return { businessId: business.id, userId: user.id };
}

let tenantA: { businessId: string; userId: string };
let tenantB: { businessId: string; userId: string };

beforeAll(async () => {
  await prisma.$connect();
  tenantA = await createTenant();
  tenantB = await createTenant();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Siembra del catálogo de brigith (sobre un negocio de prueba)', () => {
  it('crea exactamente lo confirmado y es idempotente', async () => {
    const first = await seedBrigithCatalog(prisma, tenantA.businessId, tenantA.userId);
    const second = await seedBrigithCatalog(prisma, tenantA.businessId, tenantA.userId);

    expect(first).toEqual({ categories: 16, airFilters: 13, oilFilters: 14, compatibilities: 11 });
    expect(second).toEqual(first);

    const where = { businessId: tenantA.businessId };
    expect(await prisma.productCategory.count({ where })).toBe(16);
    expect(await prisma.product.count({ where })).toBe(27);
    expect(await prisma.productCompatibility.count({ where })).toBe(11);
    expect(await prisma.vehicleModel.count({ where })).toBe(11);

    // Nada inventado: sin precio, marca, imagen ni conteo.
    const invented = await prisma.product.count({
      where: {
        ...where,
        OR: [
          { salePrice: { not: null } },
          { brand: { not: null } },
          { imageKey: { not: null } },
          { isCounted: true },
        ],
      },
    });
    expect(invented).toBe(0);

    // 13 de aire (11 con compatibilidad; 2001 y 0Y040 sin) y 14 de aceite (sin).
    const byCode = async (codes: string[]) =>
      prisma.product.findMany({
        where: { ...where, code: { in: codes } },
        include: { category: true, compatibilities: { include: { vehicleModel: true } } },
      });
    const air = await byCode(AIR_FILTERS.map((f) => f.code));
    const oil = await byCode(OIL_FILTERS);
    expect(air).toHaveLength(13);
    expect(oil).toHaveLength(14);
    expect(air.every((p) => p.category?.name === 'Filtro de aire')).toBe(true);
    expect(oil.every((p) => p.category?.name === 'Filtro de aceite')).toBe(true);
    expect(oil.every((p) => p.compatibilities.length === 0)).toBe(true);
    for (const filter of AIR_FILTERS) {
      const product = air.find((p) => p.code === filter.code)!;
      expect(product.compatibilities.map((c) => c.vehicleModel.model)).toEqual(
        filter.vehicle ? [filter.vehicle] : [],
      );
    }
    expect(air.find((p) => p.code === '2001')!.compatibilities).toHaveLength(0);
    expect(air.find((p) => p.code === '0Y040')!.compatibilities).toHaveLength(0);
  });

  it('no pisa lo que el dueño cambió desde la app', async () => {
    const renamed = await prisma.product.findFirstOrThrow({
      where: { businessId: tenantA.businessId, code: '3007' },
    });
    await products.update(tenantA.businessId, renamed.id, {
      name: 'Filtro Wix 3007',
      salePrice: 12,
    });

    await seedBrigithCatalog(prisma, tenantA.businessId, tenantA.userId);

    const after = await prisma.product.findFirstOrThrow({ where: { id: renamed.id } });
    expect(after.name).toBe('Filtro Wix 3007');
    expect(Number(after.salePrice)).toBe(12);
  });
});

describe('Catálogo contra Postgres', () => {
  it('busca por vehículo compatible (texto del dueño)', async () => {
    const page = await products.list(tenantA.businessId, { search: 'yaris', limit: 100 });

    expect(page.items.map((p) => p.code).sort()).toEqual(['21050', 'BZ200']);
  });

  it('una categoría incluye sus subcategorías; sin precio usa NULL real', async () => {
    const filtro = await prisma.productCategory.findFirstOrThrow({
      where: { businessId: tenantA.businessId, name: 'Filtro' },
    });

    const all = await products.list(tenantA.businessId, { categoryId: filtro.id, limit: 100 });
    const pending = await products.list(tenantA.businessId, {
      categoryId: filtro.id,
      missingPrice: true,
      limit: 100,
    });

    expect(all.items).toHaveLength(27);
    // 3007 tiene precio desde la prueba anterior.
    expect(pending.items).toHaveLength(26);
  });

  it('facets y filtros por atributos opcionales', async () => {
    const lubricante = await prisma.productCategory.findFirstOrThrow({
      where: { businessId: tenantA.businessId, name: 'Aceite auto' },
    });
    await products.create(tenantA.businessId, {
      name: 'Repsol 10W40 1.5 L',
      unit: 'unidad',
      categoryId: lubricante.id,
      brand: 'Repsol',
      viscosity: '10W40',
      presentation: '1.5 L',
    });

    const facets = await products.facets(tenantA.businessId, lubricante.parentId!);
    expect(facets.brands[0]).toEqual({ value: 'Repsol', count: 1, suggested: true });
    expect(facets.viscosities[0]).toEqual({ value: '10W40', count: 1, suggested: true });

    const found = await products.list(tenantA.businessId, { viscosity: '10w40', brand: 'REPSOL' });
    expect(found.items.map((p) => p.name)).toEqual(['Repsol 10W40 1.5 L']);
  });

  it('aislamiento: otro negocio no ve productos, categorías ni facetas ajenas', async () => {
    const filtro = await prisma.productCategory.findFirstOrThrow({
      where: { businessId: tenantA.businessId, name: 'Filtro' },
    });

    expect((await products.list(tenantB.businessId, { search: 'yaris' })).items).toHaveLength(0);
    expect((await products.list(tenantB.businessId, { categoryId: filtro.id })).items).toHaveLength(
      0,
    );
    expect(await categories.list(tenantB.businessId, true)).toHaveLength(0);
    const facets = await products.facets(tenantB.businessId);
    expect(facets.brands.every((b) => b.count === 0)).toBe(true);
    await expect(
      categories.update(tenantB.businessId, filtro.id, { name: 'Robada' }),
    ).rejects.toMatchObject({ code: 'PRODUCT_CATEGORY_NOT_FOUND' });
    await expect(
      categories.create(tenantB.businessId, { name: 'Hija', parentId: filtro.id }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('categorías: mover, desactivar con productos (409) y máximo 2 niveles', async () => {
    const fluidos = await prisma.productCategory.findFirstOrThrow({
      where: { businessId: tenantA.businessId, name: 'Fluidos' },
    });
    const hidrolina = await prisma.productCategory.findFirstOrThrow({
      where: { businessId: tenantA.businessId, name: 'Hidrolina' },
    });
    const filtroAire = await prisma.productCategory.findFirstOrThrow({
      where: { businessId: tenantA.businessId, name: 'Filtro de aire' },
    });

    const lubricante = await prisma.productCategory.findFirstOrThrow({
      where: { businessId: tenantA.businessId, name: 'Lubricante' },
    });
    const moved = await categories.update(tenantA.businessId, hidrolina.id, {
      parentId: lubricante.id,
    });
    expect(moved.parentId).toBe(lubricante.id);

    await expect(
      categories.update(tenantA.businessId, filtroAire.id, { isActive: false }),
    ).rejects.toMatchObject({ code: 'CATEGORY_IN_USE' });
    await expect(
      categories.update(tenantA.businessId, fluidos.id, { parentId: lubricante.id }),
    ).rejects.toMatchObject({ code: 'CATEGORY_DEPTH_EXCEEDED' });

    const list = await categories.list(tenantA.businessId);
    expect(list.find((c) => c.id === filtroAire.id)?.productCount).toBe(13);
  });
});
