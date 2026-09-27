import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { WASH_CATALOG, seedBrigithWashes } from '../../prisma/seed-washes';
import type { Env } from '../../src/config/env.validation';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WashTypesService } from '../../src/washes/wash-types.service';

/**
 * Siembra de tipos y precios de lavado (R5, B-145) contra Postgres real,
 * sobre un negocio de prueba: nunca usa ni pisa "brigith" ni "demo".
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan Postgres.',
  );
}
// Salvaguarda: estas pruebas escriben. Nunca contra una base que no sea de prueba.
if (!/\/[^/?]*_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test".');
}

const prisma = new PrismaService({ get: () => url } as unknown as ConfigService<Env, true>);
const washTypes = new WashTypesService(prisma);

async function createBusiness(): Promise<string> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R5 seed ${suffix}`, slug: `r5-seed-${suffix}` },
  });
  return business.id;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Siembra de lavados de brigith (sobre un negocio de prueba)', () => {
  it('crea exactamente los tipos y montos confirmados, en orden, y es idempotente', async () => {
    const businessId = await createBusiness();

    const first = await seedBrigithWashes(prisma, businessId);
    const second = await seedBrigithWashes(prisma, businessId);

    expect(first).toEqual({ washTypes: 9, washPricesCreated: 8 });
    expect(second).toEqual({ washTypes: 9, washPricesCreated: 0 });

    const list = await washTypes.list(businessId, true);
    expect(
      list.map((type) => ({
        name: type.name,
        isActive: type.isActive,
        amounts: type.prices.map((price) => price.amount.toString()),
      })),
    ).toEqual([
      { name: 'Moto lineal', isActive: true, amounts: ['8', '10'] },
      { name: 'Tico', isActive: true, amounts: ['15'] },
      { name: 'Auto', isActive: true, amounts: ['15'] },
      { name: 'Mototaxi', isActive: true, amounts: ['15'] },
      { name: 'Camioneta', isActive: true, amounts: ['30', '40'] },
      { name: 'Furgón', isActive: true, amounts: ['30'] },
      { name: 'Minibán', isActive: true, amounts: [] },
      { name: 'Combi', isActive: true, amounts: [] },
      { name: 'Moto carguera', isActive: true, amounts: [] },
    ]);
    expect(list).toHaveLength(WASH_CATALOG.length);

    // Nada inventado: sin etiquetas ni imágenes, todo activo.
    const where = { businessId };
    expect(await prisma.washPriceOption.count({ where })).toBe(8);
    expect(
      await prisma.washPriceOption.count({
        where: { ...where, OR: [{ label: { not: null } }, { isActive: false }] },
      }),
    ).toBe(0);
    expect(await prisma.washType.count({ where: { ...where, imageKey: { not: null } } })).toBe(0);
  });

  it('volver a sembrar no pisa lo que el dueño cambió desde la app', async () => {
    const businessId = await createBusiness();
    await seedBrigithWashes(prisma, businessId);
    const [auto, combi] = await Promise.all([
      prisma.washType.findFirstOrThrow({ where: { businessId, name: 'Auto' } }),
      prisma.washType.findFirstOrThrow({ where: { businessId, name: 'Combi' } }),
    ]);
    const autoPrice = await prisma.washPriceOption.findFirstOrThrow({
      where: { businessId, washTypeId: auto.id },
    });
    await washTypes.updatePrice(businessId, auto.id, autoPrice.id, { amount: 18 });
    await washTypes.update(businessId, auto.id, { sortOrder: 50 });
    await washTypes.createPrice(businessId, combi.id, { amount: 25 });
    await washTypes.update(businessId, combi.id, { isActive: false });

    await expect(seedBrigithWashes(prisma, businessId)).resolves.toEqual({
      washTypes: 9,
      washPricesCreated: 0,
    });

    const autoPrices = await prisma.washPriceOption.findMany({
      where: { businessId, washTypeId: auto.id },
    });
    expect(autoPrices.map((price) => price.amount.toString())).toEqual(['18']);
    expect(await prisma.washType.findFirstOrThrow({ where: { id: auto.id } })).toMatchObject({
      sortOrder: 50,
    });
    const combiPrices = await prisma.washPriceOption.findMany({
      where: { businessId, washTypeId: combi.id },
    });
    expect(combiPrices.map((price) => price.amount.toString())).toEqual(['25']);
    expect(await prisma.washType.findFirstOrThrow({ where: { id: combi.id } })).toMatchObject({
      isActive: false,
    });
  });

  it('solo siembra el negocio indicado', async () => {
    const seeded = await createBusiness();
    const untouched = await createBusiness();

    await seedBrigithWashes(prisma, seeded);

    expect(await prisma.washType.count({ where: { businessId: untouched } })).toBe(0);
    expect(await prisma.washPriceOption.count({ where: { businessId: untouched } })).toBe(0);
  });
});
