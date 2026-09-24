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
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ListProductCategoriesQueryDto } from './dto/list-product-categories-query.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { ProductCategoriesService } from './product-categories.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { ProductCategoryResponse, ProductCategoryWithCountResponse } from './dto/product.response';

@ApiTags('product-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly productCategoriesService: ProductCategoriesService) {}

  @ApiOkResponse({ type: [ProductCategoryWithCountResponse] })
  @ApiErrors({ 400: VALIDATION_ERRORS })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListProductCategoriesQueryDto) {
    return this.productCategoriesService.list(user.businessId, query.includeInactive ?? false);
  }

  @ApiCreatedResponse({ type: ProductCategoryResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'INVALID_REFERENCE', 'CATEGORY_DEPTH_EXCEEDED'],
    409: ['PRODUCT_CATEGORY_ALREADY_EXISTS'],
  })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateProductCategoryDto) {
    return this.productCategoriesService.create(user.businessId, dto);
  }

  @ApiOkResponse({ type: ProductCategoryResponse })
  @ApiErrors({
    400: [...VALIDATION_ERRORS, 'INVALID_REFERENCE', 'CATEGORY_DEPTH_EXCEEDED'],
    404: ['PRODUCT_CATEGORY_NOT_FOUND'],
    409: ['PRODUCT_CATEGORY_ALREADY_EXISTS', 'CATEGORY_IN_USE'],
  })
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.productCategoriesService.update(user.businessId, id, dto);
  }
}
