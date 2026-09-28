import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { applyGlobalPrefix } from '../src/common/openapi/openapi-document';
import { validationExceptionFactory } from '../src/common/validation-exception-factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { FixedWindowStore } from '../src/rate-limit/fixed-window.store';
import { WashTypesService } from '../src/washes/wash-types.service';

/**
 * Configuración de lavados (R5, B-141, 06-API.md §2 "Lavados") por HTTP, con
 * la app montada como en main.ts (prefijo, ValidationPipe y filtro de
 * errores). Crea negocios y usuarios desechables, así que solo corre contra
 * una base de prueba (nombre terminado en "_test").
 *
 * El rate limit (DEC-86) permite 30 escrituras por minuto por usuario, sumando
 * todas las rutas, y este archivo hace más con el mismo usuario: el contador
 * se reinicia antes de cada prueba (ninguna llega al límite por sí sola). Los
 * tipos y precios que solo sirven de fixture se crean con el servicio.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

const TYPE_KEYS = ['createdAt', 'id', 'imageKey', 'isActive', 'name', 'sortOrder', 'updatedAt'];
const PRICE_KEYS = [
  'amount',
  'createdAt',
  'id',
  'isActive',
  'label',
  'sortOrder',
  'updatedAt',
  'washTypeId',
];

describeIfTestDb('Tipos de lavado /api/v1/wash-types (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let washTypes: WashTypesService;
  let token: string;
  let businessId: string;
  let otherBusinessId: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const list = (query = '') => auth(request(server()).get(`/api/v1/wash-types${query}`));
  const postType = (body: unknown) =>
    auth(request(server()).post('/api/v1/wash-types')).send(body as object);
  const patchType = (id: string, body: unknown) =>
    auth(request(server()).patch(`/api/v1/wash-types/${id}`)).send(body as object);
  const postPrice = (typeId: string, body: unknown) =>
    auth(request(server()).post(`/api/v1/wash-types/${typeId}/prices`)).send(body as object);
  const patchPrice = (typeId: string, priceId: string, body: unknown) =>
    auth(request(server()).patch(`/api/v1/wash-types/${typeId}/prices/${priceId}`)).send(
      body as object,
    );

  const uniqueName = (prefix: string) => `${prefix} ${randomUUID().slice(0, 8)}`;

  // Contador real del rate limit, reemplazado por uno nuevo en cada prueba.
  let rateLimitStore = new FixedWindowStore();
  beforeEach(() => {
    rateLimitStore = new FixedWindowStore();
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FixedWindowStore)
      .useValue({
        hit: (...args: Parameters<FixedWindowStore['hit']>) => rateLimitStore.hit(...args),
      })
      .compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    washTypes = app.get(WashTypesService);

    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E R5 ${suffix}`, slug: `e2e-r5-${suffix}` },
    });
    await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R5',
        username: `e2e-r5-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;

    const other = await prisma.business.create({
      data: { name: `E2E R5 otro ${suffix}`, slug: `e2e-r5-otro-${suffix}` },
    });
    otherBusinessId = other.id;

    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r5-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/wash-types', () => {
    it('201: crea el tipo activo, con trim, sin businessId en la respuesta', async () => {
      const id = randomUUID();
      const res = await postType({
        id,
        name: '  Lavado Auto  ',
        imageKey: 'wash/auto.png',
        sortOrder: 2,
      }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(TYPE_KEYS);
      expect(res.body).toMatchObject({
        id,
        name: 'Lavado Auto',
        imageKey: 'wash/auto.png',
        sortOrder: 2,
        isActive: true,
      });
      const stored = await prisma.washType.findFirstOrThrow({ where: { id } });
      expect(stored.businessId).toBe(businessId);
    });

    it('409 WASH_TYPE_ALREADY_EXISTS con un nombre repetido (también tras el trim)', async () => {
      const name = uniqueName('Dup');
      await postType({ name }).expect(201);

      const res = await postType({ name: ` ${name} ` }).expect(409);

      expect(res.body.code).toBe('WASH_TYPE_ALREADY_EXISTS');
    });

    it('permite un nombre que ya usa otro negocio', async () => {
      const name = uniqueName('Compartido');
      await washTypes.create(otherBusinessId, { name });

      await postType({ name }).expect(201);
    });

    it.each([
      ['name ausente', {}],
      ['name vacío tras el trim', { name: '   ' }],
      ['name de 101 caracteres', { name: 'x'.repeat(101) }],
      ['name no texto', { name: 12 }],
      ['sortOrder negativo', { name: 'Ok', sortOrder: -1 }],
      ['sortOrder decimal', { name: 'Ok', sortOrder: 1.5 }],
      ['isActive (no se decide al crear)', { name: 'Ok', isActive: false }],
      ['campo desconocido', { name: 'Ok', price: 10 }],
      ['id no UUID', { id: 'abc', name: 'Ok' }],
    ])('400: %s', async (_, body) => {
      const res = await postType(body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/wash-types', () => {
    let activeId: string;
    let inactiveId: string;
    let p10: string;
    let p5: string;
    let pOff: string;

    beforeAll(async () => {
      const active = await washTypes.create(businessId, {
        name: uniqueName('Activo'),
        sortOrder: 9000,
      });
      const inactive = await washTypes.create(businessId, {
        name: uniqueName('Inactivo'),
        sortOrder: 9001,
      });
      await washTypes.update(businessId, inactive.id, { isActive: false });
      activeId = active.id;
      inactiveId = inactive.id;
      p10 = (await washTypes.createPrice(businessId, activeId, { amount: 10, sortOrder: 1 })).id;
      p5 = (await washTypes.createPrice(businessId, activeId, { amount: 5, sortOrder: 0 })).id;
      pOff = (await washTypes.createPrice(businessId, activeId, { amount: 7, sortOrder: 2 })).id;
      await washTypes.updatePrice(businessId, activeId, pOff, { isActive: false });
      await washTypes.createPrice(businessId, inactiveId, { amount: 3 });

      const foreign = await washTypes.create(otherBusinessId, { name: uniqueName('Ajeno') });
      await washTypes.createPrice(otherBusinessId, foreign.id, { amount: 99 });
    });

    it('por defecto: solo tipos activos con solo precios activos, ordenados y sin datos ajenos', async () => {
      const res = await list().expect(200);
      const body = res.body as { id: string; isActive: boolean; prices: { id: string }[] }[];

      expect(body.every((type) => type.isActive)).toBe(true);
      expect(body.map((type) => type.id)).not.toContain(inactiveId);
      const active = body.find((type) => type.id === activeId)!;
      expect(Object.keys(active).sort()).toEqual([...TYPE_KEYS, 'prices'].sort());
      expect(active.prices.map((price) => price.id)).toEqual([p5, p10]);
      expect(Object.keys(active.prices[0]!).sort()).toEqual(PRICE_KEYS);
      expect(active.prices[0]).toMatchObject({ amount: '5', label: null, washTypeId: activeId });

      const foreignIds = (
        await prisma.washType.findMany({ where: { businessId: otherBusinessId } })
      ).map((type) => type.id);
      expect(body.some((type) => foreignIds.includes(type.id))).toBe(false);
    });

    it('includeInactive=true: también tipos y precios inactivos', async () => {
      const res = await list('?includeInactive=true').expect(200);
      const body = res.body as { id: string; isActive: boolean; prices: { id: string }[] }[];

      const inactive = body.find((type) => type.id === inactiveId);
      expect(inactive).toMatchObject({ isActive: false });
      expect(inactive!.prices).toHaveLength(1);
      expect(body.find((type) => type.id === activeId)!.prices.map((p) => p.id)).toEqual([
        p5,
        p10,
        pOff,
      ]);
      const sortOrders = (body as unknown as { sortOrder: number }[]).map((t) => t.sortOrder);
      expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
    });

    it('includeInactive=false explícito: igual que por defecto', async () => {
      const res = await list('?includeInactive=false').expect(200);
      expect((res.body as { id: string }[]).map((type) => type.id)).not.toContain(inactiveId);
    });

    it('400 con includeInactive no booleano o un query desconocido', async () => {
      await list('?includeInactive=si').expect(400);
      await list('?foo=1').expect(400);
    });

    it('401 sin token', async () => {
      await request(server()).get('/api/v1/wash-types').expect(401);
    });
  });

  describe('PATCH /api/v1/wash-types/:id', () => {
    it('edita nombre, imagen y orden; desactiva y reactiva', async () => {
      const type = await washTypes.create(businessId, {
        name: uniqueName('Editar'),
        imageKey: 'a.png',
      });
      const newName = uniqueName('Editado');

      const res = await patchType(type.id, {
        name: `  ${newName} `,
        imageKey: null,
        sortOrder: 7,
      }).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(TYPE_KEYS);
      expect(res.body).toMatchObject({
        name: newName,
        imageKey: null,
        sortOrder: 7,
        isActive: true,
      });

      await patchType(type.id, { isActive: false })
        .expect(200)
        .expect((r) => expect(r.body.isActive).toBe(false));
      await patchType(type.id, { isActive: true })
        .expect(200)
        .expect((r) => expect(r.body.isActive).toBe(true));
      // Sin borrado físico.
      await expect(prisma.washType.count({ where: { id: type.id } })).resolves.toBe(1);
    });

    it('409 WASH_TYPE_ALREADY_EXISTS al renombrar a un nombre en uso', async () => {
      const taken = await washTypes.create(businessId, { name: uniqueName('Tomado') });
      const type = await washTypes.create(businessId, { name: uniqueName('Renombrar') });

      const res = await patchType(type.id, { name: taken.name }).expect(409);
      expect(res.body.code).toBe('WASH_TYPE_ALREADY_EXISTS');
    });

    it('404 WASH_TYPE_NOT_FOUND para un tipo de otro negocio, que queda intacto', async () => {
      const foreign = await washTypes.create(otherBusinessId, { name: uniqueName('Ajeno') });

      const res = await patchType(foreign.id, { name: 'Hackeado', isActive: false }).expect(404);

      expect(res.body.code).toBe('WASH_TYPE_NOT_FOUND');
      await expect(
        prisma.washType.findFirstOrThrow({ where: { id: foreign.id } }),
      ).resolves.toMatchObject({ name: foreign.name, isActive: true });
    });

    it('404 WASH_TYPE_NOT_FOUND para un id inexistente; 400 para un id no UUID', async () => {
      const res = await patchType(randomUUID(), { sortOrder: 1 }).expect(404);
      expect(res.body.code).toBe('WASH_TYPE_NOT_FOUND');
      await patchType('no-uuid', { sortOrder: 1 }).expect(400);
    });

    it.each([
      ['name null', { name: null }],
      ['name vacío', { name: ' ' }],
      ['name de 101 caracteres', { name: 'x'.repeat(101) }],
      ['sortOrder negativo', { sortOrder: -1 }],
      ['isActive no booleano', { isActive: 'no' }],
      ['campo desconocido', { businessId: randomUUID() }],
    ])('400: %s', async (_, body) => {
      const type = await washTypes.create(businessId, { name: uniqueName('Val') });
      const res = await patchType(type.id, body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/wash-types/:id/prices', () => {
    it('201: crea el precio activo del tipo de la URL, monto como string y label con trim', async () => {
      const type = await washTypes.create(businessId, { name: uniqueName('Precios') });
      const id = randomUUID();

      const res = await postPrice(type.id, {
        id,
        amount: 25.5,
        label: '  Grande ',
        sortOrder: 1,
      }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(PRICE_KEYS);
      expect(res.body).toMatchObject({
        id,
        washTypeId: type.id,
        amount: '25.5',
        label: 'Grande',
        sortOrder: 1,
        isActive: true,
      });
      const stored = await prisma.washPriceOption.findFirstOrThrow({ where: { id } });
      expect(stored.businessId).toBe(businessId);
    });

    it('404 WASH_TYPE_NOT_FOUND para un tipo de otro negocio, sin crear el precio', async () => {
      const foreign = await washTypes.create(otherBusinessId, { name: uniqueName('Ajeno') });

      const res = await postPrice(foreign.id, { amount: 10 }).expect(404);

      expect(res.body.code).toBe('WASH_TYPE_NOT_FOUND');
      await expect(
        prisma.washPriceOption.count({ where: { washTypeId: foreign.id } }),
      ).resolves.toBe(0);
    });

    it('404 WASH_TYPE_NOT_FOUND para un tipo inexistente', async () => {
      const res = await postPrice(randomUUID(), { amount: 10 }).expect(404);
      expect(res.body.code).toBe('WASH_TYPE_NOT_FOUND');
    });

    it.each([
      ['amount ausente', {}],
      ['amount 0', { amount: 0 }],
      ['amount negativo', { amount: -5 }],
      ['amount con 3 decimales', { amount: 10.123 }],
      ['amount mayor que Decimal(10,2)', { amount: 100_000_000 }],
      ['label de 101 caracteres', { amount: 10, label: 'x'.repeat(101) }],
      ['sortOrder negativo', { amount: 10, sortOrder: -1 }],
      ['washTypeId en el body', { amount: 10, washTypeId: randomUUID() }],
      ['isActive (no se decide al crear)', { amount: 10, isActive: false }],
    ])('400: %s', async (_, body) => {
      const type = await washTypes.create(businessId, { name: uniqueName('ValP') });
      const res = await postPrice(type.id, body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/wash-types/:id/prices/:priceId', () => {
    async function typeWithPrice(owner = businessId) {
      const type = await washTypes.create(owner, { name: uniqueName('PP') });
      const price = await washTypes.createPrice(owner, type.id, { amount: 20, label: 'Chico' });
      return { type, price };
    }

    it('edita monto, etiqueta y orden; label null la quita; desactiva sin borrar', async () => {
      const { type, price } = await typeWithPrice();

      const res = await patchPrice(type.id, price.id, {
        amount: 22.9,
        label: ' Mediano ',
        sortOrder: 3,
      }).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(PRICE_KEYS);
      expect(res.body).toMatchObject({ amount: '22.9', label: 'Mediano', sortOrder: 3 });

      await patchPrice(type.id, price.id, { label: null })
        .expect(200)
        .expect((r) => expect(r.body).toMatchObject({ label: null, amount: '22.9' }));

      await patchPrice(type.id, price.id, { isActive: false })
        .expect(200)
        .expect((r) => expect(r.body.isActive).toBe(false));
      await expect(prisma.washPriceOption.count({ where: { id: price.id } })).resolves.toBe(1);
    });

    it('404 WASH_PRICE_NOT_FOUND para un priceId inexistente', async () => {
      const { type } = await typeWithPrice();

      const res = await patchPrice(type.id, randomUUID(), { amount: 1 }).expect(404);
      expect(res.body.code).toBe('WASH_PRICE_NOT_FOUND');
    });

    it('409 WASH_PRICE_NOT_IN_TYPE para un precio de otro tipo del mismo negocio', async () => {
      const { price } = await typeWithPrice();
      const { type: otherType } = await typeWithPrice();

      const res = await patchPrice(otherType.id, price.id, { amount: 1 }).expect(409);

      expect(res.body.code).toBe('WASH_PRICE_NOT_IN_TYPE');
      const stored = await prisma.washPriceOption.findFirstOrThrow({ where: { id: price.id } });
      expect(stored.amount.toString()).toBe('20');
    });

    it('404 para un precio de otro negocio (con su tipo o con uno propio), sin tocarlo', async () => {
      const mine = await typeWithPrice();
      const foreign = await typeWithPrice(otherBusinessId);

      const viaForeignType = await patchPrice(foreign.type.id, foreign.price.id, {
        isActive: false,
      }).expect(404);
      expect(viaForeignType.body.code).toBe('WASH_TYPE_NOT_FOUND');

      const viaOwnType = await patchPrice(mine.type.id, foreign.price.id, {
        isActive: false,
      }).expect(404);
      expect(viaOwnType.body.code).toBe('WASH_PRICE_NOT_FOUND');

      await expect(
        prisma.washPriceOption.findFirstOrThrow({ where: { id: foreign.price.id } }),
      ).resolves.toMatchObject({ isActive: true, label: 'Chico' });
    });

    it('400 para ids que no son UUID', async () => {
      const { type, price } = await typeWithPrice();
      await patchPrice('no-uuid', price.id, { amount: 1 }).expect(400);
      await patchPrice(type.id, 'no-uuid', { amount: 1 }).expect(400);
    });

    it.each([
      ['amount 0', { amount: 0 }],
      ['amount null', { amount: null }],
      ['amount con 3 decimales', { amount: 1.005 }],
      ['label de 101 caracteres', { label: 'x'.repeat(101) }],
      ['sortOrder decimal', { sortOrder: 0.5 }],
      ['isActive null', { isActive: null }],
      ['campo desconocido', { washTypeId: randomUUID() }],
    ])('400: %s', async (_, body) => {
      const { type, price } = await typeWithPrice();
      const res = await patchPrice(type.id, price.id, body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
