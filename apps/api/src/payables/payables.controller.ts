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
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
import {
  ChangeDueDateDto,
  CreateReceiptPayableDto,
  ListPayablesQueryDto,
  PayableDetailResponse,
  PayableResponse,
  PayablesSummaryResponse,
  RegisterPaymentDto,
  VoidPayableDto,
  VoidPaymentDto,
} from './dto/payable.dto';
import { PayablesService } from './payables.service';

function requireKey(key: string | undefined): string {
  if (!key) {
    throw new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      title: 'Falta el header Idempotency-Key',
    });
  }
  return key;
}
/** Cuentas por pagar a proveedores (R8, DEC-98, 06-API.md §2). */
@ApiTags('payables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('payables')
export class PayablesController {
  constructor(
    private readonly payables: PayablesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @ApiOkResponse({ type: [PayableResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListPayablesQueryDto) {
    return this.payables.list(user.businessId, query);
  }

  @ApiOkResponse({ type: PayablesSummaryResponse })
  @Get('summary')
  summary(@CurrentUser() user: AccessTokenPayload) {
    return this.payables.summary(user.businessId);
  }

  @ApiOkResponse({ type: PayableDetailResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['PAYABLE_NOT_FOUND'] })
  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.payables.findOne(user.businessId, id);
  }

  /** Cambia el vencimiento con motivo (BR-K8). La misma fecha no cambia nada. */
  @ApiOkResponse({ type: PayableDetailResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['PAYABLE_NOT_FOUND'], 409: ['PAYABLE_NOT_OPEN'] })
  @Patch(':id/due-date')
  changeDueDate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeDueDateDto,
  ) {
    return this.payables.changeDueDate(user.businessId, user.sub, id, dto);
  }

  /** Anula solo la deuda (D31), si no tiene pagos activos. */
  @ApiOkResponse({ type: PayableDetailResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['PAYABLE_NOT_FOUND'],
    409: ['PAYABLE_ALREADY_VOIDED', 'PAYABLE_HAS_PAYMENTS', ...IDEMPOTENCY_ERRORS[409]],
  })
  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async voidPayable(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPayableDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: requireKey(key),
      endpoint: 'payables/void',
      requestHash: this.idempotency.hashRequest({ id, ...dto }),
      handler: async () => ({
        status: HttpStatus.OK,
        body: await this.payables.voidPayable(user.businessId, user.sub, id, dto.reason),
      }),
    });
    return result.body;
  }
}

/** Pagos de una deuda (R8, DEC-99). */
@ApiTags('payables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('payables')
export class PayablePaymentsController {
  constructor(
    private readonly payables: PayablesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @ApiOkResponse({ type: PayableDetailResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'PAYMENT_TOO_SMALL', ...IDEMPOTENCY_ERRORS[400]],
    404: ['PAYABLE_NOT_FOUND'],
    409: ['PAYABLE_VOIDED', 'PAYABLE_NOT_OPEN', ...IDEMPOTENCY_ERRORS[409]],
    422: ['OVERPAYMENT', 'SETTLEMENT_MISMATCH'],
  })
  @Post(':id/payments')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async pay(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: requireKey(key),
      endpoint: 'payables/payments',
      requestHash: this.idempotency.hashRequest({ id, ...dto }),
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: await this.payables.addPayment(user.businessId, user.sub, id, dto),
      }),
    });
    return result.body;
  }

  @ApiOkResponse({ type: PayableDetailResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['PAYABLE_NOT_FOUND', 'PAYMENT_NOT_FOUND'],
    409: ['PAYMENT_ALREADY_VOIDED', ...IDEMPOTENCY_ERRORS[409]],
  })
  @Post(':id/payments/:paymentId/void')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async voidPayment(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: VoidPaymentDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: requireKey(key),
      endpoint: 'payables/payments/void',
      requestHash: this.idempotency.hashRequest({ id, paymentId, ...dto }),
      handler: async () => ({
        status: HttpStatus.OK,
        body: await this.payables.cancelPayment(
          user.businessId,
          user.sub,
          id,
          paymentId,
          dto.reason,
        ),
      }),
    });
    return result.body;
  }
}

/** Deuda de una recepción ya registrada (R8, D22). */
@ApiTags('payables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('inventory/receipts')
export class ReceiptPayableController {
  constructor(
    private readonly payables: PayablesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @ApiOkResponse({ type: PayableDetailResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['RECEIPT_NOT_FOUND'],
    409: [
      'RECEIPT_VOIDED',
      'PURCHASE_INFO_REQUIRED',
      'PAYABLE_ALREADY_EXISTS',
      ...IDEMPOTENCY_ERRORS[409],
    ],
  })
  @Post(':id/payable')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReceiptPayableDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: requireKey(key),
      endpoint: 'inventory/receipts/payable',
      requestHash: this.idempotency.hashRequest({ id, ...dto }),
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: await this.payables.createForReceipt(user.businessId, user.sub, id, dto),
      }),
    });
    return result.body;
  }
}
