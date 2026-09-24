import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type Product, type VehicleModel } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { paginate, type Page } from '../common/pagination';
import { toStockView, type StockView } from '../inventory/inventory.service';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ListProductsQueryDto } from './dto/list-products-query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Con `includeStock`, agrega saldo y estado de conteo por producto
   * (06-API.md, BR-P8), leídos de la caché del propio producto: sin una
   * consulta por producto.
   */
  async list(
    businessId: string,
    query: ListProductsQueryDto,
  ): Promise<Page<Product | (Product & { stock: StockView })>> {
    const limit = query.limit ?? 20;
    // Claves de primer nivel: Prisma ya las combina con AND implícito.
    const where: Prisma.ProductWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.code) {
      where.code = { equals: query.code, mode: 'insensitive' };
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    const rows = await forBusiness(this.prisma, businessId).product.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const page = paginate(rows, limit);
    if (!query.includeStock) {
      return page;
    }

    const items = page.items.map((product) => ({ ...product, stock: toStockView(product) }));
    return { ...page, items };
  }

  async create(businessId: string, dto: CreateProductDto): Promise<Product> {
    if (dto.categoryId) {
      await this.ensureCategoryExists(businessId, dto.categoryId);
    }

    try {
      return await forBusiness(this.prisma, businessId).product.create({
        data: {
          id: dto.id ?? randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
          businessId,
          categoryId: dto.categoryId,
          brand: dto.brand,
          code: dto.code,
          name: dto.name,
          unit: dto.unit,
          salePrice: dto.salePrice,
          // BR-P16: por defecto controla stock. Se fija explícito en vez de
          // confiar en el default de Postgres, que no todo entorno de
          // prueba simula (ver test/support/fake-scoped-prisma.ts).
          tracksStock: dto.tracksStock ?? true,
        },
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async update(businessId: string, id: string, dto: UpdateProductDto): Promise<Product> {
    await this.ensureExists(businessId, id);

    if (dto.categoryId) {
      await this.ensureCategoryExists(businessId, dto.categoryId);
    }

    try {
      return await forBusiness(this.prisma, businessId).product.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async deactivate(businessId: string, id: string): Promise<void> {
    await this.ensureExists(businessId, id);
    await forBusiness(this.prisma, businessId).product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Modelos de vehículo con compatibilidad confirmada (06-API.md). */
  async compatibleModels(businessId: string, productId: string): Promise<VehicleModel[]> {
    await this.ensureExists(businessId, productId);

    const rows = await forBusiness(this.prisma, businessId).productCompatibility.findMany({
      where: { productId },
      include: { vehicleModel: true },
      orderBy: { confirmedAt: 'desc' },
    });
    return rows.map((row) => row.vehicleModel);
  }

  private async ensureCategoryExists(businessId: string, categoryId: string): Promise<void> {
    const category = await forBusiness(this.prisma, businessId).productCategory.findFirst({
      where: { id: categoryId },
    });
    if (!category) {
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        title: 'Referencia inválida',
        errors: [{ field: 'categoryId', message: 'La categoría indicada no existe' }],
      });
    }
  }

  private async ensureExists(businessId: string, id: string): Promise<void> {
    const existing = await forBusiness(this.prisma, businessId).product.findFirst({
      where: { id },
    });
    if (!existing) {
      throw this.notFound();
    }
  }

  private translateWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'PRODUCT_CODE_ALREADY_EXISTS',
        title: 'Ya existe un producto con ese código',
      });
    }
    throw error;
  }

  private notFound(): ProblemException {
    return new ProblemException({
      status: HttpStatus.NOT_FOUND,
      code: 'PRODUCT_NOT_FOUND',
      title: 'Producto no encontrado',
    });
  }
}
