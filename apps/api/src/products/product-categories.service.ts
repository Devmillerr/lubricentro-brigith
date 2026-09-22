import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type ProductCategory } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductCategoryDto } from './dto/create-product-category.dto';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string): Promise<ProductCategory[]> {
    return forBusiness(this.prisma, businessId).productCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(businessId: string, dto: CreateProductCategoryDto): Promise<ProductCategory> {
    try {
      return await forBusiness(this.prisma, businessId).productCategory.create({
        data: {
          id: dto.id ?? randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
          businessId,
          name: dto.name,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'PRODUCT_CATEGORY_ALREADY_EXISTS',
          title: 'Ya existe una categoría con ese nombre',
        });
      }
      throw error;
    }
  }
}
