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
});
