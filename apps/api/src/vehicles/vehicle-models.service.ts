import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { VehicleModel } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVehicleModelDto } from './dto/create-vehicle-model.dto';
import type { UpdateVehicleModelDto } from './dto/update-vehicle-model.dto';

@Injectable()
export class VehicleModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string): Promise<VehicleModel[]> {
    return forBusiness(this.prisma, businessId).vehicleModel.findMany({
      orderBy: [{ make: 'asc' }, { model: 'asc' }],
    });
  }

  async create(
    businessId: string,
    userId: string,
    dto: CreateVehicleModelDto,
  ): Promise<VehicleModel> {
    return forBusiness(this.prisma, businessId).vehicleModel.create({
      data: {
        id: dto.id ?? randomUUID(),
        // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
        businessId,
        make: dto.make,
        model: dto.model,
        yearFrom: dto.yearFrom,
        yearTo: dto.yearTo,
        engineNote: dto.engineNote,
        createdById: userId,
      },
    });
  }

  async update(businessId: string, id: string, dto: UpdateVehicleModelDto): Promise<VehicleModel> {
    const existing = await forBusiness(this.prisma, businessId).vehicleModel.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'VEHICLE_MODEL_NOT_FOUND',
        title: 'Modelo de vehículo no encontrado',
      });
    }

    return forBusiness(this.prisma, businessId).vehicleModel.update({
      where: { id },
      data: dto,
    });
  }
}
