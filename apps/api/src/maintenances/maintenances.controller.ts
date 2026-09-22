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
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { VoidMaintenanceDto } from './dto/void-maintenance.dto';
import { MaintenancesService } from './maintenances.service';
import {
  AUTH_ERRORS,
  ApiErrors,
  IDEMPOTENCY_ERRORS,
  VALIDATION_ERRORS,
} from '../common/openapi/api-errors.decorator';
import {
  CreateMaintenanceResponse,
  MaintenanceResponse,
  MaintenanceWithItemsResponse,
} from './dto/maintenance.response';

@ApiTags('maintenances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('maintenances')
export class MaintenancesController {
  constructor(
    private readonly maintenancesService: MaintenancesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @ApiCreatedResponse({ type: CreateMaintenanceResponse })
  @ApiErrors({
    400: [
      ...VALIDATION_ERRORS,
      ...IDEMPOTENCY_ERRORS[400],
      'INVALID_REFERENCE',
      'DUE_RULE_REQUIRED',
      'INCOHERENT_DUE_RULE',
    ],
    409: [...IDEMPOTENCY_ERRORS[409]],
    422: ['INSUFFICIENT_STOCK'],
  })
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateMaintenanceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: 'maintenances',
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => ({
        status: HttpStatus.CREATED,
        body: await this.maintenancesService.create(user.businessId, user.sub, dto),
      }),
    });
    return result.body;
  }

  @ApiOkResponse({ type: MaintenanceWithItemsResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['MAINTENANCE_NOT_FOUND'] })
  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.maintenancesService.findOne(user.businessId, id);
  }

  @ApiOkResponse({ type: MaintenanceResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'DUE_RULE_REQUIRED', 'INCOHERENT_DUE_RULE'],
    404: ['MAINTENANCE_NOT_FOUND'],
    409: ['MAINTENANCE_VOIDED'],
  })
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.maintenancesService.update(user.businessId, id, dto);
  }

  @ApiOkResponse({ type: MaintenanceResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, ...IDEMPOTENCY_ERRORS[400]],
    404: ['MAINTENANCE_NOT_FOUND'],
    409: [...IDEMPOTENCY_ERRORS[409], 'MAINTENANCE_ALREADY_VOIDED'],
  })
  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async voidMaintenance(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidMaintenanceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const result = await this.idempotency.run({
      businessId: user.businessId,
      key: this.requireIdempotencyKey(idempotencyKey),
      endpoint: `maintenances/${id}/void`,
      requestHash: this.idempotency.hashRequest(dto),
      handler: async () => ({
        status: HttpStatus.OK,
        body: await this.maintenancesService.void(user.businessId, user.sub, id, dto),
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
