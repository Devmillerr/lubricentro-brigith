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
import { SALE_REF_TYPE, SalesService } from '../src/sales/sales.service';

/**
 * Ventas (R4, 06-API.md §2 "Ventas") por HTTP, con la app montada como en
 * main.ts (prefijo, ValidationPipe y filtro de errores). Crea negocios,
 * usuarios y productos desechables, así que solo corre contra una base de
 * prueba (nombre terminado en "_test").
 *
 * El rate limit global es de 20 peticiones por minuto por endpoint y la app
 * se monta una sola vez: este archivo hace menos de 20 peticiones a cada
 * ruta. Las ventas que solo sirven de fixture se crean con el servicio.
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

describeIfTestDb('Ventas /api/v1/sales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sales: SalesService;
  let token: string;
  let businessId: string;
  let userId: string;
  let otherBusinessId: string;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  const postSale = (body: unknown, key: string | null = randomUUID()) => {
    const req = auth(request(server()).post('/api/v1/sales'));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };
  const postVoid = (id: string, body: unknown, key: string | null = randomUUID()) => {
    const req = auth(request(server()).post(`/api/v1/sales/${id}/void`));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };

  async function createProduct(
    owner: string,
    extra: { isActive?: boolean; tracksStock?: boolean; code?: string } = {},
    counted?: number,
  ) {
    const product = await prisma.product.create({
      data: { businessId: owner, name: `E2E ${randomUUID()}`, unit: 'unidad', ...extra },
    });
    if (counted !== undefined) {
      await prisma.inventoryMovement.create({
        data: {
          businessId: owner,
          productId: product.id,
          type: 'COUNT',
          quantityDelta: counted,
          countedQuantity: counted,
          previousBalance: 0,
          resultingBalance: counted,
        },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: { stockQuantity: counted, isCounted: true },
      });
    }
    return product.id;
  }

  async function balanceOf(productId: string) {
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
    return Number(product.stockQuantity);
  }

  /** Venta de fixture creada con el servicio, para no gastar el rate limit de POST /sales. */
  async function fixtureSale(
    owner: string,
    owningUser: string,
    productId: string,
    occurredAt?: string,
  ) {
    const { sale } = await sales.create(owner, owningUser, {
      paymentMethod: 'CASH',
      occurredAt,
      lines: [{ productId, quantity: 1, unitPrice: 10 }],
    });
    return sale.id;
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
    sales = app.get(SalesService);

    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E R4 ${suffix}`, slug: `e2e-r4-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R4',
        username: `e2e-r4-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    userId = user.id;

    const other = await prisma.business.create({
      data: { name: `E2E R4 otro ${suffix}`, slug: `e2e-r4-otro-${suffix}` },
    });
    otherBusinessId = other.id;

    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r4-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/sales', () => {
    it('201: forma exacta del contrato, total del servidor, SALE por línea y stock', async () => {
      const oil = await createProduct(businessId, {}, 10);
      const filter = await createProduct(businessId, { code: 'F-21050' }, 5);

      const res = await postSale({
        paymentMethod: 'YAPE',
        occurredAt: '2026-09-20T15:00:00.000Z',
        note: 'cliente de paso',
        lines: [
          { productId: oil, quantity: 1.5, unitPrice: 12.33 },
          { productId: filter, quantity: 1, unitPrice: 18 },
        ],
      }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual([...SALE_KEYS, 'warnings'].sort());
      expect(res.body).toMatchObject({
        source: 'COUNTER',
        status: 'ACTIVE',
        paymentMethod: 'YAPE',
        total: '36.5', // 18.50 (half-up de 18.495) + 18.00
        occurredAt: '2026-09-20T15:00:00.000Z',
        note: 'cliente de paso',
        vehicleId: null,
        maintenanceId: null,
        createdById: userId,
        voidedAt: null,
        voidReason: null,
        warnings: [],
      });
      expect(Object.keys(res.body.lines[0]).sort()).toEqual(LINE_KEYS);
      const byProduct = new Map(
        (res.body.lines as { productId: string }[]).map((line) => [line.productId, line]),
      );
      expect(byProduct.get(oil)).toMatchObject({
        kind: 'PRODUCT',
        washTypeId: null,
        quantity: '1.5',
        unitPrice: '12.33',
        subtotal: '18.5',
        movesStock: true,
      });
      expect(byProduct.get(filter)).toMatchObject({ codeSnapshot: 'F-21050', subtotal: '18' });

      const stored = await prisma.sale.findFirst({ where: { id: res.body.id } });
      expect(stored).toMatchObject({ businessId, createdById: userId });
      const movements = await prisma.inventoryMovement.findMany({
        where: { refType: SALE_REF_TYPE, refId: res.body.id },
      });
      expect(movements.map((m) => m.type)).toEqual(['SALE', 'SALE']);
      expect(await balanceOf(oil)).toBe(8.5);
      expect(await balanceOf(filter)).toBe(4);
    });

    it('tracksStock = false sin SALE y producto sin conteo con el aviso PRODUCT_NOT_COUNTED', async () => {
      const service = await createProduct(businessId, { tracksStock: false });
      const uncounted = await createProduct(businessId);

      const res = await postSale({
        paymentMethod: 'CASH',
        lines: [
          { productId: service, quantity: 1, unitPrice: 20 },
          { productId: uncounted, quantity: 2, unitPrice: 5 },
        ],
      }).expect(201);

      const byProduct = new Map(
        (res.body.lines as { productId: string; movesStock: boolean }[]).map((l) => [
          l.productId,
          l,
        ]),
      );
      expect(byProduct.get(service)!.movesStock).toBe(false);
      expect(byProduct.get(uncounted)!.movesStock).toBe(true);
      expect(res.body.warnings).toEqual([
        { code: 'PRODUCT_NOT_COUNTED', message: expect.any(String), productId: uncounted },
      ]);
      const movements = await prisma.inventoryMovement.findMany({
        where: { refType: SALE_REF_TYPE, refId: res.body.id },
      });
      expect(movements.map((m) => m.productId)).toEqual([uncounted]);
    });

    it('idempotencia: la misma Idempotency-Key devuelve la misma venta sin duplicarla', async () => {
      const product = await createProduct(businessId, {}, 10);
      const key = randomUUID();
      const body = {
        paymentMethod: 'CASH',
        lines: [{ productId: product, quantity: 1, unitPrice: 30 }],
      };

      const first = await postSale(body, key).expect(201);
      const second = await postSale(body, key).expect(201);

      expect(second.body).toEqual(first.body);
      expect(await prisma.sale.count({ where: { id: first.body.id } })).toBe(1);
      expect(await balanceOf(product)).toBe(9);
    });

    it('sin Idempotency-Key: 400 IDEMPOTENCY_KEY_REQUIRED y no se guarda nada', async () => {
      const product = await createProduct(businessId, {}, 10);
      const res = await postSale(
        { paymentMethod: 'CASH', lines: [{ productId: product, quantity: 1, unitPrice: 1 }] },
        null,
      ).expect(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await balanceOf(product)).toBe(10);
    });

    it('validación: campos desconocidos (saleUnitId, total), decimales y método de pago → 400', async () => {
      const product = await createProduct(businessId, {}, 10);

      const unknown = await postSale({
        paymentMethod: 'CASH',
        total: 99,
        lines: [{ productId: product, quantity: 1, unitPrice: 1, saleUnitId: randomUUID() }],
      }).expect(400);
      expect(unknown.body.code).toBe('VALIDATION_ERROR');

      const invalid = await postSale({
        paymentMethod: 'CARD',
        lines: [{ productId: product, quantity: 1.2345, unitPrice: 1.005 }],
      }).expect(400);
      const fields = (invalid.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toEqual(
        expect.arrayContaining(['paymentMethod', 'lines.0.quantity', 'lines.0.unitPrice']),
      );

      const tooMany = await postSale({
        paymentMethod: 'CASH',
        lines: Array.from({ length: 51 }, () => ({
          productId: product,
          quantity: 1,
          unitPrice: 1,
        })),
      }).expect(400);
      expect(tooMany.body.code).toBe('VALIDATION_ERROR');
      expect(await balanceOf(product)).toBe(10);
    });

    it('producto repetido: 400 DUPLICATE_PRODUCT_LINE', async () => {
      const product = await createProduct(businessId, {}, 10);
      const res = await postSale({
        paymentMethod: 'CASH',
        lines: [
          { productId: product, quantity: 1, unitPrice: 1 },
          { productId: product, quantity: 2, unitPrice: 1 },
        ],
      }).expect(400);
      expect(res.body.code).toBe('DUPLICATE_PRODUCT_LINE');
    });

    it('producto inexistente o de otro negocio: 404 PRODUCT_NOT_FOUND; inactivo: 409 PRODUCT_INACTIVE; nada se guarda', async () => {
      const ok = await createProduct(businessId, {}, 10);
      const foreign = await createProduct(otherBusinessId, {}, 7);
      const inactive = await createProduct(businessId, { isActive: false }, 3);
      const before = await prisma.sale.count({ where: { businessId } });

      for (const [productId, status, code] of [
        [randomUUID(), 404, 'PRODUCT_NOT_FOUND'],
        [foreign, 404, 'PRODUCT_NOT_FOUND'],
        [inactive, 409, 'PRODUCT_INACTIVE'],
      ] as const) {
        const res = await postSale({
          paymentMethod: 'CASH',
          lines: [
            { productId: ok, quantity: 1, unitPrice: 1 },
            { productId, quantity: 1, unitPrice: 1 },
          ],
        }).expect(status);
        expect(res.body.code).toBe(code);
      }

      expect(await prisma.sale.count({ where: { businessId } })).toBe(before);
      expect(await balanceOf(ok)).toBe(10);
      expect(await balanceOf(foreign)).toBe(7);
    });

    it('stock insuficiente: 422 INSUFFICIENT_STOCK en lines, con rollback completo (BLOCK)', async () => {
      const enough = await createProduct(businessId, {}, 10);
      const short = await createProduct(businessId, {}, 2);
      const before = await prisma.sale.count({ where: { businessId } });

      const res = await postSale({
        paymentMethod: 'CASH',
        lines: [
          { productId: enough, quantity: 1, unitPrice: 1 },
          { productId: short, quantity: 3, unitPrice: 1 },
        ],
      }).expect(422);

      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.errors[0].field).toBe('lines');
      expect(await prisma.sale.count({ where: { businessId } })).toBe(before);
      expect(await balanceOf(enough)).toBe(10);
      expect(await balanceOf(short)).toBe(2);
      expect(
        await prisma.inventoryMovement.count({
          where: { productId: { in: [enough, short] }, type: 'SALE' },
        }),
      ).toBe(0);
    });

    it('sin sesión: 401', async () => {
      await request(server())
        .post('/api/v1/sales')
        .set('Idempotency-Key', randomUUID())
        .send({ paymentMethod: 'CASH', lines: [] })
        .expect(401);
    });
  });

  describe('GET /api/v1/sales y /:id', () => {
    it('200 lista: más recientes primero, cabecera con lineCount y sin líneas; from incluido, to excluido', async () => {
      const product = await createProduct(businessId, { tracksStock: false });
      const older = await fixtureSale(businessId, userId, product, '2030-01-01T10:00:00.000Z');
      const newer = await fixtureSale(businessId, userId, product, '2030-01-02T10:00:00.000Z');

      const res = await auth(
        request(server()).get('/api/v1/sales').query({
          from: '2030-01-01T10:00:00.000Z',
          to: '2030-01-02T10:00:00.000Z',
        }),
      ).expect(200);

      expect(res.body.items.map((s: { id: string }) => s.id)).toEqual([older]);
      expect(Object.keys(res.body.items[0]).sort()).toEqual(
        [...SALE_KEYS.filter((k) => k !== 'lines'), 'lineCount'].sort(),
      );
      expect(res.body.items[0].lineCount).toBe(1);

      const all = await auth(
        request(server()).get('/api/v1/sales').query({ from: '2030-01-01T00:00:00.000Z' }),
      ).expect(200);
      expect(all.body.items.map((s: { id: string }) => s.id)).toEqual([newer, older]);
    });

    it('400 con filtros inválidos', async () => {
      const res = await auth(
        request(server()).get('/api/v1/sales').query({ status: 'OPEN' }),
      ).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('200 detalle: la misma forma que el POST sin warnings, líneas por productId', async () => {
      const a = await createProduct(businessId, { tracksStock: false });
      const b = await createProduct(businessId, { tracksStock: false });
      const { sale } = await sales.create(businessId, userId, {
        paymentMethod: 'CASH',
        lines: [
          { productId: b, quantity: 1, unitPrice: 1 },
          { productId: a, quantity: 1, unitPrice: 1 },
        ],
      });

      const res = await auth(request(server()).get(`/api/v1/sales/${sale.id}`)).expect(200);

      expect(Object.keys(res.body).sort()).toEqual([...SALE_KEYS].sort());
      const ids = (res.body.lines as { productId: string }[]).map((l) => l.productId);
      const expected = (
        await prisma.saleLine.findMany({
          where: { saleId: sale.id },
          orderBy: { productId: 'asc' },
        })
      ).map((l) => l.productId);
      expect(ids).toEqual(expected);
    });

    it('404 SALE_NOT_FOUND si no existe o es de otro negocio; 400 si el id no es UUID; 401 sin sesión', async () => {
      const foreignProduct = await createProduct(otherBusinessId, { tracksStock: false });
      const otherUser = await prisma.user.create({
        data: {
          businessId: otherBusinessId,
          name: 'otro',
          username: `e2e-r4-otro-${randomUUID()}`,
          passwordHash: 'x',
        },
      });
      const foreignSale = await fixtureSale(otherBusinessId, otherUser.id, foreignProduct);

      const missing = await auth(request(server()).get(`/api/v1/sales/${randomUUID()}`)).expect(
        404,
      );
      expect(missing.body.code).toBe('SALE_NOT_FOUND');
      const foreign = await auth(request(server()).get(`/api/v1/sales/${foreignSale}`)).expect(404);
      expect(foreign.body.code).toBe('SALE_NOT_FOUND');
      await auth(request(server()).get('/api/v1/sales/no-es-uuid')).expect(400);
      await request(server()).get('/api/v1/sales').expect(401);

      const list = await auth(request(server()).get('/api/v1/sales')).expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id)).not.toContain(foreignSale);
    });
  });

  describe('POST /api/v1/sales/:id/void', () => {
    it('200: VOIDED con motivo, SALE_VOID y el stock vuelve; la misma clave repite la respuesta; otra clave → 409', async () => {
      const product = await createProduct(businessId, {}, 10);
      const saleId = await fixtureSale(businessId, userId, product);
      expect(await balanceOf(product)).toBe(9);
      const key = randomUUID();

      const res = await postVoid(saleId, { reason: 'cliente devolvió' }, key).expect(200);

      expect(Object.keys(res.body).sort()).toEqual([...SALE_KEYS].sort());
      expect(res.body).toMatchObject({
        id: saleId,
        status: 'VOIDED',
        voidReason: 'cliente devolvió',
      });
      expect(res.body.voidedAt).toEqual(expect.any(String));
      expect(await balanceOf(product)).toBe(10);

      const replay = await postVoid(saleId, { reason: 'cliente devolvió' }, key).expect(200);
      expect(replay.body).toEqual(res.body);

      const again = await postVoid(saleId, { reason: 'otra vez' }).expect(409);
      expect(again.body.code).toBe('SALE_ALREADY_VOIDED');

      const voids = await prisma.inventoryMovement.findMany({
        where: { refType: SALE_REF_TYPE, refId: saleId, type: 'SALE_VOID' },
      });
      expect(voids).toHaveLength(1);
      expect(await balanceOf(product)).toBe(10);
    });

    it('se anula aunque el producto se haya desactivado después de la venta', async () => {
      const product = await createProduct(businessId, {}, 5);
      const saleId = await fixtureSale(businessId, userId, product);
      await prisma.product.update({ where: { id: product }, data: { isActive: false } });

      await postVoid(saleId, { reason: 'error' }).expect(200);

      expect(await balanceOf(product)).toBe(5);
    });

    it('errores: motivo vacío 400, sin Idempotency-Key 400, inexistente 404, id no UUID 400, sin sesión 401', async () => {
      const product = await createProduct(businessId, { tracksStock: false });
      const saleId = await fixtureSale(businessId, userId, product);

      const blank = await postVoid(saleId, { reason: '   ' }).expect(400);
      expect(blank.body.code).toBe('VALIDATION_ERROR');
      const noKey = await postVoid(saleId, { reason: 'x' }, null).expect(400);
      expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const missing = await postVoid(randomUUID(), { reason: 'x' }).expect(404);
      expect(missing.body.code).toBe('SALE_NOT_FOUND');
      await postVoid('no-es-uuid', { reason: 'x' }).expect(400);
      await request(server())
        .post(`/api/v1/sales/${saleId}/void`)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'x' })
        .expect(401);

      const stored = await prisma.sale.findFirstOrThrow({ where: { id: saleId } });
      expect(stored.status).toBe('ACTIVE');
    });
  });
});
