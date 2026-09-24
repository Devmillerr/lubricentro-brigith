import { ProductCategoriesService } from '../src/products/product-categories.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['productCategory', 'product'], {
    productCategory: [['businessId', 'name']],
  });
  const service = new ProductCategoriesService(prisma);
  return {
    service,
    categories: stores.get('productCategory')!,
    products: stores.get('product')!,
  };
}

describe('ProductCategoriesService', () => {
  it('crea una categoría de primer nivel (BR-P18)', async () => {
    const { service } = setup();

    const category = await service.create('biz-a', { name: 'Lubricante' });

    expect(category).toMatchObject({ name: 'Lubricante', parentId: null, isActive: true });
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

  describe('2 niveles', () => {
    it('crea una subcategoría debajo de una categoría de primer nivel', async () => {
      const { service } = setup();
      const filtro = await service.create('biz-a', { name: 'Filtro' });

      const aire = await service.create('biz-a', { name: 'Filtro de aire', parentId: filtro.id });

      expect(aire.parentId).toBe(filtro.id);
    });

    it('no permite un tercer nivel al crear', async () => {
      const { service } = setup();
      const filtro = await service.create('biz-a', { name: 'Filtro' });
      const aire = await service.create('biz-a', { name: 'Filtro de aire', parentId: filtro.id });

      await expect(
        service.create('biz-a', { name: 'Tercer nivel', parentId: aire.id }),
      ).rejects.toMatchObject({ code: 'CATEGORY_DEPTH_EXCEEDED' });
    });

    it('no permite usar como padre una categoría de otro negocio', async () => {
      const { service } = setup();
      const ajena = await service.create('biz-b', { name: 'Ajena' });

      await expect(
        service.create('biz-a', { name: 'Hija', parentId: ajena.id }),
      ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    });

    it('mover: una categoría con subcategorías no puede pasar a ser subcategoría', async () => {
      const { service } = setup();
      const filtro = await service.create('biz-a', { name: 'Filtro' });
      await service.create('biz-a', { name: 'Filtro de aire', parentId: filtro.id });
      const fluidos = await service.create('biz-a', { name: 'Fluidos' });

      await expect(
        service.update('biz-a', filtro.id, { parentId: fluidos.id }),
      ).rejects.toMatchObject({ code: 'CATEGORY_DEPTH_EXCEEDED' });
    });

    it('mover: una categoría no puede ser su propio padre', async () => {
      const { service } = setup();
      const filtro = await service.create('biz-a', { name: 'Filtro' });

      await expect(
        service.update('biz-a', filtro.id, { parentId: filtro.id }),
      ).rejects.toMatchObject({ code: 'CATEGORY_DEPTH_EXCEEDED' });
    });

    it('mover a otra categoría, renombrar, ordenar y volver a primer nivel', async () => {
      const { service } = setup();
      const lubricante = await service.create('biz-a', { name: 'Lubricante' });
      const fluidos = await service.create('biz-a', { name: 'Fluidos' });
      const hidrolina = await service.create('biz-a', {
        name: 'Hidrolina',
        parentId: lubricante.id,
      });

      const moved = await service.update('biz-a', hidrolina.id, {
        parentId: fluidos.id,
        name: 'Hidrolina (balde)',
        sortOrder: 3,
      });
      expect(moved).toMatchObject({
        parentId: fluidos.id,
        name: 'Hidrolina (balde)',
        sortOrder: 3,
      });

      const topLevel = await service.update('biz-a', hidrolina.id, { parentId: null });
      expect(topLevel.parentId).toBeNull();
    });
  });

  describe('desactivar', () => {
    it('no desactiva una categoría con productos activos (CATEGORY_IN_USE)', async () => {
      const { service, products } = setup();
      const filtro = await service.create('biz-a', { name: 'Filtro' });
      products.set('p1', { id: 'p1', businessId: 'biz-a', categoryId: filtro.id, isActive: true });

      await expect(service.update('biz-a', filtro.id, { isActive: false })).rejects.toMatchObject({
        code: 'CATEGORY_IN_USE',
      });
    });

    it('no desactiva una categoría con subcategorías activas (CATEGORY_IN_USE)', async () => {
      const { service } = setup();
      const filtro = await service.create('biz-a', { name: 'Filtro' });
      await service.create('biz-a', { name: 'Filtro de aire', parentId: filtro.id });

      await expect(service.update('biz-a', filtro.id, { isActive: false })).rejects.toMatchObject({
        code: 'CATEGORY_IN_USE',
      });
    });

    it('desactiva una categoría vacía, la oculta del listado por defecto y la reactiva', async () => {
      const { service } = setup();
      const vacia = await service.create('biz-a', { name: 'Vacía' });

      await service.update('biz-a', vacia.id, { isActive: false });
      expect(await service.list('biz-a')).toHaveLength(0);
      expect(await service.list('biz-a', true)).toHaveLength(1);

      await service.update('biz-a', vacia.id, { isActive: true });
      expect(await service.list('biz-a')).toHaveLength(1);
    });

    it('no reactiva una subcategoría si su padre está desactivado', async () => {
      const { service } = setup();
      const padre = await service.create('biz-a', { name: 'Padre' });
      const hija = await service.create('biz-a', { name: 'Hija', parentId: padre.id });
      await service.update('biz-a', hija.id, { isActive: false });
      await service.update('biz-a', padre.id, { isActive: false });

      await expect(service.update('biz-a', hija.id, { isActive: true })).rejects.toMatchObject({
        code: 'INVALID_REFERENCE',
      });
    });
  });

  it('list ordena por sortOrder y nombre y cuenta solo productos activos', async () => {
    const { service, products } = setup();
    const b = await service.create('biz-a', { name: 'B', sortOrder: 1 });
    const a = await service.create('biz-a', { name: 'A', sortOrder: 2 });
    await service.create('biz-a', { name: 'C', sortOrder: 1 });
    products.set('p1', { id: 'p1', businessId: 'biz-a', categoryId: b.id, isActive: true });
    products.set('p2', { id: 'p2', businessId: 'biz-a', categoryId: b.id, isActive: false });
    products.set('p3', { id: 'p3', businessId: 'biz-b', categoryId: b.id, isActive: true });

    const list = await service.list('biz-a');

    expect(list.map((category) => category.name)).toEqual(['B', 'C', 'A']);
    expect(list.find((category) => category.id === b.id)?.productCount).toBe(1);
    expect(list.find((category) => category.id === a.id)?.productCount).toBe(0);
  });

  it('update no encuentra categorías de otro negocio', async () => {
    const { service } = setup();
    const ajena = await service.create('biz-b', { name: 'Ajena' });

    await expect(service.update('biz-a', ajena.id, { name: 'Robada' })).rejects.toMatchObject({
      code: 'PRODUCT_CATEGORY_NOT_FOUND',
    });
  });
});
