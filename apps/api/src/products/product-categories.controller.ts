import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/types/jwt-payload';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ProductCategoriesService } from './product-categories.service';

@ApiTags('product-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly productCategoriesService: ProductCategoriesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.productCategoriesService.list(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateProductCategoryDto) {
    return this.productCategoriesService.create(user.businessId, dto);
  }
}
