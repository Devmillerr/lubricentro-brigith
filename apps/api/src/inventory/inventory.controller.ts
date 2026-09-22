import { Body, Controller, Get, Headers, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { ProblemException } from '../common/exceptions/problem.exception';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateCountDto } from './dto/create-count.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { StockQueryDto } from './dto/stock-query.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('stock')
  getStock(@CurrentUser() user: AccessTokenPayload, @Query() query: StockQueryDto) {
    return this.inventoryService.getStock(user.businessId, query.productId);
  }

  @Get('movements')
  listMovements(@CurrentUser() user: AccessTokenPayload, @Query() query: ListMovementsQueryDto) {
    return this.inventoryService.listMovements(user.businessId, query);
  }

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
        body: await this.inventoryService.count(user.businessId, dto),
      }),
    });
    return result.body;
  }

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
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: await this.inventoryService.receipt(user.businessId, dto),
      }),
    });
    return result.body;
  }

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
        body: await this.inventoryService.adjustment(user.businessId, dto),
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
