import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateCountDto } from './dto/create-count.dto';
import { CreateReceiptDto, ReceiptPurchaseInfoDto, VoidReceiptDto } from './dto/create-receipt.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { ListReceiptsQueryDto } from './dto/list-receipts-query.dto';
import { ReceiptsSummaryQueryDto } from './dto/receipts-summary-query.dto';
import { StockQueryDto } from './dto/stock-query.dto';
import { InventoryService, type ReceiptBatchResult } from './inventory.service';
import {
  AUTH_ERRORS,
  ApiErrors,
  IDEMPOTENCY_ERRORS,
  VALIDATION_ERRORS,
} from '../common/openapi/api-errors.decorator';
import {
  InventoryMovementPageResponse,
  InventoryMovementResponse,
  InventoryReceiptResponse,
  InventoryReceiptSummaryPageResponse,
  ReceiptsMonthSummaryResponse,
  StockAlertsResponse,
  StockViewResponse,
} from './dto/inventory.response';

/** Respuesta de recepción: cabecera, líneas, ajustes, anulación, deuda y avisos (R8). */
function receiptResponse(result: ReceiptBatchResult) {
  return {
    ...result.receipt,
    lines: result.lines,
    adjustments: result.adjustments,
    voids: result.voids ?? [],
    payable: result.payable ?? null,
    warnings: result.warnings ?? [],
  };
}

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @ApiOkResponse({ type: StockViewResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['PRODUCT_NOT_FOUND'] })
  @Get('stock')
  getStock(@CurrentUser() user: AccessTokenPayload, @Query() query: StockQueryDto) {
    return this.inventoryService.getStock(user.businessId, query.productId);
  }

  /** Stock que requiere atención (R3, BR-P19): agotados, negativos y sin conteo. */
  @ApiOkResponse({ type: StockAlertsResponse })
  @Get('alerts')
  getAlerts(@CurrentUser() user: AccessTokenPayload) {
    return this.inventoryService.getAlerts(user.businessId);
  }

  @ApiOkResponse({ type: InventoryMovementPageResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get('movements')
  listMovements(@CurrentUser() user: AccessTokenPayload, @Query() query: ListMovementsQueryDto) {
    return this.inventoryService.listMovements(user.businessId, query);
  }

  @ApiCreatedResponse({ type: InventoryMovementResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['PRODUCT_NOT_FOUND'],
    409: [...IDEMPOTENCY_ERRORS[409]],
  })
  @Post('counts')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async count(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateCountDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: 'inventory/counts',
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: await this.inventoryService.count(user.businessId, user.sub, dto),
      }),
    });
    return result.body;
  }

  /** Historial de recepciones, de la más reciente a la más antigua (R3); con `month`, solo ese mes (DEC-94). */
  @ApiOkResponse({ type: InventoryReceiptSummaryPageResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get('receipts')
  listReceipts(@CurrentUser() user: AccessTokenPayload, @Query() query: ListReceiptsQueryDto) {
    return this.inventoryService.listReceipts(user.businessId, query);
  }

  /**
   * Total comprado en un mes (DEC-90): suma de los montos pagados registrados
   * en las recepciones del mes, en la zona horaria del negocio. Va antes de
   * `receipts/:id` para que "summary" no se tome como un id.
   */
  @ApiOkResponse({ type: ReceiptsMonthSummaryResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get('receipts/summary')
  receiptsSummary(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ReceiptsSummaryQueryDto,
  ) {
    return this.inventoryService.receiptsMonthSummary(user.businessId, query.month);
  }

  /** Recepción con sus líneas `PURCHASE_IN`, ordenadas por `productId` (R3). */
  @ApiOkResponse({ type: InventoryReceiptResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['RECEIPT_NOT_FOUND'] })
  @Get('receipts/:id')
  async getReceipt(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return receiptResponse(await this.inventoryService.getReceipt(user.businessId, id));
  }

  /**
   * Recepción en lote (R3, BR-P6): todo o nada. Las líneas se devuelven en el
   * orden enviado.
   */
  @ApiCreatedResponse({ type: InventoryReceiptResponse })
  @ApiErrors({
    400: [
      ...VALIDATION_ERRORS,
      'DUPLICATE_PRODUCT_LINE',
      'CREDIT_LINE_COST_REQUIRED',
      'CREDIT_TOTAL_MUST_BE_POSITIVE',
      ...IDEMPOTENCY_ERRORS[400],
    ],
    404: ['PRODUCT_NOT_FOUND', 'SUPPLIER_NOT_FOUND'],
    409: [
      'PRODUCT_INACTIVE',
      'SUPPLIER_INACTIVE',
      'DUPLICATE_DOCUMENT',
      'LATER_STOCK_CHECKS_FOUND',
      'LATER_STOCK_CHECKS_MISMATCH',
      'POSSIBLE_DUPLICATE_RECEIPT',
      ...IDEMPOTENCY_ERRORS[409],
    ],
  })
  @Post('receipts')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async receipt(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateReceiptDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: 'inventory/receipts',
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => {
        const created = await this.inventoryService.createReceiptBatch(
          user.businessId,
          user.sub,
          dto,
        );
        return { status: HttpStatus.CREATED, body: receiptResponse(created) };
      },
    });
    return result.body;
  }

  /**
   * Completa proveedor, comprobante o fecha de compra de una recepción ya
   * registrada (R8, DEC-95, BR-K5): de vacío a valor, sin tocar el stock.
   * Repetir los mismos valores no cambia nada (idempotente).
   */
  @ApiOkResponse({ type: InventoryReceiptResponse })
  @ApiErrors({
    400: VALIDATION_ERRORS,
    404: ['RECEIPT_NOT_FOUND', 'SUPPLIER_NOT_FOUND'],
    409: ['RECEIPT_VOIDED', 'SUPPLIER_INACTIVE', 'DUPLICATE_DOCUMENT', 'PURCHASE_INFO_ALREADY_SET'],
  })
  @Patch('receipts/:id/purchase-info')
  async purchaseInfo(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiptPurchaseInfoDto,
  ) {
    await this.inventoryService.setPurchaseInfo(user.businessId, user.sub, id, dto);
    return receiptResponse(await this.inventoryService.getReceipt(user.businessId, id));
  }

  /**
   * Anula una recepción (R8, DEC-97, BR-K6): todo o nada, con motivo. Se
   * rechaza sin escribir si ya está anulada, es anterior a R8, hubo
   * movimientos posteriores de sus productos, dejaría stock negativo o su
   * deuda tiene pagos. Lleva `Idempotency-Key`.
   */
  @ApiOkResponse({ type: InventoryReceiptResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['RECEIPT_NOT_FOUND'],
    409: [
      'RECEIPT_ALREADY_VOIDED',
      'RECEIPT_PREDATES_AUDIT',
      'RECEIPT_HAS_LATER_MOVEMENTS',
      'RECEIPT_VOID_NEGATIVE_STOCK',
      'PAYABLE_HAS_PAYMENTS',
      ...IDEMPOTENCY_ERRORS[409],
    ],
  })
  @Post('receipts/:id/void')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async voidReceipt(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidReceiptDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: 'inventory/receipts/void',
      requestHash: this.idempotency.hashRequest({ id, ...dto }),
      handler: async () => {
        const voided = await this.inventoryService.voidReceipt(
          user.businessId,
          user.sub,
          id,
          dto.reason,
        );
        return { status: HttpStatus.OK, body: receiptResponse(voided) };
      },
    });
    return result.body;
  }

  /**
   * Ajuste por cantidad física (R3, BR-P7b). Responde el movimiento
   * `ADJUSTMENT` con `previousBalance`, `quantityDelta`, `resultingBalance`
   * y `countedQuantity` (= la cantidad física enviada).
   */
  @ApiCreatedResponse({ type: InventoryMovementResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'NO_DIFFERENCE', ...IDEMPOTENCY_ERRORS[400]],
    404: ['PRODUCT_NOT_FOUND'],
    409: ['ADJUSTMENT_REQUIRES_COUNT', 'PRODUCT_INACTIVE', ...IDEMPOTENCY_ERRORS[409]],
  })
  @Post('adjustments')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async adjustment(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAdjustmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: 'inventory/adjustments',
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: await this.inventoryService.adjustment(user.businessId, user.sub, dto),
      }),
    });
    return result.body;
  }

  /** Idempotency-Key es obligatoria en POST /inventory/* (06-API.md §1). */
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
