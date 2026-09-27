import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { CreateWashPriceOptionDto } from './dto/create-wash-price-option.dto';
import { CreateWashTypeDto } from './dto/create-wash-type.dto';
import { ListWashTypesQueryDto } from './dto/list-wash-types-query.dto';
import { UpdateWashPriceOptionDto } from './dto/update-wash-price-option.dto';
import { UpdateWashTypeDto } from './dto/update-wash-type.dto';
import {
  WashPriceOptionResponse,
  WashTypeResponse,
  WashTypeWithPricesResponse,
  toWashPriceOptionResponse,
  toWashTypeResponse,
  toWashTypeWithPricesResponse,
} from './dto/wash-type.response';
import { WashTypesService } from './wash-types.service';

/**
 * Configuración de tipos de lavado y sus precios (R5, 06-API.md §2
 * "Lavados"). Como `/product-categories`, no pide `Idempotency-Key`.
 */
@ApiTags('wash-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('wash-types')
export class WashTypesController {
  constructor(private readonly washTypesService: WashTypesService) {}

  @ApiOkResponse({ type: [WashTypeWithPricesResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListWashTypesQueryDto,
  ): Promise<WashTypeWithPricesResponse[]> {
    const types = await this.washTypesService.list(user.businessId, query.includeInactive ?? false);
    return types.map(toWashTypeWithPricesResponse);
  }

  @ApiCreatedResponse({ type: WashTypeResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 409: ['WASH_TYPE_ALREADY_EXISTS'] })
  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateWashTypeDto,
  ): Promise<WashTypeResponse> {
    return toWashTypeResponse(await this.washTypesService.create(user.businessId, dto));
  }

  @ApiOkResponse({ type: WashTypeResponse })
  @ApiErrors({
    400: VALIDATION_ERRORS,
    404: ['WASH_TYPE_NOT_FOUND'],
    409: ['WASH_TYPE_ALREADY_EXISTS'],
  })
  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWashTypeDto,
  ): Promise<WashTypeResponse> {
    return toWashTypeResponse(await this.washTypesService.update(user.businessId, id, dto));
  }

  @ApiCreatedResponse({ type: WashPriceOptionResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['WASH_TYPE_NOT_FOUND'] })
  @Post(':id/prices')
  async createPrice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWashPriceOptionDto,
  ): Promise<WashPriceOptionResponse> {
    return toWashPriceOptionResponse(
      await this.washTypesService.createPrice(user.businessId, id, dto),
    );
  }

  @ApiOkResponse({ type: WashPriceOptionResponse })
  @ApiErrors({
    400: VALIDATION_ERRORS,
    404: ['WASH_TYPE_NOT_FOUND', 'WASH_PRICE_NOT_FOUND'],
    409: ['WASH_PRICE_NOT_IN_TYPE'],
  })
  @Patch(':id/prices/:priceId')
  async updatePrice(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('priceId', ParseUUIDPipe) priceId: string,
    @Body() dto: UpdateWashPriceOptionDto,
  ): Promise<WashPriceOptionResponse> {
    return toWashPriceOptionResponse(
      await this.washTypesService.updatePrice(user.businessId, id, priceId, dto),
    );
  }
}
