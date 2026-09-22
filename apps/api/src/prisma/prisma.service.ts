import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
// eslint-disable-next-line no-restricted-imports -- este es el único lugar permitido: PrismaService ES la instancia de PrismaClient.
import { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.validation';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    // Prisma 7 ya no se conecta solo con `DATABASE_URL`: exige un driver
    // adapter explícito (ver el error de `prisma generate` que llevó a
    // `prisma.config.ts`, y https://pris.ly/d/driver-adapters).
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
