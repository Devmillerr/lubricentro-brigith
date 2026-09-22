import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { hashRefreshTokenValue } from '../src/auth/refresh-token.util';
import type { Env } from '../src/config/env.validation';
import type { PrismaService } from '../src/prisma/prisma.service';

const ENV = {
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
  JWT_REFRESH_TTL: '30d',
};

function fakeConfig(): ConfigService<Env, true> {
  return { get: (key: keyof typeof ENV) => ENV[key] } as unknown as ConfigService<Env, true>;
}

function matchesWhere(record: Record<string, unknown>, where?: Record<string, unknown>): boolean {
  return Object.entries(where ?? {}).every(([key, value]) => record[key] === value);
}

type Store = Map<string, Record<string, unknown>>;

function runOp(
  store: Store,
  operation: string,
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> },
) {
  switch (operation) {
    case 'findFirst': {
      return [...store.values()].find((record) => matchesWhere(record, args.where)) ?? null;
    }
    case 'updateMany': {
      let count = 0;
      for (const record of store.values()) {
        if (matchesWhere(record, args.where)) {
          Object.assign(record, args.data);
          count++;
        }
      }
      return { count };
    }
    case 'update': {
      const record = [...store.values()].find((r) => matchesWhere(r, args.where));
      if (!record) throw new Error('registro no encontrado para update');
      Object.assign(record, args.data);
      return record;
    }
    case 'create': {
      const id = (args.data?.id as string) ?? `id-${store.size + 1}`;
      // Prisma pone `null` por defecto en las columnas opcionales que no se
      // envían (`revokedAt`, `replacedByTokenHash`); el fake lo imita para
      // que `where: { revokedAt: null }` encuentre las filas recién creadas.
      const record = { revokedAt: null, replacedByTokenHash: null, ...args.data, id };
      store.set(id, record);
      return record;
    }
    default:
      throw new Error(`operación no soportada en el fake: ${operation}`);
  }
}

function buildFakePrisma() {
  const businesses: Store = new Map();
  const users: Store = new Map();
  const refreshTokens: Store = new Map();

  const prisma = {
    user: {
      findUnique: (args: { where: Record<string, unknown> }) => runOp(users, 'findFirst', args),
    },
    refreshToken: {
      findUnique: (args: { where: Record<string, unknown> }) =>
        runOp(refreshTokens, 'findFirst', args),
    },
    business: {
      findUnique: (args: { where: Record<string, unknown> }) =>
        runOp(businesses, 'findFirst', args),
    },
    $extends(config: {
      query: { $allModels: { $allOperations: (ctx: unknown) => Promise<unknown> } };
    }) {
      const operations = config.query.$allModels.$allOperations;
      const wrap = (model: string, store: Store) => ({
        findFirst: (args: Record<string, unknown>) =>
          operations({
            model,
            operation: 'findFirst',
            args,
            query: (a: unknown) => runOp(store, 'findFirst', a as never),
          }),
        updateMany: (args: Record<string, unknown>) =>
          operations({
            model,
            operation: 'updateMany',
            args,
            query: (a: unknown) => runOp(store, 'updateMany', a as never),
          }),
        update: (args: Record<string, unknown>) =>
          operations({
            model,
            operation: 'update',
            args,
            query: (a: unknown) => runOp(store, 'update', a as never),
          }),
        create: (args: Record<string, unknown>) =>
          operations({
            model,
            operation: 'create',
            args,
            query: (a: unknown) => runOp(store, 'create', a as never),
          }),
      });
      return { user: wrap('User', users), refreshToken: wrap('RefreshToken', refreshTokens) };
    },
  } as unknown as PrismaService;

  return { prisma, businesses, users, refreshTokens };
}

describe('AuthService', () => {
  async function setup() {
    const { prisma, businesses, users, refreshTokens } = buildFakePrisma();
    businesses.set('biz-a', { id: 'biz-a', name: 'Brigith', slug: 'brigith' });
    const passwordHash = await argon2.hash('correcta123', { type: argon2.argon2id });
    users.set('user-a', {
      id: 'user-a',
      businessId: 'biz-a',
      name: 'Dueño',
      username: 'brigith',
      passwordHash,
      role: 'OWNER',
      isActive: true,
    });

    const service = new AuthService(prisma, new JwtService(), fakeConfig());
    return { service, users, refreshTokens };
  }

  it('login con credenciales correctas devuelve un par de tokens y guarda el refresco con hash', async () => {
    const { service, refreshTokens } = await setup();

    const pair = await service.login('brigith', 'correcta123');

    expect(pair.accessToken).toEqual(expect.any(String));
    expect(pair.refreshToken).toEqual(expect.any(String));
    expect(refreshTokens.size).toBe(1);
    const stored = [...refreshTokens.values()].at(0);
    expect(stored?.tokenHash).toBe(hashRefreshTokenValue(pair.refreshToken));
    expect(stored?.businessId).toBe('biz-a');
  });

  it('login con contraseña incorrecta rechaza con INVALID_CREDENTIALS', async () => {
    const { service } = await setup();
    await expect(service.login('brigith', 'incorrecta')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('login con username inexistente rechaza con el mismo código (sin filtrar qué usuarios existen)', async () => {
    const { service } = await setup();
    await expect(service.login('no-existe', 'lo-que-sea')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('login con usuario inactivo rechaza con INVALID_CREDENTIALS', async () => {
    const { service, users } = await setup();
    (users.get('user-a') as Record<string, unknown>).isActive = false;

    await expect(service.login('brigith', 'correcta123')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('refresh con un token válido rota: revoca el anterior y emite uno nuevo', async () => {
    const { service, refreshTokens } = await setup();
    const first = await service.login('brigith', 'correcta123');

    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(refreshTokens.size).toBe(2);
    const oldRecord = [...refreshTokens.values()].find(
      (r) => r.tokenHash === hashRefreshTokenValue(first.refreshToken),
    ) as Record<string, unknown>;
    expect(oldRecord.revokedAt).toBeInstanceOf(Date);
    expect(oldRecord.replacedByTokenHash).toBe(hashRefreshTokenValue(second.refreshToken));
  });

  it('reusar un refresh token ya rotado lo rechaza y revoca toda la sesión', async () => {
    const { service, refreshTokens } = await setup();
    const first = await service.login('brigith', 'correcta123');
    await service.refresh(first.refreshToken);

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });

    const active = [...refreshTokens.values()].filter((r) => !r.revokedAt);
    expect(active).toHaveLength(0);
  });

  it('logout revoca el refresh token indicado; refrescar con él después falla', async () => {
    const { service } = await setup();
    const pair = await service.login('brigith', 'correcta123');

    await service.logout('biz-a', 'user-a', pair.refreshToken);

    await expect(service.refresh(pair.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('me devuelve el usuario y el negocio actuales', async () => {
    const { service } = await setup();

    const { user, business } = await service.me('biz-a', 'user-a');

    expect(user.username).toBe('brigith');
    expect(business.slug).toBe('brigith');
  });
});
