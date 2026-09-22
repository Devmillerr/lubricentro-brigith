import { VehiclesService } from '../src/vehicles/vehicles.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(
    ['vehicle', 'customer', 'vehicleModel', 'product', 'productCompatibility'],
    { vehicle: [['businessId', 'plateNormalized']] },
  );
  const service = new VehiclesService(prisma);
  return {
    service,
    vehicles: stores.get('vehicle')!,
    customers: stores.get('customer')!,
    vehicleModels: stores.get('vehicleModel')!,
    products: stores.get('product')!,
    compatibilities: stores.get('productCompatibility')!,
  };
}

describe('VehiclesService', () => {
  it('crea un vehículo con solo la placa (BR-C5)', async () => {
    const { service } = setup();

    const vehicle = await service.create('biz-a', 'user-a', { plate: 'abc-123' });

    expect(vehicle.plate).toBe('abc-123');
    expect(vehicle.customerId).toBeUndefined();
  });

  it('normaliza la placa a mayúsculas sin espacios ni guiones para comparar (BR-C6)', async () => {
    const { service, vehicles } = setup();

    const vehicle = await service.create('biz-a', 'user-a', { plate: 'abc-123 x' });

    expect(vehicles.get(vehicle.id)?.plateNormalized).toBe('ABC123X');
  });

  it('rechaza una placa duplicada en el mismo negocio con PLATE_ALREADY_EXISTS', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { plate: 'ABC-123' });

    await expect(service.create('biz-a', 'user-a', { plate: 'abc 123' })).rejects.toMatchObject({
      code: 'PLATE_ALREADY_EXISTS',
    });
  });

  it('permite la misma placa en negocios distintos (unicidad por negocio)', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { plate: 'ABC-123' });

    await expect(service.create('biz-b', 'user-b', { plate: 'ABC-123' })).resolves.toMatchObject({
      plate: 'ABC-123',
    });
  });

  it('rechaza crear con un customerId que no existe en el negocio', async () => {
    const { service } = setup();

    await expect(
      service.create('biz-a', 'user-a', { plate: 'ABC-123', customerId: 'no-existe' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('rechaza crear con un customerId que existe pero en otro negocio', async () => {
    const { service, customers } = setup();
    customers.set('cust-b', { id: 'cust-b', businessId: 'biz-b', isActive: true });

    await expect(
      service.create('biz-a', 'user-a', { plate: 'ABC-123', customerId: 'cust-b' }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('lookup encuentra por coincidencia parcial de placa, normalizada', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { plate: 'ABC-123' });
    await service.create('biz-a', 'user-a', { plate: 'XYZ-999' });

    const found = await service.lookup('biz-a', 'bc12');

    expect(found).toHaveLength(1);
    expect(found[0]?.plate).toBe('ABC-123');
  });

  it('lookup no cruza negocios', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { plate: 'ABC-123' });

    const found = await service.lookup('biz-b', 'ABC');

    expect(found).toHaveLength(0);
  });

  it('findOne rechaza con VEHICLE_NOT_FOUND para un vehículo de otro negocio', async () => {
    const { service } = setup();
    const vehicle = await service.create('biz-b', 'user-b', { plate: 'ABC-123' });

    await expect(service.findOne('biz-a', vehicle.id)).rejects.toMatchObject({
      code: 'VEHICLE_NOT_FOUND',
    });
  });

  it('update permite corregir la placa y recalcula plateNormalized', async () => {
    const { service, vehicles } = setup();
    const vehicle = await service.create('biz-a', 'user-a', { plate: 'ABC-123' });

    const updated = await service.update('biz-a', vehicle.id, { plate: 'ZZZ-999' });

    expect(updated.plate).toBe('ZZZ-999');
    expect(vehicles.get(vehicle.id)?.plateNormalized).toBe('ZZZ999');
  });

  it('update asigna un cliente existente del mismo negocio', async () => {
    const { service, customers } = setup();
    customers.set('cust-1', { id: 'cust-1', businessId: 'biz-a', isActive: true });
    const vehicle = await service.create('biz-a', 'user-a', { plate: 'ABC-123' });

    const updated = await service.update('biz-a', vehicle.id, { customerId: 'cust-1' });

    expect(updated.customerId).toBe('cust-1');
  });

  it('compatibleProducts devuelve [] si el vehículo no tiene modelo asignado', async () => {
    const { service } = setup();
    const vehicle = await service.create('biz-a', 'user-a', { plate: 'ABC-123' });

    await expect(service.compatibleProducts('biz-a', vehicle.id)).resolves.toEqual([]);
  });

  it('compatibleProducts devuelve los productos compatibles con el modelo del vehículo', async () => {
    const { service, vehicleModels, products, compatibilities } = setup();
    vehicleModels.set('model-1', {
      id: 'model-1',
      businessId: 'biz-a',
      make: 'Toyota',
      model: 'Yaris',
    });
    products.set('prod-1', { id: 'prod-1', businessId: 'biz-a', name: 'Filtro X', unit: 'unidad' });
    compatibilities.set('compat-1', {
      id: 'compat-1',
      businessId: 'biz-a',
      productId: 'prod-1',
      vehicleModelId: 'model-1',
      confirmedById: 'user-a',
      confirmedAt: new Date(),
    });
    const vehicle = await service.create('biz-a', 'user-a', {
      plate: 'ABC-123',
      vehicleModelId: 'model-1',
    });

    const found = await service.compatibleProducts('biz-a', vehicle.id);

    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe('prod-1');
  });

  it('compatibleProducts no cruza negocios', async () => {
    const { service, vehicleModels, products, compatibilities } = setup();
    vehicleModels.set('model-1', {
      id: 'model-1',
      businessId: 'biz-a',
      make: 'Toyota',
      model: 'Yaris',
    });
    products.set('prod-1', { id: 'prod-1', businessId: 'biz-a', name: 'Filtro X', unit: 'unidad' });
    compatibilities.set('compat-1', {
      id: 'compat-1',
      businessId: 'biz-a',
      productId: 'prod-1',
      vehicleModelId: 'model-1',
      confirmedById: 'user-a',
      confirmedAt: new Date(),
    });
    const vehicle = await service.create('biz-a', 'user-a', {
      plate: 'ABC-123',
      vehicleModelId: 'model-1',
    });

    await expect(service.compatibleProducts('biz-b', vehicle.id)).rejects.toMatchObject({
      code: 'VEHICLE_NOT_FOUND',
    });
  });
});
