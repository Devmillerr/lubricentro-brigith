import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness, runInAmbientTransaction } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';

export interface IdempotentResult<T> {
  status: number;
  body: T;
}

/** Reintentos si la dueña de la clave se deshizo justo cuando la leíamos. */
const MAX_ATTEMPTS = 5;

/**
 * Límites de la transacción que envuelve la operación: esperar un hueco en
 * el pool y duración total (Prisma usa 2 s y 5 s por defecto).
 */
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 };

/**
 * Mecanismo de idempotencia para escrituras críticas (04-ARCHITECTURE.md §7.3,
 * 06-API.md §1). Repetir la misma `Idempotency-Key` con el mismo cuerpo
 * devuelve la respuesta original en vez de repetir el efecto.
 *
 * Todo ocurre en **una sola transacción**: se inserta la reserva de la clave,
 * corre `handler()` (el servicio se une a esta transacción, ver
 * `runInAmbientTransaction` en prisma/business-scope.ts) y se guarda la
 * respuesta. Se confirma todo junto o nada:
 * - Si el handler falla, o el proceso muere (función serverless cortada,
 *   red), la base deshace la venta/recepción/pago **y** la reserva: un
 *   reintento con la misma clave corre limpio.
 * - Una reserva confirmada siempre tiene su respuesta: ya no puede quedar una
 *   fila "en curso" para siempre si se cae el paso que guardaba la respuesta.
 *
 * Concurrencia: el `@@unique([businessId, key, endpoint])` decide. Si otra
 * petición con la misma clave está en curso, Postgres hace esperar nuestro
 * INSERT hasta que la otra termine; si la otra confirmó, chocamos (P2002) y
 * devolvemos su respuesta guardada; si se deshizo, reintentamos y somos la
 * dueña. Nunca corren dos efectos para la misma clave.
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

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let reserved = false;
      try {
        return await scoped.$transaction(async (tx) => {
          const owned = await tx.idempotencyRecord.create({
            data: {
              businessId: params.businessId,
              key: params.key,
              endpoint: params.endpoint,
              requestHash: params.requestHash,
            },
          });
          reserved = true;

          const result = await runInAmbientTransaction(params.businessId, tx, params.handler);
          await tx.idempotencyRecord.update({
            where: { id: owned.id },
            data: {
              responseStatus: result.status,
              responseBody: result.body as Prisma.InputJsonValue,
            },
          });
          return { ...result, replayed: false };
        }, TRANSACTION_OPTIONS);
      } catch (error) {
        // Solo el choque de NUESTRA reserva es "clave ya usada"; un P2002 del
        // handler (p. ej. un RUC repetido) es un error del dominio.
        if (reserved || !isUniqueViolation(error)) throw error;
      }

      // Otra petición con la misma clave ya confirmó (esperamos a que
      // terminara para chocar): devolver su respuesta.
      const existing = await scoped.idempotencyRecord.findFirst({
        where: { key: params.key, endpoint: params.endpoint },
      });
      if (!existing) continue; // se deshizo entre el choque y esta lectura
      if (existing.requestHash !== params.requestHash) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'IDEMPOTENCY_KEY_REUSED',
          title: 'La clave de idempotencia ya se usó con una petición distinta',
          detail: `La clave "${params.key}" ya se usó en "${params.endpoint}" con otro cuerpo.`,
        });
      }
      if (existing.responseStatus != null) {
        return {
          status: existing.responseStatus,
          body: existing.responseBody as T,
          replayed: true,
        };
      }
      // Solo una fila de la versión anterior (reserva y efecto en
      // transacciones separadas) puede quedar sin respuesta.
      break;
    }

    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
      title: 'La misma clave de idempotencia sigue en curso en otra petición',
      detail: 'Intenta de nuevo en un momento.',
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
