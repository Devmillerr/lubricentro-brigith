import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../src/config/env.validation';
import { forBusiness } from '../src/prisma/business-scope';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Prueba de aislamiento (04-ARCHITECTURE.md §10): un negocio no debe poder
 * leer ni escribir datos de otro a través del cliente con alcance de negocio.
 * Usa un mock del cliente Prisma subyacente: no depende de una base real.
 */
describe('forBusiness', () => {
  function buildMockPrisma() {
    const calls: unknown[] = [];
    const query = jest.fn((args: unknown) => {
      calls.push(args);
      return Promise.resolve(args);
    });

    const prisma = {
      $extends(config: {
        query: { $allModels: { $allOperations: (ctx: unknown) => Promise<unknown> } };
      }) {
        const operations = config.query.$allModels.$allOperations;
        return {
          user: {
            findMany: (args: unknown) =>
              operations({ model: 'User', operation: 'findMany', args, query }),
            findFirst: (args: unknown) =>
              operations({ model: 'User', operation: 'findFirst', args, query }),
            findUnique: (args: unknown) =>
              operations({ model: 'User', operation: 'findUnique', args, query }),
            create: (args: unknown) =>
              operations({ model: 'User', operation: 'create', args, query }),
          },
          business: {
            findMany: (args: unknown) =>
              operations({ model: 'Business', operation: 'findMany', args, query }),
          },
        };
      },
    } as unknown as PrismaService;

    return { prisma, calls };
  }

  it('agrega businessId al where en findMany de un modelo de negocio', async () => {
    const { prisma, calls } = buildMockPrisma();
    const scoped = forBusiness(prisma, 'biz-a');

    await scoped.user.findMany({ where: { isActive: true } });

    expect(calls[0]).toEqual({ where: { isActive: true, businessId: 'biz-a' } });
  });

  it('agrega businessId al data en create de un modelo de negocio', async () => {
    const { prisma, calls } = buildMockPrisma();
    const scoped = forBusiness(prisma, 'biz-a');

    await scoped.user.create({
      data: { name: 'Ana', username: 'ana', passwordHash: 'hash', businessId: 'otro-negocio' },
    });

    // El businessId real siempre gana, aunque el llamador pase (por error) otro.
    expect(calls[0]).toEqual({
      data: { name: 'Ana', username: 'ana', passwordHash: 'hash', businessId: 'biz-a' },
    });
  });

  it('no toca las operaciones de un modelo que no es de negocio', async () => {
    const { prisma, calls } = buildMockPrisma();
    const scoped = forBusiness(prisma, 'biz-a');

    await scoped.business.findMany({ where: { slug: 'brigith' } });

    expect(calls[0]).toEqual({ where: { slug: 'brigith' } });
  });

  it('bloquea findUnique en un modelo de negocio para evitar fugas entre negocios', async () => {
    const { prisma } = buildMockPrisma();
    const scoped = forBusiness(prisma, 'biz-a');

    await expect(scoped.user.findUnique({ where: { id: 'user-de-otro-negocio' } })).rejects.toThrow(
      /bloqueado/,
    );
  });

  it('requiere un businessId no vacío', () => {
    const fakeConfig = {
      get: () => 'postgresql://user:pass@localhost:5432/db',
    } as unknown as ConfigService<Env, true>;
    const prisma = new PrismaService(fakeConfig);
    expect(() => forBusiness(prisma, '')).toThrow();
  });
});
