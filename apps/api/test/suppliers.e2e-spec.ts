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

/**
 * Contrato HTTP de proveedores y de los datos de compra de una recepción (R8,
 * DEC-95). Solo contra una base de prueba (nombre terminado en "_test").
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const describeIfTestDb = isTestDatabase ? describe : describe.skip;

describeIfTestDb('Proveedores y datos de compra (R8, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let businessId: string;
  let otherSupplierId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => `Bearer ${token}`;

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
      data: { name: `E2E Prov ${suffix}`, slug: `e2e-prov-${suffix}` },
    });
    await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E Prov',
        username: `e2e-prov-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    businessId = business.id;
    const other = await prisma.business.create({
      data: { name: `E2E Prov otro ${suffix}`, slug: `e2e-prov-otro-${suffix}` },
    });
    const otherUser = await prisma.user.create({
      data: {
        businessId: other.id,
        name: 'x',
        username: `e2e-prov-o-${suffix}`,
        passwordHash: 'x',
      },
    });
    otherSupplierId = (
      await prisma.supplier.create({
        data: { businessId: other.id, name: 'Ajeno', createdById: otherUser.id },
      })
    ).id;
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ username: `e2e-prov-${suffix}`, password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST/GET/PATCH /suppliers: crea, lista, edita, desactiva; RUC repetido 409; ajeno 404', async () => {
    const created = await http()
      .post('/api/v1/suppliers')
      .set('Authorization', auth())
      .send({ name: '  Lubricantes Norte ', taxId: '20 555 666 777' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Lubricantes Norte',
      taxId: '20555666777',
      isActive: true,
    });

    const dup = await http()
      .post('/api/v1/suppliers')
      .set('Authorization', auth())
      .send({ name: 'Otro', taxId: '20555666777' })
      .expect(409);
    expect(dup.body.code).toBe('SUPPLIER_TAX_ID_TAKEN');

    await http()
      .post('/api/v1/suppliers')
      .set('Authorization', auth())
      .send({ name: '' })
      .expect(400);

    const list = await http().get('/api/v1/suppliers').set('Authorization', auth()).expect(200);
    expect(list.body.map((s: { id: string }) => s.id)).toEqual([created.body.id]);

    await http()
      .patch(`/api/v1/suppliers/${created.body.id}`)
      .set('Authorization', auth())
      .send({ isActive: false, phone: '999' })
      .expect(200);
    const active = await http().get('/api/v1/suppliers').set('Authorization', auth()).expect(200);
    expect(active.body).toEqual([]);
    const all = await http()
      .get('/api/v1/suppliers?includeInactive=true')
      .set('Authorization', auth())
      .expect(200);
    expect(all.body).toHaveLength(1);

    await http()
      .get(`/api/v1/suppliers/${otherSupplierId}`)
      .set('Authorization', auth())
      .expect(404);
    await http().get('/api/v1/suppliers').expect(401);
  });

  it('PATCH /inventory/receipts/:id/purchase-info: completa una vez, repite sin cambios y 409 si difiere', async () => {
    const supplier = await http()
      .post('/api/v1/suppliers')
      .set('Authorization', auth())
      .send({ name: 'Proveedor F2' })
      .expect(201);
    const product = await prisma.product.create({
      data: { businessId, name: `E2E F2 ${randomUUID()}`, unit: 'litro' },
    });
    const receipt = await http()
      .post('/api/v1/inventory/receipts')
      .set('Authorization', auth())
      .set('Idempotency-Key', randomUUID())
      .send({ lines: [{ productId: product.id, quantity: 2 }] })
      .expect(201);
    const path = `/api/v1/inventory/receipts/${receipt.body.id}/purchase-info`;
    const body = { supplierId: supplier.body.id, documentRef: 'f9-1', purchaseDate: '2026-09-01' };

    const set = await http().patch(path).set('Authorization', auth()).send(body).expect(200);
    expect(set.body).toMatchObject({
      supplier: { id: supplier.body.id, name: 'Proveedor F2' },
      documentRef: 'F9-1',
      purchaseDate: '2026-09-01',
      purchaseDateSource: 'DOCUMENT',
    });
    expect(set.body.lines).toHaveLength(1);
    await http().patch(path).set('Authorization', auth()).send(body).expect(200);
    const conflict = await http()
      .patch(path)
      .set('Authorization', auth())
      .send({ purchaseDate: '2026-09-02' })
      .expect(409);
    expect(conflict.body).toMatchObject({
      code: 'PURCHASE_INFO_ALREADY_SET',
      errors: [{ field: 'purchaseDate' }],
    });
    await http()
      .patch(path)
      .set('Authorization', auth())
      .send({ purchaseDate: '2026-9-1' })
      .expect(400);
  });
});
