import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RATE_LIMITS } from '../src/rate-limit/rate-limit.constants';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Login y su límite propio (DEC-86: 5/min por IP y por `username`).
 * El login correcto crea un negocio y un usuario desechables, así que solo
 * corre contra una base de prueba (nombre terminado en "_test", como en CI);
 * contra otra base se omite y solo se prueban intentos fallidos, que no escriben.
 */
const isTestDatabase = /\/[^/?]*_test(\?|$)/.test(process.env.DATABASE_URL ?? '');

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // App nueva por prueba: el contador del rate limit vive en memoria.
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (username: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ username, password });

  (isTestDatabase ? it : it.skip)(
    'con credenciales correctas devuelve el par de tokens',
    async () => {
      const prisma = app.get(PrismaService);
      const suffix = randomUUID();
      const password = randomUUID();
      const business = await prisma.business.create({
        data: { name: `E2E ${suffix}`, slug: `e2e-${suffix}` },
      });
      await prisma.user.create({
        data: {
          businessId: business.id,
          name: 'E2E',
          username: `e2e-${suffix}`,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        },
      });

      const res = await login(`e2e-${suffix}`, password).expect(200);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    },
  );

  it(`limita a ${RATE_LIMITS.loginIp} intentos por minuto por IP: el siguiente es 429`, async () => {
    const username = `no-existe-${randomUUID()}`;
    for (let attempt = 0; attempt < RATE_LIMITS.loginIp; attempt += 1) {
      await login(username, 'incorrecta').expect(401);
    }

    await login(username, 'incorrecta').expect(429);
  });

  it('el límite de login no afecta a otras rutas', async () => {
    for (let attempt = 0; attempt <= RATE_LIMITS.loginIp; attempt += 1) {
      await login(`no-existe-${randomUUID()}`, 'incorrecta');
    }

    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
