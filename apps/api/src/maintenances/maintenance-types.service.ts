import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type MaintenanceType } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMaintenanceTypeDto } from './dto/create-maintenance-type.dto';

@Injectable()
export class MaintenanceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string): Promise<MaintenanceType[]> {
    return forBusiness(this.prisma, businessId).maintenanceType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(businessId: string, dto: CreateMaintenanceTypeDto): Promise<MaintenanceType> {
    try {
      return await forBusiness(this.prisma, businessId).maintenanceType.create({
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
          code: 'MAINTENANCE_TYPE_ALREADY_EXISTS',
          title: 'Ya existe un tipo de mantenimiento con ese nombre',
        });
      }
      throw error;
    }
  }
}
