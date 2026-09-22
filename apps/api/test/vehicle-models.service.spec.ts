import { VehicleModelsService } from '../src/vehicles/vehicle-models.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['vehicleModel']);
  const service = new VehicleModelsService(prisma);
  return { service, vehicleModels: stores.get('vehicleModel')! };
}

describe('VehicleModelsService', () => {
  it('crea un modelo con año y motor opcionales (BR-F6)', async () => {
    const { service } = setup();

    const model = await service.create('biz-a', 'user-a', { make: 'Toyota', model: 'Hilux' });

    expect(model.yearFrom).toBeUndefined();
    expect(model.engineNote).toBeUndefined();
  });

  it('list solo devuelve los modelos del negocio (aislamiento)', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { make: 'Toyota', model: 'Hilux' });
    await service.create('biz-b', 'user-b', { make: 'Nissan', model: 'Frontier' });

    const models = await service.list('biz-a');

    expect(models).toHaveLength(1);
    expect(models[0]?.make).toBe('Toyota');
  });

  it('update rechaza con VEHICLE_MODEL_NOT_FOUND para un modelo de otro negocio', async () => {
    const { service } = setup();
    const model = await service.create('biz-b', 'user-b', { make: 'Nissan', model: 'Frontier' });

    await expect(service.update('biz-a', model.id, { engineNote: 'diésel' })).rejects.toMatchObject(
      { code: 'VEHICLE_MODEL_NOT_FOUND' },
    );
  });

  it('update permite desactivar el modelo', async () => {
    const { service, vehicleModels } = setup();
    const model = await service.create('biz-a', 'user-a', { make: 'Toyota', model: 'Hilux' });

    await service.update('biz-a', model.id, { isActive: false });

    expect(vehicleModels.get(model.id)?.isActive).toBe(false);
  });
});
