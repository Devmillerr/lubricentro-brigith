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

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null = categoría de primer nivel; con valor = subcategoría (BR-P18).',
  })
  parentId!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ProductCategoryWithCountResponse extends ProductCategoryResponse {
  @ApiProperty({ description: 'Productos activos asignados directamente a esta categoría.' })
  productCount!: number;
}

/** Forma de venta activa de un producto (DEC-91). Los `Decimal` viajan como string. */
export class ProductSaleUnitResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Octavo' })
  label!: string;

  @ApiProperty({
    type: String,
    description:
      'Unidades de stock del producto que descuenta una unidad vendida (Decimal(12,3) como string).',
    example: '0.125',
  })
  factor!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Precio de esta forma (Decimal(10,2) como string). null = se escribe al vender.',
  })
  salePrice!: string | null;

  @ApiProperty()
  sortOrder!: number;
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

  @ApiProperty({ type: String, nullable: true })
  viscosity!: string | null;

  @ApiProperty({ type: String, nullable: true })
  presentation!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Sin subida todavía (DEC-34): null = la UI muestra un placeholder.',
  })
  imageKey!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({
    type: [ProductSaleUnitResponse],
    description:
      'Formas de venta activas, en orden (DEC-91). Vacía = se vende solo en su propia unidad.',
  })
  saleUnits!: ProductSaleUnitResponse[];
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

export class FacetValueResponse {
  @ApiProperty()
  value!: string;

  @ApiProperty({ description: 'Productos activos con este valor.' })
  count!: number;

  @ApiProperty({ description: 'Es un valor confirmado por el dueño (10-OPERACION-REAL.md §0.4).' })
  suggested!: boolean;
}

export class ProductFacetsResponse {
  @ApiProperty({ type: [FacetValueResponse] })
  brands!: FacetValueResponse[];

  @ApiProperty({ type: [FacetValueResponse] })
  viscosities!: FacetValueResponse[];

  @ApiProperty({ type: [FacetValueResponse] })
  presentations!: FacetValueResponse[];

  @ApiProperty({
    type: [FacetValueResponse],
    description: 'Unidades de stock en uso (sin valores inválidos) y sugeridas.',
  })
  units!: FacetValueResponse[];
}
