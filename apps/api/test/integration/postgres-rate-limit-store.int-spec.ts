import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FixedWindowStore } from '../../src/rate-limit/fixed-window.store';
import { PostgresFixedWindowStore } from '../../src/rate-limit/postgres-fixed-window.store';

/**
 * Ventana fija de DEC-86 guardada en Postgres (`RATE_LIMIT_STORE=database`):
 * misma semántica que el almacenamiento en memoria, pero compartida entre
 * instancias. Cada prueba usa claves propias.
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
const WINDOW = 60_000;

function key(): string {
  return `test:${randomUUID()}`;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PostgresFixedWindowStore (DEC-86)', () => {
  it('permite hasta el límite y rechaza el siguiente sin sumarlo', async () => {
    const store = new PostgresFixedWindowStore(prisma, new FixedWindowStore());
    const k = key();
    for (let i = 1; i <= 3; i += 1) {
      expect(await store.hit(k, 3, WINDOW)).toMatchObject({ allowed: true, count: i });
    }
    const rejected = await store.hit(k, 3, WINDOW);
    expect(rejected).toMatchObject({ allowed: false, count: 3 });
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(await store.hit(k, 3, WINDOW)).toMatchObject({ allowed: false, count: 3 });
  });

  it('dos instancias comparten el mismo contador', async () => {
    const a = new PostgresFixedWindowStore(prisma, new FixedWindowStore());
    const b = new PostgresFixedWindowStore(prisma, new FixedWindowStore());
    const k = key();
    expect((await a.hit(k, 2, WINDOW)).allowed).toBe(true);
    expect((await b.hit(k, 2, WINDOW)).allowed).toBe(true);
    expect((await a.hit(k, 2, WINDOW)).allowed).toBe(false);
  });

  it('peticiones concurrentes no superan el límite', async () => {
    const store = new PostgresFixedWindowStore(prisma, new FixedWindowStore());
    const k = key();
    const results = await Promise.all(Array.from({ length: 12 }, () => store.hit(k, 5, WINDOW)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it('la ventana se reinicia entera al vencer', async () => {
    const store = new PostgresFixedWindowStore(prisma, new FixedWindowStore());
    const k = key();
    expect((await store.hit(k, 1, 300)).allowed).toBe(true);
    expect((await store.hit(k, 1, 300)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await store.hit(k, 1, 300)).toMatchObject({ allowed: true, count: 1 });
  });

  it('cada clave tiene su propia cuota y la limpieza borra solo ventanas vencidas', async () => {
    const store = new PostgresFixedWindowStore(prisma, new FixedWindowStore());
    const expired = key();
    const live = key();
    await store.hit(expired, 1, 100);
    expect((await store.hit(live, 1, WINDOW)).allowed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await store.sweep();
    const rows = await prisma.rateLimitWindow.findMany({ where: { key: { in: [expired, live] } } });
    expect(rows.map((r) => r.key)).toEqual([live]);
  });

  it('si la base falla, cuenta en memoria en vez de dejar pasar todo', async () => {
    const broken = {
      $queryRaw: () => Promise.reject(new Error('relation "rate_limit_windows" does not exist')),
    } as unknown as PrismaService;
    const store = new PostgresFixedWindowStore(broken, new FixedWindowStore());
    const k = key();
    expect((await store.hit(k, 1, WINDOW)).allowed).toBe(true);
    expect((await store.hit(k, 1, WINDOW)).allowed).toBe(false);
  });
});
