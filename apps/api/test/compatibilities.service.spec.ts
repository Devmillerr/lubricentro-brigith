import { CompatibilitiesService } from '../src/products/compatibilities.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(
    ['productCompatibility', 'product', 'vehicleModel'],
    {
      productCompatibility: [['productId', 'vehicleModelId']],
    },
  );
  const service = new CompatibilitiesService(prisma);
  const products = stores.get('product')!;
  const vehicleModels = stores.get('vehicleModel')!;
  products.set('prod-a', { id: 'prod-a', businessId: 'biz-a', name: 'Filtro X', unit: 'unidad' });
  vehicleModels.set('model-a', {
    id: 'model-a',
    businessId: 'biz-a',
    make: 'Toyota',
    model: 'Yaris',
  });
  return { service, compatibilities: stores.get('productCompatibility')!, products, vehicleModels };
}

describe('CompatibilitiesService', () => {
  it('crea una compatibilidad explícita (BR-F1)', async () => {
    const { service } = setup();

    const compat = await service.create('biz-a', 'user-a', {
      productId: 'prod-a',
      vehicleModelId: 'model-a',
    });

    expect(compat.productId).toBe('prod-a');
    expect(compat.vehicleModelId).toBe('model-a');
    expect(compat.confirmedById).toBe('user-a');
  });

  it('rechaza un productId que no existe en el negocio', async () => {
    const { service } = setup();

    await expect(
      service.create('biz-a', 'user-a', { productId: 'no-existe', vehicleModelId: 'model-a' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('rechaza un vehicleModelId que no existe en el negocio', async () => {
    const { service } = setup();

    await expect(
      service.create('biz-a', 'user-a', { productId: 'prod-a', vehicleModelId: 'no-existe' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('rechaza un producto de otro negocio como si no existiera', async () => {
    const { service, products } = setup();
    products.set('prod-b', { id: 'prod-b', businessId: 'biz-b', name: 'Ajeno', unit: 'unidad' });

    await expect(
      service.create('biz-a', 'user-a', { productId: 'prod-b', vehicleModelId: 'model-a' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('rechaza duplicar la misma compatibilidad con COMPATIBILITY_ALREADY_EXISTS', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { productId: 'prod-a', vehicleModelId: 'model-a' });

    await expect(
      service.create('biz-a', 'user-a', { productId: 'prod-a', vehicleModelId: 'model-a' }),
    ).rejects.toMatchObject({ code: 'COMPATIBILITY_ALREADY_EXISTS' });
  });

  it('remove la quita (borrado real, no está en BR-G5)', async () => {
    const { service, compatibilities } = setup();
    const compat = await service.create('biz-a', 'user-a', {
      productId: 'prod-a',
      vehicleModelId: 'model-a',
    });

    await service.remove('biz-a', compat.id);

    expect(compatibilities.has(compat.id)).toBe(false);
  });

  it('remove rechaza con COMPATIBILITY_NOT_FOUND para una de otro negocio', async () => {
    const { service } = setup();
    const compat = await service.create('biz-a', 'user-a', {
      productId: 'prod-a',
      vehicleModelId: 'model-a',
    });

    await expect(service.remove('biz-b', compat.id)).rejects.toMatchObject({
      code: 'COMPATIBILITY_NOT_FOUND',
    });
  });
});
