import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IdempotencyTestController } from '../src/idempotency/idempotency-test.controller';
import { idempotencyControllers } from '../src/idempotency/idempotency.module';
import { IdempotencyService } from '../src/idempotency/idempotency.service';

/**
 * `internal/idempotency-test` (hallazgo H5): solo existe con
 * `NODE_ENV === 'test'`. Falla cerrado: sin `NODE_ENV`, con `production`,
 * `development` o un valor mal escrito, la ruta no se monta (404).
 */
describe('internal/idempotency-test solo en NODE_ENV=test (e2e)', () => {
  it.each([undefined, '', 'production', 'development', 'staging', 'TEST', 'test '])(
    'NODE_ENV=%p: no se monta el controlador',
    (nodeEnv) => {
      expect(idempotencyControllers(nodeEnv)).toEqual([]);
    },
  );

  it('NODE_ENV=test: se monta', () => {
    expect(idempotencyControllers('test')).toEqual([IdempotencyTestController]);
  });

  async function appFor(nodeEnv: string | undefined): Promise<INestApplication> {
    @Module({
      controllers: idempotencyControllers(nodeEnv),
      // La ruta no debe llegar a usar el servicio: basta un doble vacío.
      providers: [{ provide: IdempotencyService, useValue: {} }],
    })
    class ProbeModule {}

    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it.each(['production', undefined])('NODE_ENV=%p: POST responde 404', async (nodeEnv) => {
    const app = await appFor(nodeEnv);
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/internal/idempotency-test')
        .set('Idempotency-Key', 'k')
        .send({ value: 'x' })
        .expect(404);
    } finally {
      await app.close();
    }
  });
});
