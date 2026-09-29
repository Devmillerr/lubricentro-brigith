import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { validationExceptionFactory } from '../src/common/validation-exception-factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Cambio y recuperación de contraseña. Crean un negocio y un usuario
 * desechables, así que solo corren contra una base de prueba (nombre terminado
 * en "_test", como en CI). Cada prueba usa una app nueva: `change-password` y
 * `recover` comparten el límite del login (5/min por IP).
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');
const maybe = isTestDatabase ? it : it.skip;

describe('Contraseña: cambio y recuperación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Igual que main.ts: validación de cuerpos y errores en formato "problem details".
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
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Negocio con su dueño, una categoría y un producto. */
  async function seedAccount() {
    const suffix = randomUUID();
    const password = randomUUID();
    const business = await prisma.business.create({
      data: { name: `E2E ${suffix}`, slug: `e2e-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: 'E2E',
        username: `e2e-${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    const category = await prisma.productCategory.create({
      data: { businessId: business.id, name: `Categoría ${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        categoryId: category.id,
        name: `Producto ${suffix}`,
        unit: 'UNIT',
      },
    });
    return { business, user, category, product, password };
  }

  const login = (username: string, password: string) =>
    http().post('/auth/login').send({ username, password });

  maybe('cambiar la contraseña conserva la misma cuenta, su negocio y sus datos', async () => {
    const { business, user, category, product, password } = await seedAccount();
    const session = await login(user.username, password).expect(200);
    const bearer = `Bearer ${session.body.accessToken}`;

    const wrong = await http()
      .post('/auth/change-password')
      .set('Authorization', bearer)
      .send({ currentPassword: 'incorrecta', newPassword: 'nueva-clave-1' })
      .expect(400);
    expect(wrong.body.code).toBe('VALIDATION_ERROR');
    expect(wrong.body.errors).toEqual([expect.objectContaining({ field: 'currentPassword' })]);

    const changed = await http()
      .post('/auth/change-password')
      .set('Authorization', bearer)
      .send({ currentPassword: password, newPassword: 'nueva-clave-1' })
      .expect(200);
    expect(changed.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      recoveryCode: expect.stringMatching(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/),
    });

    await login(user.username, password).expect(401);
    await login(user.username, 'nueva-clave-1').expect(200);

    // Misma cuenta y mismo negocio; los datos siguen ahí.
    const me = await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${changed.body.accessToken}`)
      .expect(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.business.id).toBe(business.id);
    expect(await prisma.user.count({ where: { businessId: business.id } })).toBe(1);
    expect(await prisma.productCategory.findUnique({ where: { id: category.id } })).toMatchObject({
      businessId: business.id,
    });
    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({
      businessId: business.id,
    });
  });

  maybe('recuperar con el código cambia la contraseña y el código es de un solo uso', async () => {
    const { user, password } = await seedAccount();
    const session = await login(user.username, password).expect(200);
    const changed = await http()
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .send({ currentPassword: password, newPassword: 'nueva-clave-1' })
      .expect(200);

    const wrong = await http()
      .post('/auth/recover')
      .send({
        username: user.username,
        recoveryCode: 'ABCD-EFGH-JKLM',
        newPassword: 'x-recuperada-1',
      })
      .expect(401);
    expect(wrong.body.code).toBe('INVALID_RECOVERY_CODE');

    const recovered = await http()
      .post('/auth/recover')
      .send({
        username: user.username,
        recoveryCode: changed.body.recoveryCode,
        newPassword: 'recuperada-1',
      })
      .expect(200);
    expect(recovered.body.recoveryCode).not.toBe(changed.body.recoveryCode);

    await login(user.username, 'recuperada-1').expect(200);
    expect(await prisma.user.count({ where: { businessId: user.businessId } })).toBe(1);
  });

  it('recover valida la contraseña nueva y no requiere sesión', async () => {
    const res = await http()
      .post('/auth/recover')
      .send({
        username: `no-existe-${randomUUID()}`,
        recoveryCode: 'ABCD-EFGH-JKLM',
        newPassword: 'corta',
      })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
