import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../src/app.factory';

/**
 * Cabeceras que pone `createApp()` (la misma configuración de main.ts y de la
 * función serverless): las respuestas de la API no se guardan en cachés.
 * Requiere una base Postgres real accesible por DATABASE_URL, como el resto
 * de las e2e.
 */
describe('createApp: cabeceras de respuesta (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('marca las respuestas como no almacenables y sin X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('el preflight CORS del origen permitido se cachea 2 h; otro origen no recibe permiso', async () => {
    const origin = (process.env.CORS_ORIGIN ?? '').split(',')[0]?.trim() ?? '';
    const allowed = await request(app.getHttpServer())
      .options('/api/v1/auth/me')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    expect(allowed.headers['access-control-max-age']).toBe('7200');

    const foreign = await request(app.getHttpServer())
      .options('/api/v1/auth/me')
      .set('Origin', 'https://otro-sitio.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('también en errores de la API (401 sin sesión)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

    expect(res.headers['cache-control']).toBe('no-store');
  });
});
