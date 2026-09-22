import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { IdempotencyService } from './idempotency.service';

class IdempotencyTestDto {
  @IsString()
  @MinLength(1)
  businessId!: string;

  @IsString()
  @MinLength(1)
  echo!: string;
}

/**
 * Controlador solo para probar el mecanismo de idempotencia end-to-end
 * (04-ARCHITECTURE.md §7.3 lo pide como parte de C0). No representa un
 * endpoint de dominio: no se monta cuando NODE_ENV=production
 * (ver AppModule) y no debe usarse como ejemplo de un módulo real.
 */
@ApiExcludeController()
@Controller('internal/idempotency-test')
export class IdempotencyTestController {
  constructor(private readonly idempotency: IdempotencyService) {}

  @Post()
  async run(
    @Body() dto: IdempotencyTestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) {
      return { error: 'Falta el header Idempotency-Key' };
    }

    const requestHash = this.idempotency.hashRequest(dto);

    return this.idempotency.run({
      businessId: dto.businessId,
      key: idempotencyKey,
      endpoint: 'internal/idempotency-test',
      requestHash,
      handler: () =>
        Promise.resolve({
          status: 201,
          body: { id: randomUUID(), echo: dto.echo, generatedAt: new Date().toISOString() },
        }),
    });
  }
}
