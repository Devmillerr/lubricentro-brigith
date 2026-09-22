import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ProductCategoriesService } from './product-categories.service';
import { AUTH_ERRORS, ApiErrors, VALIDATION_ERRORS } from '../common/openapi/api-errors.decorator';
import { ProductCategoryResponse } from './dto/product.response';

@ApiTags('product-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiErrors({ 401: AUTH_ERRORS })
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly productCategoriesService: ProductCategoriesService) {}

  @ApiOkResponse({ type: [ProductCategoryResponse] })
  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.productCategoriesService.list(user.businessId);
  }

  @ApiCreatedResponse({ type: ProductCategoryResponse })
  @ApiErrors({ 400: VALIDATION_ERRORS, 409: ['PRODUCT_CATEGORY_ALREADY_EXISTS'] })
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateProductCategoryDto) {
    return this.productCategoriesService.create(user.businessId, dto);
  }
}
