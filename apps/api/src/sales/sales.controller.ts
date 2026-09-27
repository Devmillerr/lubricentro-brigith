import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import {
  CreateSaleResponse,
  SaleResponse,
  SaleSummaryPageResponse,
  toCreateSaleResponse,
  toSaleResponse,
  toSaleSummaryResponse,
} from './dto/sale.response';
import { VoidSaleDto } from './dto/void-sale.dto';
import {
  SALE_IDEMPOTENCY_ENDPOINT,
  SalesService,
  saleVoidIdempotencyEndpoint,
} from './sales.service';

/**
 * Ventas de mostrador (R4, 06-API.md §2 "Ventas"). Las escrituras exigen
 * `Idempotency-Key` y pasan por `IdempotencyService`, como el resto de la API.
 */
@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Crea la venta completa: todo o nada. Stock insuficiente: BLOCK fijo (DEC-26). */
  @ApiCreatedResponse({ type: CreateSaleResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'DUPLICATE_PRODUCT_LINE', ...IDEMPOTENCY_ERRORS[400]],
    404: ['PRODUCT_NOT_FOUND'],
    409: ['PRODUCT_INACTIVE', ...IDEMPOTENCY_ERRORS[409]],
    422: ['INSUFFICIENT_STOCK'],
  })
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<CreateSaleResponse> {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: SALE_IDEMPOTENCY_ENDPOINT,
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: toCreateSaleResponse(await this.salesService.create(user.businessId, user.sub, dto)),
      }),
    });
    return result.body;
  }

  /** Historial: más recientes primero; `from` incluido y `to` excluido. */
  @ApiOkResponse({ type: SaleSummaryPageResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListSalesQueryDto) {
    const page = await this.salesService.list(user.businessId, query);
    return { items: page.items.map(toSaleSummaryResponse), nextCursor: page.nextCursor };
  }

  /** Venta con sus líneas, ordenadas por `productId`. */
  @ApiOkResponse({ type: SaleResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['SALE_NOT_FOUND'] })
  @Get(':id')
  async get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleResponse> {
    return toSaleResponse(await this.salesService.get(user.businessId, id));
  }

  /** Anula la venta y devuelve el stock de sus líneas con `movesStock` (BR-V7). */
  @ApiOkResponse({ type: SaleResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['SALE_NOT_FOUND'],
    409: ['SALE_ALREADY_VOIDED', ...IDEMPOTENCY_ERRORS[409]],
  })
  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async void(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<SaleResponse> {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: saleVoidIdempotencyEndpoint(id),
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => ({
        status: HttpStatus.OK,
        body: toSaleResponse(await this.salesService.void(user.businessId, user.sub, id, dto)),
      }),
    });
    return result.body;
  }

  private requireIdempotencyKey(key: string | undefined): string {
    if (!key) {
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        title: 'Falta el header Idempotency-Key',
      });
    }
    return key;
  }
}
