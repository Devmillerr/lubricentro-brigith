import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type ProductCompatibility } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCompatibilityDto } from './dto/create-compatibility.dto';

/**
 * Compatibilidad explícita producto <-> modelo de vehículo (BR-F1). Nunca la
 * crea un mantenimiento ni una venta (BR-F2): solo `POST /compatibilities`.
 */
@Injectable()
export class CompatibilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    businessId: string,
    confirmedById: string,
    dto: CreateCompatibilityDto,
  ): Promise<ProductCompatibility> {
    await this.ensureProductExists(businessId, dto.productId);
    await this.ensureVehicleModelExists(businessId, dto.vehicleModelId);

    try {
      return await forBusiness(this.prisma, businessId).productCompatibility.create({
        data: {
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
          businessId,
          productId: dto.productId,
          vehicleModelId: dto.vehicleModelId,
          confirmedById,
          note: dto.note,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'COMPATIBILITY_ALREADY_EXISTS',
          title: 'Ese producto ya está marcado como compatible con ese modelo',
        });
      }
      throw error;
    }
  }

  async remove(businessId: string, id: string): Promise<void> {
    const existing = await forBusiness(this.prisma, businessId).productCompatibility.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'COMPATIBILITY_NOT_FOUND',
        title: 'Compatibilidad no encontrada',
      });
    }

    await forBusiness(this.prisma, businessId).productCompatibility.delete({ where: { id } });
  }

  private async ensureProductExists(businessId: string, productId: string): Promise<void> {
    const product = await forBusiness(this.prisma, businessId).product.findFirst({
      where: { id: productId },
    });
    if (!product) {
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        title: 'Referencia inválida',
        errors: [{ field: 'productId', message: 'El producto indicado no existe' }],
      });
    }
  }

  private async ensureVehicleModelExists(
    businessId: string,
    vehicleModelId: string,
  ): Promise<void> {
    const vehicleModel = await forBusiness(this.prisma, businessId).vehicleModel.findFirst({
      where: { id: vehicleModelId },
    });
    if (!vehicleModel) {
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        title: 'Referencia inválida',
        errors: [{ field: 'vehicleModelId', message: 'El modelo de vehículo indicado no existe' }],
      });
    }
  }
}
