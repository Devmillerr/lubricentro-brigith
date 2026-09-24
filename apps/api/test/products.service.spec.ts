import { InventoryService } from '../src/inventory/inventory.service';
import { ProductsService } from '../src/products/products.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(
    ['product', 'productCategory', 'productCompatibility', 'vehicleModel', 'inventoryMovement'],
    { product: [['businessId', 'code']] },
  );
  const service = new ProductsService(prisma);
  const inventory = new InventoryService(prisma);
  return {
    service,
    inventory,
    products: stores.get('product')!,
    categories: stores.get('productCategory')!,
    vehicleModels: stores.get('vehicleModel')!,
    compatibilities: stores.get('productCompatibility')!,
    movements: stores.get('inventoryMovement')!,
  };
}

describe('ProductsService', () => {
  it('crea un producto con unidad libre (BR-P15)', async () => {
    const { service } = setup();

    const product = await service.create('biz-a', { name: 'Aceite 20W-50', unit: 'litro' });

    expect(product.name).toBe('Aceite 20W-50');
    expect(product.unit).toBe('litro');
  });

  it('tracksStock por defecto true (BR-P16)', async () => {
    const { service } = setup();

    const product = await service.create('biz-a', { name: 'Filtro X', unit: 'unidad' });

    expect(product.tracksStock).toBe(true);
  });

  it('rechaza un código duplicado en el mismo negocio con PRODUCT_CODE_ALREADY_EXISTS', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Filtro X', unit: 'unidad', code: 'F-100' });

    await expect(
      service.create('biz-a', { name: 'Otro filtro', unit: 'unidad', code: 'F-100' }),
    ).rejects.toMatchObject({ code: 'PRODUCT_CODE_ALREADY_EXISTS' });
  });

  it('permite varios productos sin código en el mismo negocio', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Uno', unit: 'unidad' });

    await expect(service.create('biz-a', { name: 'Dos', unit: 'unidad' })).resolves.toMatchObject({
      name: 'Dos',
    });
  });

  it('permite el mismo código en negocios distintos (unicidad por negocio)', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Filtro X', unit: 'unidad', code: 'F-100' });

    await expect(
      service.create('biz-b', { name: 'Filtro X', unit: 'unidad', code: 'F-100' }),
    ).resolves.toMatchObject({ code: 'F-100' });
  });

  it('rechaza crear con un categoryId que no existe en el negocio', async () => {
    const { service } = setup();

    await expect(
      service.create('biz-a', { name: 'X', unit: 'unidad', categoryId: 'no-existe' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('list filtra por búsqueda de nombre, marca o código, sin distinguir mayúsculas', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Aceite Repsol', unit: 'litro', brand: 'Repsol' });
    await service.create('biz-a', { name: 'Filtro genérico', unit: 'unidad', code: 'FG-01' });

    const byName = await service.list('biz-a', { search: 'repsol' });
    expect(byName.items).toHaveLength(1);
    expect(byName.items[0]?.name).toBe('Aceite Repsol');

    const byCode = await service.list('biz-a', { search: 'fg-01' });
    expect(byCode.items).toHaveLength(1);
    expect(byCode.items[0]?.name).toBe('Filtro genérico');
  });

  it('list no cruza negocios', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Uno', unit: 'unidad' });
    await service.create('biz-b', { name: 'Ajeno', unit: 'unidad' });

    const page = await service.list('biz-a', {});

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe('Uno');
  });

  it('list sin includeStock no agrega saldo', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Uno', unit: 'unidad' });

    const page = await service.list('biz-a', {});

    expect((page.items[0] as { stock?: unknown }).stock).toBeUndefined();
  });

  it('list con includeStock agrega saldo y estado de conteo (06-API.md, BR-P8)', async () => {
    const { service, inventory } = setup();
    const product = await service.create('biz-a', { name: 'Uno', unit: 'unidad' });
    await inventory.count('biz-a', 'user-a', { productId: product.id, countedQuantity: 5 });

    const page = await service.list('biz-a', { includeStock: true });

    const withStock = page.items[0] as typeof product & {
      stock: { balance: number; isCounted: boolean };
    };
    expect(withStock.stock.balance).toBe(5);
    expect(withStock.stock.isCounted).toBe(true);
  });

  it('deactivate pone isActive en false, nunca borra (BR-G5)', async () => {
    const { service, products } = setup();
    const product = await service.create('biz-a', { name: 'Uno', unit: 'unidad' });

    await service.deactivate('biz-a', product.id);

    expect(products.get(product.id)?.isActive).toBe(false);
    expect(products.has(product.id)).toBe(true);
  });

  it('deactivate rechaza con PRODUCT_NOT_FOUND para un producto de otro negocio', async () => {
    const { service } = setup();
    const product = await service.create('biz-b', { name: 'Ajeno', unit: 'unidad' });

    await expect(service.deactivate('biz-a', product.id)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('compatibleModels devuelve los modelos con compatibilidad confirmada', async () => {
    const { service, vehicleModels, compatibilities } = setup();
    const product = await service.create('biz-a', { name: 'Filtro X', unit: 'unidad' });
    vehicleModels.set('model-1', {
      id: 'model-1',
      businessId: 'biz-a',
      make: 'Toyota',
      model: 'Yaris',
    });
    compatibilities.set('compat-1', {
      id: 'compat-1',
      businessId: 'biz-a',
      productId: product.id,
      vehicleModelId: 'model-1',
      confirmedById: 'user-a',
      confirmedAt: new Date(),
    });

    const found = await service.compatibleModels('biz-a', product.id);

    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe('model-1');
  });

  describe('catálogo (R2)', () => {
    function seedCatalog(categories: Map<string, Record<string, unknown>>) {
      const add = (
        id: string,
        businessId: string,
        name: string,
        parentId: string | null,
        isActive = true,
      ) => categories.set(id, { id, businessId, name, parentId, isActive });
      add('cat-filtro', 'biz-a', 'Filtro', null);
      add('cat-aire', 'biz-a', 'Filtro de aire', 'cat-filtro');
      add('cat-lub', 'biz-a', 'Lubricante', null);
      add('cat-off', 'biz-a', 'Apagada', null, false);
      add('cat-b', 'biz-b', 'Ajena', null);
    }

    it('crea con viscosidad y presentación opcionales, sin precio ni imagen (BR-P19b)', async () => {
      const { service } = setup();

      const product = await service.create('biz-a', {
        name: 'Repsol 10W40 1.5 L',
        unit: 'unidad',
        brand: 'Repsol',
        viscosity: '10W40',
        presentation: '1.5 L',
      });

      expect(product).toMatchObject({ viscosity: '10W40', presentation: '1.5 L' });
      expect(product.salePrice ?? null).toBeNull();
      expect(product.imageKey ?? null).toBeNull();
    });

    it('rechaza una categoría desactivada o de otro negocio', async () => {
      const { service, categories } = setup();
      seedCatalog(categories);

      await expect(
        service.create('biz-a', { name: 'X', unit: 'u', categoryId: 'cat-off' }),
      ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
      await expect(
        service.create('biz-a', { name: 'X', unit: 'u', categoryId: 'cat-b' }),
      ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    });

    it('update con null deja pendientes precio, marca, código y atributos', async () => {
      const { service } = setup();
      const product = await service.create('biz-a', {
        name: 'Filtro',
        unit: 'unidad',
        code: '3007',
        brand: 'X',
        viscosity: 'V',
        presentation: 'P',
        salePrice: 10,
      });

      const updated = await service.update('biz-a', product.id, {
        salePrice: null,
        brand: null,
        code: null,
        viscosity: null,
        presentation: null,
      });

      expect(updated).toMatchObject({
        salePrice: null,
        brand: null,
        code: null,
        viscosity: null,
        presentation: null,
      });
    });

    it('reactiva un producto desactivado con isActive: true', async () => {
      const { service } = setup();
      const product = await service.create('biz-a', { name: 'Uno', unit: 'unidad' });
      await service.deactivate('biz-a', product.id);

      const reactivated = await service.update('biz-a', product.id, { isActive: true });

      expect(reactivated.isActive).toBe(true);
    });

    it('filtra por estado, categoría con subcategorías, marca, viscosidad, presentación y sin precio', async () => {
      const { service, categories } = setup();
      seedCatalog(categories);
      await service.create('biz-a', {
        name: 'Filtro 21050',
        unit: 'u',
        code: '21050',
        categoryId: 'cat-aire',
      });
      await service.create('biz-a', {
        name: 'Filtro raíz',
        unit: 'u',
        categoryId: 'cat-filtro',
        salePrice: 5,
      });
      await service.create('biz-a', {
        name: 'Repsol 10W40',
        unit: 'u',
        categoryId: 'cat-lub',
        brand: 'Repsol',
        viscosity: '10W40',
        presentation: 'Litro',
        salePrice: 30,
      });
      const inactive = await service.create('biz-a', {
        name: 'Vistony 20W50',
        unit: 'u',
        categoryId: 'cat-lub',
        brand: 'Vistony',
        viscosity: '20W50',
      });
      await service.deactivate('biz-a', inactive.id);
      await service.create('biz-b', { name: 'Ajeno', unit: 'u', brand: 'Repsol' });

      const names = async (query: Parameters<typeof service.list>[1]) =>
        (await service.list('biz-a', query)).items.map((p) => p.name).sort();

      expect(await names({ categoryId: 'cat-filtro' })).toEqual(['Filtro 21050', 'Filtro raíz']);
      expect(await names({ categoryId: 'cat-aire' })).toEqual(['Filtro 21050']);
      expect(await names({ isActive: true, categoryId: 'cat-lub' })).toEqual(['Repsol 10W40']);
      expect(await names({ isActive: false })).toEqual(['Vistony 20W50']);
      expect(await names({ brand: 'repsol' })).toEqual(['Repsol 10W40']);
      expect(await names({ viscosity: '10w40' })).toEqual(['Repsol 10W40']);
      expect(await names({ presentation: 'LITRO' })).toEqual(['Repsol 10W40']);
      expect(await names({ missingPrice: true, isActive: true })).toEqual(['Filtro 21050']);
    });

    it('la búsqueda cubre viscosidad y presentación', async () => {
      const { service } = setup();
      await service.create('biz-a', {
        name: 'Aceite A',
        unit: 'u',
        viscosity: '25W60',
        presentation: 'Balde',
      });
      await service.create('biz-a', { name: 'Aceite B', unit: 'u' });

      const search = async (term: string) =>
        (await service.list('biz-a', { search: term })).items.map((p) => p.name);
      expect(await search('25w60')).toEqual(['Aceite A']);
      expect(await search('balde')).toEqual(['Aceite A']);
    });

    it('facets: valores en uso con conteo, agrupados sin mayúsculas, y luego las sugerencias', async () => {
      const { service, categories } = setup();
      seedCatalog(categories);
      const create = (name: string, categoryId: string, brand: string, viscosity?: string) =>
        service.create('biz-a', { name, unit: 'u', categoryId, brand, viscosity });
      await create('A', 'cat-lub', 'Repsol', '10W40');
      await create('B', 'cat-lub', 'repsol', '10W40');
      await create('C', 'cat-lub', 'Castrol');
      const off = await create('D', 'cat-lub', 'Inactiva');
      await service.deactivate('biz-a', off.id);
      await create('E', 'cat-aire', 'Otra');
      await service.create('biz-b', { name: 'F', unit: 'u', brand: 'DeOtroNegocio' });

      const facets = await service.facets('biz-a', 'cat-lub');

      expect(facets.brands.slice(0, 2)).toEqual([
        { value: 'Repsol', count: 2, suggested: true },
        { value: 'Castrol', count: 1, suggested: false },
      ]);
      expect(facets.brands.map((b) => b.value)).toEqual([
        'Repsol',
        'Castrol',
        'Vistony',
        'Valvoline',
      ]);
      expect(facets.viscosities[0]).toEqual({ value: '10W40', count: 2, suggested: true });
      expect(facets.presentations.every((p) => p.count === 0 && p.suggested)).toBe(true);
    });
  });
});
