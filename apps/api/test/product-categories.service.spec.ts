import { ProductCategoriesService } from '../src/products/product-categories.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['productCategory'], {
    productCategory: [['businessId', 'name']],
  });
  const service = new ProductCategoriesService(prisma);
  return { service, categories: stores.get('productCategory')! };
}

describe('ProductCategoriesService', () => {
  it('crea una categoría (BR-P18)', async () => {
    const { service } = setup();

    const category = await service.create('biz-a', { name: 'Lubricante' });

    expect(category.name).toBe('Lubricante');
    expect(category.id).toEqual(expect.any(String));
  });

  it('rechaza un nombre duplicado en el mismo negocio', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Filtro' });

    await expect(service.create('biz-a', { name: 'Filtro' })).rejects.toMatchObject({
      code: 'PRODUCT_CATEGORY_ALREADY_EXISTS',
    });
  });

  it('permite el mismo nombre en negocios distintos (unicidad por negocio)', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Filtro' });

    await expect(service.create('biz-b', { name: 'Filtro' })).resolves.toMatchObject({
      name: 'Filtro',
    });
  });

  it('list no cruza negocios', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Lubricante' });
    await service.create('biz-b', { name: 'Filtro' });

    const list = await service.list('biz-a');

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Lubricante');
  });
});
