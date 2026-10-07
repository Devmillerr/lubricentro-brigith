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
import { WashTypesService } from '../src/washes/wash-types.service';
import { WashesService } from '../src/washes/washes.service';
import { toSaleResponse } from '../src/sales/dto/sale.response';

/**
 * `POST /washes` (R5, B-143, 06-API.md §2 "Lavados") por HTTP, con la app
 * montada como en main.ts. El lavado es una `Sale` `WASH` y se consulta y
 * anula por `/sales` (DEC-59). Crea negocios y usuarios desechables, así que
 * solo corre contra una base de prueba (nombre terminado en "_test").
 *
 * El rate limit global es de 20 peticiones por minuto por endpoint: este
 * archivo hace menos de 20 a cada ruta. Tipos, precios y los lavados que
 * solo sirven de fixture para `/sales` se crean con el servicio.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

const SALE_KEYS = [
  'createdAt',
  'createdById',
  'id',
  'lines',
  'maintenanceId',
  'note',
  'occurredAt',
  'paymentMethod',
  'source',
  'status',
  'total',
  'vehicleId',
  'voidReason',
  'voidedAt',
];
const LINE_KEYS = [
  'codeSnapshot',
  'descriptionSnapshot',
  'id',
  'kind',
  'movesStock',
  'productId',
  'quantity',
  'saleUnitFactor',
  'saleUnitId',
  'saleUnitLabel',
  'subtotal',
  'unitPrice',
  'washTypeId',
];

describeIfTestDb('Lavados /api/v1/washes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let washTypes: WashTypesService;
  let washes: WashesService;
  let token: string;
  let businessId: string;
  let userId: string;
  let otherBusinessId: string;

  // Fixtures del negocio propio.
  let autoId: string;
  let autoName: string;
  let autoPrice: string;
  let autoPriceOff: string;
  let motoPrice: string;
  let offTypeId: string;
  let offTypePrice: string;
  // Del otro negocio.
  let foreignTypeId: string;
  let foreignPrice: string;
  // Producto con stock contado: el lavado no debe tocarlo.
  let productId: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const postWash = (body: unknown, key: string | null = randomUUID()) => {
    const req = auth(request(server()).post('/api/v1/washes'));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };
  const wash = (extra: Record<string, unknown> = {}) => ({
    washTypeId: autoId,
    priceOptionId: autoPrice,
    paymentMethod: 'CASH',
    ...extra,
  });

  async function inventorySnapshot() {
    const [movements, product] = await Promise.all([
      prisma.inventoryMovement.count({ where: { businessId } }),
      prisma.product.findFirstOrThrow({ where: { id: productId } }),
    ]);
    return {
      movements,
      stockQuantity: product.stockQuantity.toString(),
      isCounted: product.isCounted,
    };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    washes = app.get(WashesService);

    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E R5 lavado ${suffix}`, slug: `e2e-r5-lavado-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R5 lavado',
        username: `e2e-r5-lavado-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    userId = user.id;
    const other = await prisma.business.create({
      data: { name: `E2E R5 lavado otro ${suffix}`, slug: `e2e-r5-lavado-otro-${suffix}` },
    });
    otherBusinessId = other.id;

    autoName = `Lavado Auto ${suffix.slice(0, 8)}`;
    const auto = await washTypes.create(businessId, { name: autoName });
    autoId = auto.id;
    autoPrice = (await washTypes.createPrice(businessId, autoId, { amount: 25.5 })).id;
    autoPriceOff = (await washTypes.createPrice(businessId, autoId, { amount: 30 })).id;
    await washTypes.updatePrice(businessId, autoId, autoPriceOff, { isActive: false });
    const moto = await washTypes.create(businessId, { name: `Moto ${suffix.slice(0, 8)}` });
    motoPrice = (await washTypes.createPrice(businessId, moto.id, { amount: 10 })).id;
    const off = await washTypes.create(businessId, { name: `Camión ${suffix.slice(0, 8)}` });
    offTypeId = off.id;
    offTypePrice = (await washTypes.createPrice(businessId, offTypeId, { amount: 40 })).id;
    await washTypes.update(businessId, offTypeId, { isActive: false });

    const foreign = await washTypes.create(otherBusinessId, {
      name: `Ajeno ${suffix.slice(0, 8)}`,
    });
    foreignTypeId = foreign.id;
    foreignPrice = (await washTypes.createPrice(otherBusinessId, foreignTypeId, { amount: 99 })).id;

    const product = await prisma.product.create({
      data: { businessId, name: `E2E ${suffix}`, unit: 'unidad' },
    });
    productId = product.id;
    await prisma.inventoryMovement.create({
      data: {
        businessId,
        productId,
        type: 'COUNT',
        quantityDelta: 8,
        countedQuantity: 8,
        previousBalance: 0,
        resultingBalance: 8,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { stockQuantity: 8, isCounted: true },
    });

    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r5-lavado-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/washes', () => {
    it('201: Sale WASH de una línea, snapshot, monto de la opción, occurredAt, nota e id propio', async () => {
      const id = randomUUID();
      const before = await inventorySnapshot();

      const res = await postWash(
        wash({
          id,
          paymentMethod: 'YAPE',
          occurredAt: '2026-09-20T15:00:00.000Z',
          note: 'pagó con sencillo',
        }),
      ).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(SALE_KEYS);
      expect(res.body).toMatchObject({
        id,
        source: 'WASH',
        status: 'ACTIVE',
        paymentMethod: 'YAPE',
        total: '25.5',
        occurredAt: '2026-09-20T15:00:00.000Z',
        note: 'pagó con sencillo',
        vehicleId: null,
        maintenanceId: null,
        createdById: userId,
        voidedAt: null,
        voidReason: null,
      });
      expect(res.body.lines).toHaveLength(1);
      expect(Object.keys(res.body.lines[0]).sort()).toEqual(LINE_KEYS);
      expect(res.body.lines[0]).toMatchObject({
        kind: 'WASH',
        productId: null,
        washTypeId: autoId,
        descriptionSnapshot: autoName,
        codeSnapshot: null,
        quantity: '1',
        unitPrice: '25.5',
        subtotal: '25.5',
        movesStock: false,
      });

      const stored = await prisma.sale.findFirstOrThrow({ where: { id } });
      expect(stored.businessId).toBe(businessId);
      expect(await inventorySnapshot()).toEqual(before);
      expect(await prisma.inventoryMovement.count({ where: { refType: 'Sale', refId: id } })).toBe(
        0,
      );
    });

    it('sin occurredAt usa la hora del servidor; sin nota, null', async () => {
      const before = Date.now();
      const res = await postWash(wash()).expect(201);

      expect(new Date(res.body.occurredAt as string).getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
      expect(res.body.note).toBeNull();
    });

    it.each([
      ['tipo inexistente', () => ({ washTypeId: randomUUID() }), 404, 'WASH_TYPE_NOT_FOUND'],
      [
        'tipo de otro negocio',
        () => ({ washTypeId: foreignTypeId, priceOptionId: foreignPrice }),
        404,
        'WASH_TYPE_NOT_FOUND',
      ],
      ['precio inexistente', () => ({ priceOptionId: randomUUID() }), 404, 'WASH_PRICE_NOT_FOUND'],
      [
        'precio de otro negocio',
        () => ({ priceOptionId: foreignPrice }),
        404,
        'WASH_PRICE_NOT_FOUND',
      ],
      ['precio de otro tipo', () => ({ priceOptionId: motoPrice }), 409, 'WASH_PRICE_NOT_IN_TYPE'],
      [
        'tipo inactivo',
        () => ({ washTypeId: offTypeId, priceOptionId: offTypePrice }),
        409,
        'WASH_TYPE_INACTIVE',
      ],
      ['precio inactivo', () => ({ priceOptionId: autoPriceOff }), 409, 'WASH_PRICE_INACTIVE'],
    ])('%s → %s %s, sin escribir nada', async (_, extra, status, code) => {
      const id = randomUUID();
      const before = await inventorySnapshot();

      const res = await postWash(wash({ id, ...extra() })).expect(status);

      expect(res.body.code).toBe(code);
      await expect(prisma.sale.count({ where: { id } })).resolves.toBe(0);
      await expect(prisma.saleLine.count({ where: { saleId: id } })).resolves.toBe(0);
      expect(await inventorySnapshot()).toEqual(before);
    });

    it('400 por forma: monto libre, placa, campos faltantes, nota larga y pago inválido', async () => {
      const cases: Record<string, unknown>[] = [
        wash({ amount: 1 }),
        wash({ plate: 'ABC123', customerId: randomUUID() }),
        { paymentMethod: 'CASH' },
        wash({ note: 'x'.repeat(501) }),
        wash({ paymentMethod: 'CARD' }),
        wash({ washTypeId: 'no-uuid' }),
      ];
      for (const body of cases) {
        const res = await postWash(body).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('400 IDEMPOTENCY_KEY_REQUIRED sin la clave', async () => {
      const res = await postWash(wash(), null).expect(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('misma clave y mismo cuerpo: misma respuesta y un solo lavado; otro cuerpo: 409', async () => {
      const key = randomUUID();
      const body = wash({ note: `idem ${key}` });

      const first = await postWash(body, key).expect(201);
      const second = await postWash(body, key).expect(201);
      expect(second.body).toEqual(first.body);
      await expect(prisma.sale.count({ where: { note: `idem ${key}` } })).resolves.toBe(1);

      const reused = await postWash({ ...body, paymentMethod: 'YAPE' }, key).expect(409);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      await expect(prisma.sale.count({ where: { businessId, note: `idem ${key}` } })).resolves.toBe(
        1,
      );
      const record = await prisma.idempotencyRecord.findFirstOrThrow({
        where: { businessId, key },
      });
      expect(record.endpoint).toBe('washes');
    });
  });

  describe('consultas y anulación por /sales (DEC-59)', () => {
    it('GET /sales?source=WASH lo lista; GET /sales/:id lo devuelve; otro negocio no lo ve', async () => {
      const created = await washes.create(businessId, userId, {
        washTypeId: autoId,
        priceOptionId: autoPrice,
        paymentMethod: 'CASH',
      });
      const id = created.id;

      const page = await auth(request(server()).get('/api/v1/sales?source=WASH&limit=100')).expect(
        200,
      );
      const items = page.body.items as { id: string; source: string; lineCount: number }[];
      expect(items.every((item) => item.source === 'WASH')).toBe(true);
      expect(items.find((item) => item.id === id)).toMatchObject({ lineCount: 1 });

      const counter = await auth(
        request(server()).get('/api/v1/sales?source=COUNTER&limit=100'),
      ).expect(200);
      expect((counter.body.items as { id: string }[]).map((item) => item.id)).not.toContain(id);

      const detail = await auth(request(server()).get(`/api/v1/sales/${id}`)).expect(200);
      expect(detail.body).toEqual(JSON.parse(JSON.stringify(toSaleResponse(created))));

      const foreignSales = await prisma.sale.findMany({ where: { businessId: otherBusinessId } });
      expect(foreignSales.map((sale) => sale.id)).not.toContain(id);
    });

    it('POST /sales/:id/void lo anula con motivo, sin SALE_VOID ni cambios de stock', async () => {
      const created = await washes.create(businessId, userId, {
        washTypeId: autoId,
        priceOptionId: autoPrice,
        paymentMethod: 'CASH',
      });
      const id = created.id;
      const before = await inventorySnapshot();

      const res = await auth(request(server()).post(`/api/v1/sales/${id}/void`))
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'lavado mal registrado' })
        .expect(200);

      expect(res.body).toMatchObject({
        id,
        source: 'WASH',
        status: 'VOIDED',
        voidReason: 'lavado mal registrado',
      });
      expect(await inventorySnapshot()).toEqual(before);
      expect(await prisma.inventoryMovement.count({ where: { refType: 'Sale', refId: id } })).toBe(
        0,
      );
    });
  });

  it('ningún lavado de este negocio generó movimientos: solo el COUNT inicial', async () => {
    const washes = await prisma.sale.count({ where: { businessId, source: 'WASH' } });
    expect(washes).toBeGreaterThan(0);
    expect(await inventorySnapshot()).toEqual({
      movements: 1,
      stockQuantity: '8',
      isCounted: true,
    });
  });
});
