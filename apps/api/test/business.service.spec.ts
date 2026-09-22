import { BusinessService } from '../src/business/business.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, businesses } = buildFakeScopedPrisma([]);
  const service = new BusinessService(prisma);
  businesses.set('biz-a', {
    id: 'biz-a',
    name: 'Brigith',
    slug: 'brigith',
    timezone: 'America/Lima',
    currency: null,
    defaultCountryCode: null,
    reminderLeadDays: null,
    defaultDueRuleWhenBoth: null,
    insufficientStockPolicy: 'ALLOW_WITH_WARNING',
    whatsappTemplate: null,
  });
  return { service, businesses };
}

describe('BusinessService', () => {
  it('get devuelve el negocio del token', async () => {
    const { service } = setup();

    const business = await service.get('biz-a');

    expect(business.slug).toBe('brigith');
  });

  it('updateSettings cambia solo los 6 campos documentados (RF-20)', async () => {
    const { service } = setup();

    const updated = await service.updateSettings('biz-a', {
      whatsappTemplate: 'Hola {cliente}',
      reminderLeadDays: 3,
      defaultDueRuleWhenBoth: 'ANY',
      insufficientStockPolicy: 'BLOCK',
      defaultCountryCode: '51',
      currency: 'PEN',
    });

    expect(updated.whatsappTemplate).toBe('Hola {cliente}');
    expect(updated.reminderLeadDays).toBe(3);
    expect(updated.defaultDueRuleWhenBoth).toBe('ANY');
    expect(updated.insufficientStockPolicy).toBe('BLOCK');
    expect(updated.defaultCountryCode).toBe('51');
    expect(updated.currency).toBe('PEN');
  });

  it('un campo no enviado no se toca', async () => {
    const { service, businesses } = setup();
    businesses.set('biz-a', {
      ...businesses.get('biz-a'),
      whatsappTemplate: 'plantilla existente',
    });

    await service.updateSettings('biz-a', { reminderLeadDays: 5 });

    expect(businesses.get('biz-a')?.whatsappTemplate).toBe('plantilla existente');
    expect(businesses.get('biz-a')?.reminderLeadDays).toBe(5);
  });

  it('un campo enviado como null lo vuelve a dejar sin definir', async () => {
    const { service, businesses } = setup();
    businesses.set('biz-a', { ...businesses.get('biz-a'), reminderLeadDays: 7 });

    await service.updateSettings('biz-a', { reminderLeadDays: null });

    expect(businesses.get('biz-a')?.reminderLeadDays).toBeNull();
  });

  it('no cruza negocios: actualizar biz-a no toca biz-b', async () => {
    const { service, businesses } = setup();
    businesses.set('biz-b', { id: 'biz-b', slug: 'demo', reminderLeadDays: null });

    await service.updateSettings('biz-a', { reminderLeadDays: 9 });

    expect(businesses.get('biz-b')?.reminderLeadDays).toBeNull();
  });
});
