import { MaintenanceTypesService } from '../src/maintenances/maintenance-types.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['maintenanceType'], {
    maintenanceType: [['businessId', 'name']],
  });
  const service = new MaintenanceTypesService(prisma);
  return { service, types: stores.get('maintenanceType')! };
}

describe('MaintenanceTypesService', () => {
  it('crea un tipo de mantenimiento (BR-M13)', async () => {
    const { service } = setup();

    const type = await service.create('biz-a', { name: 'Cambio de aceite' });

    expect(type.name).toBe('Cambio de aceite');
  });

  it('rechaza un nombre duplicado en el mismo negocio', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Cambio de aceite' });

    await expect(service.create('biz-a', { name: 'Cambio de aceite' })).rejects.toMatchObject({
      code: 'MAINTENANCE_TYPE_ALREADY_EXISTS',
    });
  });

  it('list no cruza negocios', async () => {
    const { service } = setup();
    await service.create('biz-a', { name: 'Cambio de aceite' });
    await service.create('biz-b', { name: 'Ajeno' });

    const list = await service.list('biz-a');

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Cambio de aceite');
  });
});
