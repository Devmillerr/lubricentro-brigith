import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CompatibilitiesController } from './compatibilities.controller';
import { CompatibilitiesService } from './compatibilities.service';
import { ProductCategoriesController } from './product-categories.controller';
import { ProductCategoriesService } from './product-categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [ProductCategoriesController, ProductsController, CompatibilitiesController],
  providers: [ProductCategoriesService, ProductsService, CompatibilitiesService],
  exports: [ProductCategoriesService, ProductsService, CompatibilitiesService],
})
export class ProductsModule {}
