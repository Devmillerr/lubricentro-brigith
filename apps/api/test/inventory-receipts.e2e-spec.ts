import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { applyGlobalPrefix } from '../src/common/openapi/openapi-document';
import { validationExceptionFactory } from '../src/common/validation-exception-factory';
import { RECEIPT_REF_TYPE } from '../src/inventory/inventory.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * POST /inventory/receipts (R3, 06-API.md §2 "Cambios de R3") por HTTP, con
 * la app montada como en main.ts (prefijo, ValidationPipe y filtro de
 * errores). Crea negocios, usuarios y productos desechables, así que solo
 * corre contra una base de prueba (nombre terminado en "_test"), como el
 * login correcto de auth-login.e2e-spec.ts.
 *
 * El rate limit global es de 20 peticiones por minuto por endpoint y la app
 * se monta una sola vez: este archivo hace menos de 20 POST a receipts.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('POST /api/v1/inventory/receipts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let businessId: string;
  let userId: string;
  let otherBusinessProductId: string;

  const post = (body: unknown, key: string | null = randomUUID()) => {
    const req = request(app.getHttpServer())
      .post('/api/v1/inventory/receipts')
      .set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };

  async function createProduct(owner: string, extra: { isActive?: boolean } = {}) {
    const product = await prisma.product.create({
      data: { businessId: owner, name: `E2E ${randomUUID()}`, unit: 'unidad', ...extra },
    });
    return product.id;
  }

  async function balanceOf(productId: string) {
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId } });
    return Number(product.stockQuantity);
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

    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E R3 ${suffix}`, slug: `e2e-r3-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E R3',
        username: `e2e-r3-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    userId = user.id;

    const other = await prisma.business.create({
      data: { name: `E2E R3 otro ${suffix}`, slug: `e2e-r3-otro-${suffix}` },
    });
    otherBusinessProductId = await createProduct(other.id);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: `e2e-r3-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('201: crea la recepción del negocio y usuario autenticados, con sus líneas, y sube el saldo', async () => {
    const first = await createProduct(businessId);
    const second = await createProduct(businessId);

    const res = await post({
      occurredAt: '2026-09-20T15:00:00.000Z',
      note: 'Reposición semanal',
      lines: [
        { productId: second, quantity: 2.5 },
        { productId: first, quantity: 4 },
      ],
    }).expect(201);

    expect(Object.keys(res.body).sort()).toEqual(
      ['businessId', 'createdAt', 'createdById', 'id', 'lines', 'note', 'occurredAt'].sort(),
    );
    expect(res.body).toMatchObject({
      businessId,
      createdById: userId,
      note: 'Reposición semanal',
      occurredAt: '2026-09-20T15:00:00.000Z',
    });
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines.map((line: { productId: string }) => line.productId)).toEqual([
      second,
      first,
    ]);
    expect(res.body.lines[0]).toMatchObject({
      type: 'PURCHASE_IN',
      refType: RECEIPT_REF_TYPE,
      refId: res.body.id,
      quantityDelta: '2.5',
      resultingBalance: '2.5',
      createdById: userId,
    });

    const stored = await prisma.inventoryReceipt.findFirst({ where: { id: res.body.id } });
    expect(stored).toMatchObject({ businessId, createdById: userId });
    const movements = await prisma.inventoryMovement.findMany({
      where: { refType: RECEIPT_REF_TYPE, refId: res.body.id },
    });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.type === 'PURCHASE_IN')).toBe(true);
    expect(await balanceOf(first)).toBe(4);
    expect(await balanceOf(second)).toBe(2.5);
  });

  it('idempotencia: la misma Idempotency-Key devuelve la misma recepción sin duplicarla', async () => {
    const productId = await createProduct(businessId);
    const key = randomUUID();
    const body = { lines: [{ productId, quantity: 3 }] };

    const first = await post(body, key).expect(201);
    const replay = await post(body, key).expect(201);

    expect(replay.body.id).toBe(first.body.id);
    expect(await prisma.inventoryReceipt.count({ where: { id: first.body.id } })).toBe(1);
    expect(await balanceOf(productId)).toBe(3);
  });

  it('sin Idempotency-Key: 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const productId = await createProduct(businessId);

    const res = await post({ lines: [{ productId, quantity: 1 }] }, null).expect(400);

    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await balanceOf(productId)).toBe(0);
  });

  it('sin líneas o con más de 100: 400 VALIDATION_ERROR con el mensaje en español', async () => {
    const empty = await post({ lines: [] }).expect(400);
    expect(empty.body.code).toBe('VALIDATION_ERROR');
    expect(empty.body.errors).toContainEqual({
      field: 'lines',
      message: 'La recepción debe tener al menos un producto.',
    });

    const tooMany = await post({
      lines: Array.from({ length: 101 }, () => ({ productId: randomUUID(), quantity: 1 })),
    }).expect(400);
    expect(tooMany.body.errors).toContainEqual({
      field: 'lines',
      message: 'La recepción admite hasta 100 productos.',
    });
  });

  it('cantidad ≤ 0: 400 VALIDATION_ERROR en el campo de la línea y no escribe nada', async () => {
    const productId = await createProduct(businessId);

    const res = await post({
      lines: [
        { productId, quantity: 1 },
        { productId: randomUUID(), quantity: 0 },
      ],
    }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toContainEqual({
      field: 'lines.1.quantity',
      message: 'La cantidad debe ser mayor que 0.',
    });
    expect(await balanceOf(productId)).toBe(0);
  });

  it('saldo que superaría Decimal(12,3): 400 VALIDATION_ERROR con el nombre del producto, sin su id', async () => {
    const productId = await createProduct(businessId);
    // Fixture: saldo ya en el máximo de la columna.
    const product = await prisma.product.update({
      where: { id: productId },
      data: { stockQuantity: '999999999.999', isCounted: true },
    });

    const res = await post({ lines: [{ productId, quantity: 1 }] }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      {
        field: 'lines',
        message: `El saldo de «${product.name}» superaría el máximo admitido (999 999 999,999).`,
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(productId);
    expect(await balanceOf(productId)).toBe(999999999.999);
  });

  it('el contrato anterior ({ productId, quantity }) ya no se acepta: 400', async () => {
    const productId = await createProduct(businessId);

    const res = await post({ productId, quantity: 1 }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await balanceOf(productId)).toBe(0);
  });

  it('producto repetido: 400 DUPLICATE_PRODUCT_LINE', async () => {
    const productId = await createProduct(businessId);

    const res = await post({
      lines: [
        { productId, quantity: 1 },
        { productId, quantity: 2 },
      ],
    }).expect(400);

    expect(res.body.code).toBe('DUPLICATE_PRODUCT_LINE');
    expect(await balanceOf(productId)).toBe(0);
  });

  it('producto inexistente: 404 PRODUCT_NOT_FOUND y no se guarda ninguna línea', async () => {
    const productId = await createProduct(businessId);
    const receiptsBefore = await prisma.inventoryReceipt.count({ where: { businessId } });

    const res = await post({
      lines: [
        { productId, quantity: 1 },
        { productId: randomUUID(), quantity: 1 },
      ],
    }).expect(404);

    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    expect(await balanceOf(productId)).toBe(0);
    expect(await prisma.inventoryReceipt.count({ where: { businessId } })).toBe(receiptsBefore);
  });

  it('producto de otro negocio: 404 PRODUCT_NOT_FOUND y su saldo no cambia', async () => {
    const res = await post({
      lines: [{ productId: otherBusinessProductId, quantity: 5 }],
    }).expect(404);

    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    expect(await balanceOf(otherBusinessProductId)).toBe(0);
  });

  it('producto inactivo: 409 PRODUCT_INACTIVE y se rechaza el lote completo', async () => {
    const active = await createProduct(businessId);
    const inactive = await createProduct(businessId, { isActive: false });

    const res = await post({
      lines: [
        { productId: active, quantity: 1 },
        { productId: inactive, quantity: 1 },
      ],
    }).expect(409);

    expect(res.body.code).toBe('PRODUCT_INACTIVE');
    expect(await balanceOf(active)).toBe(0);
    expect(await balanceOf(inactive)).toBe(0);
  });

  it('sin sesión: 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/receipts')
      .set('Idempotency-Key', randomUUID())
      .send({ lines: [{ productId: randomUUID(), quantity: 1 }] })
      .expect(401);
  });
  describe('GET /api/v1/inventory/receipts y /:id', () => {
    const get = (path: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/inventory/receipts${path}`)
        .set('Authorization', `Bearer ${token}`);

    it('200 lista: las más recientes primero, con lineCount, sin líneas y paginada', async () => {
      const a = await createProduct(businessId);
      const b = await createProduct(businessId);
      const older = await post({
        occurredAt: '2030-01-01T10:00:00.000Z',
        lines: [{ productId: a, quantity: 1 }],
      }).expect(201);
      const newer = await post({
        occurredAt: '2030-01-02T10:00:00.000Z',
        note: 'Aceites',
        lines: [
          { productId: a, quantity: 1 },
          { productId: b, quantity: 2 },
        ],
      }).expect(201);

      const first = await get('?limit=1').expect(200);
      expect(Object.keys(first.body).sort()).toEqual(['items', 'nextCursor']);
      expect(first.body.items).toHaveLength(1);
      expect(Object.keys(first.body.items[0]).sort()).toEqual(
        ['businessId', 'createdAt', 'createdById', 'id', 'lineCount', 'note', 'occurredAt'].sort(),
      );
      expect(first.body.items[0]).toMatchObject({
        id: newer.body.id,
        lineCount: 2,
        note: 'Aceites',
      });
      expect(first.body.nextCursor).toBe(newer.body.id);

      const second = await get(`?limit=1&cursor=${first.body.nextCursor}`).expect(200);
      expect(second.body.items[0]).toMatchObject({ id: older.body.id, lineCount: 1 });
    });

    it('200 detalle: la misma forma que el POST, con todas sus líneas PURCHASE_IN', async () => {
      const a = await createProduct(businessId);
      const b = await createProduct(businessId);
      const created = await post({
        note: 'Detalle',
        lines: [
          { productId: a, quantity: 4 },
          { productId: b, quantity: 2.5 },
        ],
      }).expect(201);

      const res = await get(`/${created.body.id}`).expect(200);

      expect(Object.keys(res.body).sort()).toEqual(Object.keys(created.body).sort());
      expect({ ...res.body, lines: undefined }).toEqual({ ...created.body, lines: undefined });
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.lines.map((l: { productId: string }) => l.productId)).toEqual([a, b].sort());
      for (const line of res.body.lines as Record<string, unknown>[]) {
        expect(line).toMatchObject({
          type: 'PURCHASE_IN',
          refType: RECEIPT_REF_TYPE,
          refId: created.body.id,
        });
      }
    });

    it('404 RECEIPT_NOT_FOUND: inexistente o de otro negocio', async () => {
      const otherBusiness = await prisma.product.findFirstOrThrow({
        where: { id: otherBusinessProductId },
      });
      const otherUser = await prisma.user.create({
        data: {
          businessId: otherBusiness.businessId,
          name: 'E2E R3 otro',
          username: `e2e-r3-otro-${randomUUID()}`,
          passwordHash: 'no-se-usa',
        },
      });
      const foreign = await prisma.inventoryReceipt.create({
        data: { businessId: otherBusiness.businessId, createdById: otherUser.id },
      });

      const missing = await get(`/${randomUUID()}`).expect(404);
      const other = await get(`/${foreign.id}`).expect(404);

      expect(missing.body.code).toBe('RECEIPT_NOT_FOUND');
      expect(other.body.code).toBe('RECEIPT_NOT_FOUND');
      const list = await get('?limit=100').expect(200);
      expect(list.body.items.map((r: { id: string }) => r.id)).not.toContain(foreign.id);
    });

    it('400 con un id que no es UUID o un limit fuera de rango', async () => {
      await get('/no-es-uuid').expect(400);
      await get('?limit=0').expect(400);
    });

    it('sin sesión: 401 en la lista y en el detalle', async () => {
      await request(app.getHttpServer()).get('/api/v1/inventory/receipts').expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/inventory/receipts/${randomUUID()}`)
        .expect(401);
    });
  });
});
