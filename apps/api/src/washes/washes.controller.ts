import { Body, Controller, Headers, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { ProblemException } from '../common/exceptions/problem.exception';
import {
  AUTH_ERRORS,
  ApiErrors,
  IDEMPOTENCY_ERRORS,
  VALIDATION_ERRORS,
} from '../common/openapi/api-errors.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { SaleResponse, toSaleResponse } from '../sales/dto/sale.response';
import { CreateWashDto } from './dto/create-wash.dto';
import { WASH_IDEMPOTENCY_ENDPOINT, WashesService } from './washes.service';

/**
 * Registro de lavados (R5, 06-API.md §2 "Lavados"). Solo crea: el historial,
 * el detalle y la anulación son los de `/sales` (DEC-59). Exige
 * `Idempotency-Key`, como `POST /sales`.
 */
@ApiTags('washes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('washes')
export class WashesController {
  constructor(
    private readonly washesService: WashesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Crea el lavado como una venta `WASH` de una línea. No mueve stock (DEC-54). */
  @ApiCreatedResponse({ type: SaleResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['WASH_TYPE_NOT_FOUND', 'WASH_PRICE_NOT_FOUND'],
    409: [
      'WASH_PRICE_NOT_IN_TYPE',
      'WASH_TYPE_INACTIVE',
      'WASH_PRICE_INACTIVE',
      ...IDEMPOTENCY_ERRORS[409],
    ],
  })
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateWashDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<SaleResponse> {
    if (!idempotencyKey) {
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        title: 'Falta el header Idempotency-Key',
      });
    }
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: idempotencyKey,
      endpoint: WASH_IDEMPOTENCY_ENDPOINT,
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: toSaleResponse(await this.washesService.create(user.businessId, user.sub, dto)),
      }),
    });
    return result.body;
  }
}
