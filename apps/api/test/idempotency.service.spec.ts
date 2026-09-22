import { jest } from '@jest/globals';
import { IdempotencyService, type IdempotentResult } from '../src/idempotency/idempotency.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

function buildHandlerMock() {
  return jest.fn<() => Promise<IdempotentResult<{ id: string }>>>();
}

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(['idempotencyRecord'], {
    idempotencyRecord: [['businessId', 'key', 'endpoint']],
  });
  const service = new IdempotencyService(prisma);
  return { service, records: stores.get('idempotencyRecord')! };
}

describe('IdempotencyService', () => {
  it('ejecuta el handler una sola vez y repite la respuesta con la misma clave', async () => {
    const { service } = setup();
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

  it('rechaza con 409 si la misma clave se reusa con otro cuerpo (mismo endpoint)', async () => {
    const { service } = setup();
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

  it('la misma clave en endpoints distintos no choca: cada uno corre su propio handler (A-2)', async () => {
    const { service } = setup();
    const handlerA = buildHandlerMock().mockResolvedValue({ status: 201, body: { id: 'a' } });
    const handlerB = buildHandlerMock().mockResolvedValue({ status: 201, body: { id: 'b' } });

    const resultA = await service.run({
      businessId: 'biz-a',
      key: 'misma-clave',
      endpoint: '/maintenances',
      requestHash: 'hash-a',
      handler: handlerA,
    });
    const resultB = await service.run({
      businessId: 'biz-a',
      key: 'misma-clave',
      endpoint: '/inventory/counts',
      requestHash: 'hash-b',
      handler: handlerB,
    });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(resultA.body).toEqual({ id: 'a' });
    expect(resultB.body).toEqual({ id: 'b' });
    expect(resultA.replayed).toBe(false);
    expect(resultB.replayed).toBe(false);
  });

  it('la misma clave en el mismo negocio pero otro negocio no choca (aislamiento)', async () => {
    const { service } = setup();
    const handler = buildHandlerMock().mockResolvedValue({ status: 201, body: { id: '1' } });

    const a = await service.run({
      businessId: 'biz-a',
      key: 'k1',
      endpoint: '/maintenances',
      requestHash: 'hash-1',
      handler,
    });
    const b = await service.run({
      businessId: 'biz-b',
      key: 'k1',
      endpoint: '/maintenances',
      requestHash: 'hash-1',
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(false);
  });

  it('si el handler falla, borra la reserva: una repetición con la misma clave puede reintentar limpio', async () => {
    const { service, records } = setup();
    const failingHandler = buildHandlerMock().mockRejectedValue(new Error('boom'));

    await expect(
      service.run({
        businessId: 'biz-a',
        key: 'k1',
        endpoint: '/maintenances',
        requestHash: 'hash-1',
        handler: failingHandler,
      }),
    ).rejects.toThrow('boom');

    expect(records.size).toBe(0);

    const okHandler = buildHandlerMock().mockResolvedValue({ status: 201, body: { id: '1' } });
    const retry = await service.run({
      businessId: 'biz-a',
      key: 'k1',
      endpoint: '/maintenances',
      requestHash: 'hash-1',
      handler: okHandler,
    });

    expect(okHandler).toHaveBeenCalledTimes(1);
    expect(retry.replayed).toBe(false);
  });

  it('hashRequest produce el mismo hash para el mismo cuerpo', () => {
    const { service } = setup();
    const a = service.hashRequest({ a: 1, b: 2 });
    const b = service.hashRequest({ a: 1, b: 2 });
    const c = service.hashRequest({ a: 1, b: 3 });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
