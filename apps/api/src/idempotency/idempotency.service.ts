import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';

export interface IdempotentResult<T> {
  status: number;
  body: T;
}

/**
 * Mecanismo de idempotencia para escrituras críticas (04-ARCHITECTURE.md §7.3,
 * 06-API.md §1). Repetir la misma `Idempotency-Key` con el mismo cuerpo
 * devuelve la respuesta original en vez de repetir el efecto.
 *
 * En C0 el mecanismo queda listo y probado, pero ningún endpoint de dominio
 * lo usa todavía (eso llega con C4: mantenimientos e inventario).
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashRequest(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex');
  }

  async run<T>(params: {
    businessId: string;
    key: string;
    endpoint: string;
    requestHash: string;
    handler: () => Promise<IdempotentResult<T>>;
  }): Promise<IdempotentResult<T> & { replayed: boolean }> {
    const scoped = forBusiness(this.prisma, params.businessId);

    const existing = await scoped.idempotencyRecord.findFirst({
      where: { key: params.key, endpoint: params.endpoint },
    });

    if (existing) {
      if (existing.requestHash !== params.requestHash) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'IDEMPOTENCY_KEY_REUSED',
          title: 'La clave de idempotencia ya se usó con una petición distinta',
          detail: `La clave "${params.key}" ya se usó en "${params.endpoint}" con otro cuerpo.`,
        });
      }
      return {
        status: existing.responseStatus,
        body: existing.responseBody as T,
        replayed: true,
      };
    }

    const result = await params.handler();

    await scoped.idempotencyRecord.create({
      data: {
        businessId: params.businessId,
        key: params.key,
        endpoint: params.endpoint,
        requestHash: params.requestHash,
        responseStatus: result.status,
        responseBody: result.body as Prisma.InputJsonValue,
      },
    });

    return { ...result, replayed: false };
  }
}
