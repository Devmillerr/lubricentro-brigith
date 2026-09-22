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

const MAX_WAIT_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mecanismo de idempotencia para escrituras críticas (04-ARCHITECTURE.md §7.3,
 * 06-API.md §1). Repetir la misma `Idempotency-Key` con el mismo cuerpo
 * devuelve la respuesta original en vez de repetir el efecto.
 *
 * La fila se **inserta antes** de correr `handler()`, con `responseStatus`/
 * `responseBody` nulos ("en curso"). El `@@unique([businessId, key,
 * endpoint])` es quien de verdad impide que dos peticiones concurrentes con
 * la misma clave ejecuten el efecto dos veces: solo una puede insertar: esa
 * es la dueña y corre el handler; la otra choca con el unique, espera a que
 * la dueña termine (sondeo corto) y replica su resultado. Antes de este
 * cambio, el flujo era leer-y-luego-escribir (TOCTOU): dos peticiones
 * casi simultáneas podían pasar la lectura antes de que ninguna hubiera
 * escrito nada, y ambas ejecutaban el handler completo (auditoría, A-1).
 *
 * Si el handler falla, la fila se borra: una escritura fallida no debe
 * bloquear un reintento legítimo con la misma clave (mismo comportamiento
 * que antes, donde una falla nunca llegaba a crear el registro).
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

    for (let attempt = 0; attempt <= MAX_WAIT_ATTEMPTS; attempt++) {
      let owned: { id: string } | undefined;
      try {
        owned = await scoped.idempotencyRecord.create({
          data: {
            businessId: params.businessId,
            key: params.key,
            endpoint: params.endpoint,
            requestHash: params.requestHash,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
        // Alguien más ya reservó esta clave para este endpoint (o la usó
        // antes). Puede seguir en curso o ya haber terminado.
        const existing = await scoped.idempotencyRecord.findFirst({
          where: { key: params.key, endpoint: params.endpoint },
        });

        if (!existing) {
          // Se liberó entre el intento de crear y esta lectura (el dueño
          // falló y borró su fila): reintentamos el ciclo completo.
          continue;
        }
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
        // Todavía en curso: esperar un poco y volver a intentar el ciclo
        // (puede que para entonces ya haya terminado, o incluso fallado y
        // liberado la clave).
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // Somos los dueños de la clave: correr el efecto real.
      try {
        const result = await params.handler();
        await scoped.idempotencyRecord.update({
          where: { id: owned.id },
          data: {
            responseStatus: result.status,
            responseBody: result.body as Prisma.InputJsonValue,
          },
        });
        return { ...result, replayed: false };
      } catch (error) {
        await scoped.idempotencyRecord.delete({ where: { id: owned.id } }).catch(() => undefined);
        throw error;
      }
    }

    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
      title: 'La misma clave de idempotencia sigue en curso en otra petición',
      detail: 'Intenta de nuevo en un momento.',
    });
  }
}
