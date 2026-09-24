import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type ProductCategory } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductCategoryDto } from './dto/create-product-category.dto';
import type { UpdateProductCategoryDto } from './dto/update-product-category.dto';

export type ProductCategoryWithCount = ProductCategory & { productCount: number };

/**
 * Categorías de producto: datos editables con máximo 2 niveles (categoría →
 * subcategoría, BR-P18). No hay taxonomía fija: se crean, renombran, mueven,
 * ordenan y desactivan desde Configuración. Nunca se borran (BR-G5).
 */
@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ordenadas por `sortOrder` y nombre, con los productos activos de cada una. */
  async list(businessId: string, includeInactive = false): Promise<ProductCategoryWithCount[]> {
    const scoped = forBusiness(this.prisma, businessId);
    const categories = await scoped.productCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
    });
    const activeProducts = await scoped.product.findMany({ where: { isActive: true } });

    const countByCategory = new Map<string, number>();
    for (const product of activeProducts) {
      if (!product.categoryId) continue;
      countByCategory.set(product.categoryId, (countByCategory.get(product.categoryId) ?? 0) + 1);
    }

    return categories
      .map((category) => ({ ...category, productCount: countByCategory.get(category.id) ?? 0 }))
      .sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'es'),
      );
  }

  async create(businessId: string, dto: CreateProductCategoryDto): Promise<ProductCategory> {
    if (dto.parentId) {
      await this.ensureValidParent(businessId, dto.parentId);
    }
    try {
      return await forBusiness(this.prisma, businessId).productCategory.create({
        data: {
          id: dto.id ?? randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
          businessId,
          name: dto.name,
          parentId: dto.parentId ?? null,
          sortOrder: dto.sortOrder ?? 0,
          // Explícito en vez de confiar en el default de Postgres (ver products.service.ts).
          isActive: true,
        },
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateProductCategoryDto,
  ): Promise<ProductCategory> {
    const scoped = forBusiness(this.prisma, businessId);
    const existing = await scoped.productCategory.findFirst({ where: { id } });
    if (!existing) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'PRODUCT_CATEGORY_NOT_FOUND',
        title: 'Categoría no encontrada',
      });
    }

    // Mover: solo debajo de una categoría de primer nivel, y solo si esta no
    // tiene subcategorías (si no, quedarían 3 niveles).
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw this.depthExceeded('Una categoría no puede estar dentro de sí misma.');
      }
      await this.ensureValidParent(businessId, dto.parentId);
      const children = await scoped.productCategory.findMany({ where: { parentId: id } });
      if (children.length > 0) {
        throw this.depthExceeded(
          'Esta categoría tiene subcategorías: no puede pasar a ser subcategoría (máximo 2 niveles).',
        );
      }
    }

    if (dto.isActive === false && existing.isActive) {
      const activeProducts = await scoped.product.findMany({
        where: { categoryId: id, isActive: true },
        take: 1,
      });
      const activeChildren = await scoped.productCategory.findMany({
        where: { parentId: id, isActive: true },
        take: 1,
      });
      if (activeProducts.length > 0 || activeChildren.length > 0) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'CATEGORY_IN_USE',
          title: 'La categoría tiene productos o subcategorías activos',
          detail: 'Muévelos a otra categoría o desactívalos antes de desactivar esta.',
        });
      }
    }

    if (dto.isActive === true && !existing.isActive) {
      const parentId = dto.parentId !== undefined ? dto.parentId : existing.parentId;
      if (parentId) {
        const parent = await scoped.productCategory.findFirst({ where: { id: parentId } });
        if (!parent?.isActive) {
          throw this.invalidParent('La categoría padre está desactivada.');
        }
      }
    }

    try {
      return await scoped.productCategory.update({
        where: { id },
        data: {
          // `undefined` = no se toca; `parentId: null` = pasa a primer nivel.
          name: dto.name,
          parentId: dto.parentId,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  /** El padre debe existir en el negocio, ser de primer nivel y estar activo. */
  private async ensureValidParent(businessId: string, parentId: string): Promise<void> {
    const parent = await forBusiness(this.prisma, businessId).productCategory.findFirst({
      where: { id: parentId },
    });
    if (!parent) {
      throw this.invalidParent('La categoría padre no existe.');
    }
    if (parent.parentId) {
      throw this.depthExceeded(
        'La categoría padre ya es una subcategoría: máximo 2 niveles (categoría → subcategoría).',
      );
    }
    if (!parent.isActive) {
      throw this.invalidParent('La categoría padre está desactivada.');
    }
  }

  private invalidParent(message: string): ProblemException {
    return new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: 'INVALID_REFERENCE',
      title: 'Referencia inválida',
      errors: [{ field: 'parentId', message }],
    });
  }

  private depthExceeded(detail: string): ProblemException {
    return new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: 'CATEGORY_DEPTH_EXCEEDED',
      title: 'Las categorías tienen como máximo 2 niveles',
      detail,
      errors: [{ field: 'parentId', message: detail }],
    });
  }

  private translateWriteError(error: unknown): never {
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
