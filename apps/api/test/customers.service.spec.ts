import { CustomersService } from '../src/customers/customers.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['customer']);
  const service = new CustomersService(prisma);
  return { service, customers: stores.get('customer')! };
}

describe('CustomersService', () => {
  it('crea un cliente sin ningún campo obligatorio (BR-C3)', async () => {
    const { service } = setup();

    const customer = await service.create('biz-a', 'user-a', {});

    expect(customer.id).toEqual(expect.any(String));
    expect(customer.name).toBeUndefined();
    expect(customer.phone).toBeUndefined();
  });

  it('usa el id enviado por el cliente si llega', async () => {
    const { service } = setup();

    const customer = await service.create('biz-a', 'user-a', { id: 'custom-id' });

    expect(customer.id).toBe('custom-id');
  });

  it('guarda el negocio y quién lo creó', async () => {
    const { service, customers } = setup();

    const customer = await service.create('biz-a', 'user-a', { name: 'Ana' });

    const stored = customers.get(customer.id);
    expect(stored?.businessId).toBe('biz-a');
    expect(stored?.createdById).toBe('user-a');
  });

  it('list sin search devuelve solo los clientes del negocio (aislamiento)', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { name: 'Ana' });
    await service.create('biz-b', 'user-b', { name: 'Beto' });

    const page = await service.list('biz-a', {});

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe('Ana');
  });

  it('list con search filtra por nombre o teléfono, sin distinguir mayúsculas', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { name: 'Ana Torres' });
    await service.create('biz-a', 'user-a', { name: 'Beto', phone: '987654321' });

    const byName = await service.list('biz-a', { search: 'ana' });
    expect(byName.items).toHaveLength(1);
    expect(byName.items[0]?.name).toBe('Ana Torres');

    const byPhone = await service.list('biz-a', { search: '9876' });
    expect(byPhone.items).toHaveLength(1);
    expect(byPhone.items[0]?.name).toBe('Beto');
  });

  it('list pagina con limit y devuelve nextCursor cuando hay más resultados', async () => {
    const { service } = setup();
    await service.create('biz-a', 'user-a', { id: 'c1', name: 'Uno' });
    await service.create('biz-a', 'user-a', { id: 'c2', name: 'Dos' });
    await service.create('biz-a', 'user-a', { id: 'c3', name: 'Tres' });

    const page = await service.list('biz-a', { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(page.items.at(-1)?.id);
  });

  it('findOneWithVehicles rechaza con CUSTOMER_NOT_FOUND si no existe', async () => {
    const { service } = setup();
    await expect(service.findOneWithVehicles('biz-a', 'no-existe')).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });
  });

  it('findOneWithVehicles rechaza un cliente de otro negocio como si no existiera', async () => {
    const { service } = setup();
    const customer = await service.create('biz-b', 'user-b', { name: 'Ajeno' });

    await expect(service.findOneWithVehicles('biz-a', customer.id)).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });
  });

  it('update edita los campos enviados', async () => {
    const { service } = setup();
    const customer = await service.create('biz-a', 'user-a', { name: 'Ana' });

    const updated = await service.update('biz-a', customer.id, { phone: '999888777' });

    expect(updated.name).toBe('Ana');
    expect(updated.phone).toBe('999888777');
  });

  it('update rechaza con CUSTOMER_NOT_FOUND si el cliente es de otro negocio', async () => {
    const { service } = setup();
    const customer = await service.create('biz-b', 'user-b', { name: 'Ajeno' });

    await expect(service.update('biz-a', customer.id, { name: 'Hackeado' })).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });
  });

  it('deactivate pone isActive en false', async () => {
    const { service, customers } = setup();
    const customer = await service.create('biz-a', 'user-a', { name: 'Ana' });

    await service.deactivate('biz-a', customer.id);

    expect(customers.get(customer.id)?.isActive).toBe(false);
  });
});
