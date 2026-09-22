import { jest } from '@jest/globals';
import { IdempotencyService, type IdempotentResult } from '../src/idempotency/idempotency.service';
import { PrismaService } from '../src/prisma/prisma.service';

function buildHandlerMock() {
  return jest.fn<() => Promise<IdempotentResult<{ id: string }>>>();
}

describe('IdempotencyService', () => {
  function buildMockPrisma() {
    const records = new Map<
      string,
      { requestHash: string; responseStatus: number; responseBody: unknown }
    >();

    const prisma = {
      $extends() {
        return {
          idempotencyRecord: {
            findFirst: ({ where }: { where: { key: string; endpoint: string } }) => {
              const record = records.get(`${where.key}::${where.endpoint}`);
              return Promise.resolve(record ? { ...record } : null);
            },
            create: ({
              data,
            }: {
              data: {
                key: string;
                endpoint: string;
                requestHash: string;
                responseStatus: number;
                responseBody: unknown;
              };
            }) => {
              records.set(`${data.key}::${data.endpoint}`, {
                requestHash: data.requestHash,
                responseStatus: data.responseStatus,
                responseBody: data.responseBody,
              });
              return Promise.resolve(data);
            },
          },
        };
      },
    } as unknown as PrismaService;

    return prisma;
  }

  it('ejecuta el handler una sola vez y repite la respuesta con la misma clave', async () => {
    const service = new IdempotencyService(buildMockPrisma());
    const handler = buildHandlerMock().mockResolvedValue({ status: 201, body: { id: '1' } });

    const first = await service.run({
      businessId: 'biz-a',
      key: 'k1',
      endpoint: '/maintenances',
      requestHash: 'hash-1',
      handler,
    });
    const second = await service.run({
      businessId: 'biz-a',
      key: 'k1',
      endpoint: '/maintenances',
      requestHash: 'hash-1',
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual({ id: '1' });
  });

  it('rechaza con 409 si la misma clave se reusa con otro cuerpo', async () => {
    const service = new IdempotencyService(buildMockPrisma());
    const handler = buildHandlerMock().mockResolvedValue({ status: 201, body: { id: '1' } });

    await service.run({
      businessId: 'biz-a',
      key: 'k1',
      endpoint: '/maintenances',
      requestHash: 'hash-1',
      handler,
    });

    await expect(
      service.run({
        businessId: 'biz-a',
        key: 'k1',
        endpoint: '/maintenances',
        requestHash: 'hash-DIFERENTE',
        handler,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('hashRequest produce el mismo hash para el mismo cuerpo', () => {
    const service = new IdempotencyService(buildMockPrisma());
    const a = service.hashRequest({ a: 1, b: 2 });
    const b = service.hashRequest({ a: 1, b: 2 });
    const c = service.hashRequest({ a: 1, b: 3 });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
