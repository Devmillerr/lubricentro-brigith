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

/** `salePrice` es `Decimal` en Prisma y viaja como string en el JSON. */
export class ProductResponse implements Omit<Product, 'salePrice'> {
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
