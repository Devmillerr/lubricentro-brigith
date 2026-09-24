import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductFacetsQueryDto } from './dto/product-facets-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import {
  ProductFacetsResponse,
  ProductPageResponse,
  ProductResponse,
} from './dto/product.response';
import { VehicleModelResponse } from '../vehicles/dto/vehicle-model.response';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOkResponse({ type: ProductPageResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListProductsQueryDto) {
    return this.productsService.list(user.businessId, query);
  }

  @ApiOkResponse({ type: ProductFacetsResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get('facets')
  facets(@CurrentUser() user: AccessTokenPayload, @Query() query: ProductFacetsQueryDto) {
    return this.productsService.facets(user.businessId, query.categoryId);
  }

  @ApiCreatedResponse({ type: ProductResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'INVALID_REFERENCE'],
    409: ['PRODUCT_CODE_ALREADY_EXISTS'],
  })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.businessId, dto);
  }

  @ApiOkResponse({ type: ProductResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'INVALID_REFERENCE'],
    404: ['PRODUCT_NOT_FOUND'],
    409: ['PRODUCT_CODE_ALREADY_EXISTS'],
  })
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.businessId, id, dto);
  }

  @ApiNoContentResponse()
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['PRODUCT_NOT_FOUND'] })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.productsService.deactivate(user.businessId, id);
  }

  @ApiOkResponse({ type: [VehicleModelResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS, 404: ['PRODUCT_NOT_FOUND'] })
  @Get(':id/compatible-models')
  compatibleModels(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.compatibleModels(user.businessId, id);
  }
}
