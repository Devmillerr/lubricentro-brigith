import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Product, ProductCategory, ProductCompatibility } from '@prisma/client';
import { PageOf } from '../../common/openapi/page.dto';
import { StockViewResponse } from '../../inventory/dto/inventory.response';

export class ProductCategoryResponse implements ProductCategory {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** `salePrice` y `stockQuantity` son `Decimal` en Prisma y viajan como string en el JSON. */
export class ProductResponse implements Omit<Product, 'salePrice' | 'stockQuantity'> {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty({ type: String, nullable: true })
  categoryId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  brand!: string | null;

  @ApiProperty({ type: String, nullable: true })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Decimal(10,2) serializado como string.',
  })
  salePrice!: string | null;

  @ApiProperty()
  tracksStock!: boolean;

  @ApiProperty({
    type: String,
    description:
      'Saldo en caché (Decimal(12,3) como string): suma de los movimientos del producto (BR-P3).',
  })
  stockQuantity!: string;

  @ApiProperty({ description: 'Tiene al menos un conteo (BR-P8).' })
  isCounted!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** Ítem de `GET /products`: `stock` solo viene con `includeStock=true`. */
export class ProductListItemResponse extends ProductResponse {
  @ApiPropertyOptional({ type: StockViewResponse })
  stock?: StockViewResponse;
}

export class ProductPageResponse extends PageOf(ProductListItemResponse) {}

export class ProductCompatibilityResponse implements ProductCompatibility {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  vehicleModelId!: string;

  @ApiProperty()
  confirmedById!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  confirmedAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
}
