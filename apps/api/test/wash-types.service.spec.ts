import { Prisma } from '@prisma/client';
import { WashTypesService } from '../src/washes/wash-types.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['washType', 'washPriceOption'], {
    washType: [['businessId', 'name']],
  });
  const service = new WashTypesService(prisma);
  return {
    service,
    types: stores.get('washType')!,
    prices: stores.get('washPriceOption')!,
  };
}

describe('WashTypesService', () => {
  describe('create', () => {
    it('crea un tipo activo, sin imagen y con sortOrder 0 por defecto', async () => {
      const { service } = setup();

      const type = await service.create('biz-a', { name: 'Lavado Auto' });

      expect(type).toMatchObject({
        name: 'Lavado Auto',
        imageKey: null,
        sortOrder: 0,
        isActive: true,
        businessId: 'biz-a',
      });
      expect(type.id).toEqual(expect.any(String));
    });

    it('respeta el id, imageKey y sortOrder enviados', async () => {
      const { service } = setup();
      const id = '5b0c3f7e-9d5a-4a53-8f39-3a0c1c7a2b11';

      const type = await service.create('biz-a', {
        id,
        name: 'Moto',
        imageKey: 'wash/moto.png',
        sortOrder: 3,
      });

      expect(type).toMatchObject({ id, imageKey: 'wash/moto.png', sortOrder: 3 });
    });

    it('409 WASH_TYPE_ALREADY_EXISTS con un nombre repetido en el mismo negocio', async () => {
      const { service } = setup();
      await service.create('biz-a', { name: 'Lavado Auto' });

      await expect(service.create('biz-a', { name: 'Lavado Auto' })).rejects.toMatchObject({
        code: 'WASH_TYPE_ALREADY_EXISTS',
        status: 409,
      });
    });

    it('permite el mismo nombre en otro negocio', async () => {
      const { service } = setup();
      await service.create('biz-a', { name: 'Lavado Auto' });

      await expect(service.create('biz-b', { name: 'Lavado Auto' })).resolves.toMatchObject({
        businessId: 'biz-b',
      });
    });
  });

  describe('list', () => {
    async function seed(service: WashTypesService) {
      const auto = await service.create('biz-a', { name: 'Auto', sortOrder: 1 });
      const moto = await service.create('biz-a', { name: 'Moto', sortOrder: 0 });
      const off = await service.create('biz-a', { name: 'Camión', sortOrder: 2 });
      await service.update('biz-a', off.id, { isActive: false });
      const p20 = await service.createPrice('biz-a', auto.id, { amount: 20, sortOrder: 1 });
      const p15 = await service.createPrice('biz-a', auto.id, { amount: 15, sortOrder: 0 });
      const pOff = await service.createPrice('biz-a', auto.id, { amount: 30, sortOrder: 2 });
      await service.updatePrice('biz-a', auto.id, pOff.id, { isActive: false });
      await service.create('biz-b', { name: 'Ajeno' });
      return { auto, moto, off, p20, p15, pOff };
    }

    it('por defecto: solo tipos activos, con solo sus precios activos, en orden', async () => {
      const { service } = setup();
      const { auto, moto, p15, p20 } = await seed(service);

      const list = await service.list('biz-a');

      expect(list.map((t) => t.id)).toEqual([moto.id, auto.id]);
      expect(list[1]!.prices.map((p) => p.id)).toEqual([p15.id, p20.id]);
      expect(list[0]!.prices).toEqual([]);
    });

    it('includeInactive=true: también tipos y precios inactivos', async () => {
      const { service } = setup();
      const { auto, moto, off, p15, p20, pOff } = await seed(service);

      const list = await service.list('biz-a', true);

      expect(list.map((t) => t.id)).toEqual([moto.id, auto.id, off.id]);
      expect(list.find((t) => t.id === off.id)!.isActive).toBe(false);
      expect(list[1]!.prices.map((p) => p.id)).toEqual([p15.id, p20.id, pOff.id]);
      expect(list[1]!.prices[2]!.isActive).toBe(false);
    });

    it('desempata por nombre y luego por id (tipos) y por monto y luego id (precios)', async () => {
      const { service } = setup();
      const b = await service.create('biz-a', { name: 'B' });
      const a = await service.create('biz-a', { name: 'A' });
      const hi = await service.createPrice('biz-a', a.id, { amount: 25 });
      const lo = await service.createPrice('biz-a', a.id, {
        id: '00000000-0000-4000-8000-000000000000',
        amount: 10,
      });
      const x2 = await service.createPrice('biz-a', a.id, {
        id: 'ffffffff-0000-4000-8000-000000000000',
        amount: 10,
      });

      const list = await service.list('biz-a');

      expect(list.map((t) => t.id)).toEqual([a.id, b.id]);
      expect(list[0]!.prices.map((p) => p.id)).toEqual([lo.id, x2.id, hi.id]);
    });

    it('no devuelve tipos ni precios de otro negocio', async () => {
      const { service } = setup();
      await seed(service);

      const list = await service.list('biz-b', true);

      expect(list.map((t) => t.name)).toEqual(['Ajeno']);
      expect(list[0]!.prices).toEqual([]);
    });
  });

  describe('update', () => {
    it('edita nombre, imagen y orden, y desactiva', async () => {
      const { service } = setup();
      const type = await service.create('biz-a', { name: 'Auto', imageKey: 'a.png' });

      const updated = await service.update('biz-a', type.id, {
        name: 'Lavado Auto',
        sortOrder: 5,
        imageKey: null,
        isActive: false,
      });

      expect(updated).toMatchObject({
        name: 'Lavado Auto',
        imageKey: null,
        sortOrder: 5,
        isActive: false,
      });
    });

    it('reactiva un tipo inactivo', async () => {
      const { service } = setup();
      const type = await service.create('biz-a', { name: 'Auto' });
      await service.update('biz-a', type.id, { isActive: false });

      await expect(service.update('biz-a', type.id, { isActive: true })).resolves.toMatchObject({
        isActive: true,
      });
    });

    it('campos ausentes no se tocan', async () => {
      const { service } = setup();
      const type = await service.create('biz-a', { name: 'Auto', imageKey: 'a.png', sortOrder: 2 });

      const updated = await service.update('biz-a', type.id, { sortOrder: 4 });

      expect(updated).toMatchObject({ name: 'Auto', imageKey: 'a.png', sortOrder: 4 });
    });

    it('409 WASH_TYPE_ALREADY_EXISTS al renombrar a un nombre en uso', async () => {
      const { service } = setup();
      await service.create('biz-a', { name: 'Auto' });
      const moto = await service.create('biz-a', { name: 'Moto' });

      await expect(service.update('biz-a', moto.id, { name: 'Auto' })).rejects.toMatchObject({
        code: 'WASH_TYPE_ALREADY_EXISTS',
      });
    });

    it('renombrar a su propio nombre no es un duplicado', async () => {
      const { service } = setup();
      const auto = await service.create('biz-a', { name: 'Auto' });

      await expect(service.update('biz-a', auto.id, { name: 'Auto' })).resolves.toMatchObject({
        name: 'Auto',
      });
    });

    it('un nombre de otro negocio no cuenta como duplicado', async () => {
      const { service } = setup();
      await service.create('biz-b', { name: 'Auto' });
      const moto = await service.create('biz-a', { name: 'Moto' });

      await expect(service.update('biz-a', moto.id, { name: 'Auto' })).resolves.toMatchObject({
        name: 'Auto',
      });
    });

    it('404 WASH_TYPE_NOT_FOUND para un tipo de otro negocio, sin modificarlo', async () => {
      const { service, types } = setup();
      const ajeno = await service.create('biz-b', { name: 'Ajeno' });

      await expect(
        service.update('biz-a', ajeno.id, { name: 'Hackeado', isActive: false }),
      ).rejects.toMatchObject({ code: 'WASH_TYPE_NOT_FOUND', status: 404 });
      expect(types.get(ajeno.id)).toMatchObject({ name: 'Ajeno', isActive: true });
    });

    it('404 WASH_TYPE_NOT_FOUND para un id inexistente', async () => {
      const { service } = setup();

      await expect(
        service.update('biz-a', '00000000-0000-4000-8000-000000000000', { sortOrder: 1 }),
      ).rejects.toMatchObject({ code: 'WASH_TYPE_NOT_FOUND' });
    });
  });

  describe('createPrice', () => {
    it('crea un precio activo del tipo de la URL, con monto Decimal', async () => {
      const { service } = setup();
      const auto = await service.create('biz-a', { name: 'Auto' });

      const price = await service.createPrice('biz-a', auto.id, {
        amount: 25.5,
        label: 'Grande',
        sortOrder: 1,
      });

      expect(price).toMatchObject({
        washTypeId: auto.id,
        businessId: 'biz-a',
        label: 'Grande',
        sortOrder: 1,
        isActive: true,
      });
      expect(price.amount).toBeInstanceOf(Prisma.Decimal);
      expect(price.amount.toString()).toBe('25.5');
    });

    it('sin label ni sortOrder: null y 0', async () => {
      const { service } = setup();
      const auto = await service.create('biz-a', { name: 'Auto' });

      await expect(service.createPrice('biz-a', auto.id, { amount: 10 })).resolves.toMatchObject({
        label: null,
        sortOrder: 0,
      });
    });

    it('404 WASH_TYPE_NOT_FOUND si el tipo es de otro negocio, sin crear nada', async () => {
      const { service, prices } = setup();
      const ajeno = await service.create('biz-b', { name: 'Ajeno' });

      await expect(service.createPrice('biz-a', ajeno.id, { amount: 10 })).rejects.toMatchObject({
        code: 'WASH_TYPE_NOT_FOUND',
      });
      expect(prices.size).toBe(0);
    });
  });

  describe('updatePrice', () => {
    async function withPrice() {
      const ctx = setup();
      const auto = await ctx.service.create('biz-a', { name: 'Auto' });
      const price = await ctx.service.createPrice('biz-a', auto.id, {
        amount: 20,
        label: 'Chico',
      });
      return { ...ctx, auto, price };
    }

    it('edita monto, etiqueta y orden', async () => {
      const { service, auto, price } = await withPrice();

      const updated = await service.updatePrice('biz-a', auto.id, price.id, {
        amount: 22.9,
        label: 'Mediano',
        sortOrder: 3,
      });

      expect(updated.amount.toString()).toBe('22.9');
      expect(updated).toMatchObject({ label: 'Mediano', sortOrder: 3, isActive: true });
    });

    it('label null quita la etiqueta', async () => {
      const { service, auto, price } = await withPrice();

      const updated = await service.updatePrice('biz-a', auto.id, price.id, { label: null });

      expect(updated.label).toBeNull();
      expect(updated.amount.toString()).toBe('20');
    });

    it('desactiva y reactiva un precio', async () => {
      const { service, auto, price } = await withPrice();

      await expect(
        service.updatePrice('biz-a', auto.id, price.id, { isActive: false }),
      ).resolves.toMatchObject({ isActive: false });
      await expect(
        service.updatePrice('biz-a', auto.id, price.id, { isActive: true }),
      ).resolves.toMatchObject({ isActive: true });
    });

    it('404 WASH_PRICE_NOT_FOUND para un priceId inexistente', async () => {
      const { service, auto } = await withPrice();

      await expect(
        service.updatePrice('biz-a', auto.id, '00000000-0000-4000-8000-000000000000', {
          amount: 1,
        }),
      ).rejects.toMatchObject({ code: 'WASH_PRICE_NOT_FOUND', status: 404 });
    });

    it('409 WASH_PRICE_NOT_IN_TYPE para un precio de otro tipo del mismo negocio', async () => {
      const { service, prices, price } = await withPrice();
      const moto = await service.create('biz-a', { name: 'Moto' });

      await expect(
        service.updatePrice('biz-a', moto.id, price.id, { amount: 1 }),
      ).rejects.toMatchObject({ code: 'WASH_PRICE_NOT_IN_TYPE', status: 409 });
      expect(String(prices.get(price.id)!.amount)).toBe('20');
    });

    it('404 WASH_PRICE_NOT_FOUND para un precio de otro negocio, sin modificarlo', async () => {
      const { service, prices, auto } = await withPrice();
      const ajeno = await service.create('biz-b', { name: 'Ajeno' });
      const precioAjeno = await service.createPrice('biz-b', ajeno.id, { amount: 50 });

      await expect(
        service.updatePrice('biz-a', auto.id, precioAjeno.id, { isActive: false }),
      ).rejects.toMatchObject({ code: 'WASH_PRICE_NOT_FOUND' });
      expect(prices.get(precioAjeno.id)).toMatchObject({ isActive: true });
    });

    it('404 WASH_TYPE_NOT_FOUND si el tipo de la URL es de otro negocio', async () => {
      const { service, price } = await withPrice();
      const ajeno = await service.create('biz-b', { name: 'Ajeno' });

      await expect(
        service.updatePrice('biz-a', ajeno.id, price.id, { amount: 1 }),
      ).rejects.toMatchObject({ code: 'WASH_TYPE_NOT_FOUND' });
    });
  });
});
