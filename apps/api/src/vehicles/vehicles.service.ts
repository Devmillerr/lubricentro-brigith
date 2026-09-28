import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type Maintenance,
  type Product,
  type ReminderStatus,
  type Vehicle,
} from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import type { MaintenanceDetail } from '../maintenances/maintenances.service';
import { MaintenancesService } from '../maintenances/maintenances.service';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { normalizePlate } from './plate.util';

type VehicleWithRelations = Prisma.VehicleGetPayload<{
  include: { customer: true; vehicleModel: true };
}>;

/** Recordatorio que generó el último mantenimiento: el de su "próximo" km/fecha. */
export interface LookupReminder {
  id: string;
  status: ReminderStatus;
}

export type VehicleLookupResult = VehicleWithRelations & {
  lastMaintenance: Maintenance | null;
  lastMaintenanceReminder: LookupReminder | null;
  lastKnownKm: number | null;
};

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenancesService: MaintenancesService,
  ) {}

  /**
   * Búsqueda rápida por placa, normalizada y parcial (BR-C1, B-013).
   * Devuelve vehículo, cliente, último mantenimiento (con el estado del
   * recordatorio que generó, 07-UI-UX.md §3.1) y último km conocido
   * (06-API.md): quedó pendiente en C1 porque Maintenance no existía
   * todavía (STATUS.md); ya no depende de nada más.
   */
  async lookup(businessId: string, rawPlate: string): Promise<VehicleLookupResult[]> {
    const normalized = normalizePlate(rawPlate);
    const vehicles = await forBusiness(this.prisma, businessId).vehicle.findMany({
      where: { plateNormalized: { contains: normalized } },
      include: { customer: true, vehicleModel: true },
      orderBy: { plateNormalized: 'asc' },
      take: 20,
    });

    return Promise.all(
      vehicles.map(async (vehicle) => {
        const lastMaintenance = await this.maintenancesService.getLastMaintenance(
          businessId,
          vehicle.id,
        );
        const reminder = lastMaintenance
          ? await forBusiness(this.prisma, businessId).reminder.findFirst({
              where: { sourceMaintenanceId: lastMaintenance.id },
              orderBy: { createdAt: 'desc' },
            })
          : null;
        return {
          ...vehicle,
          lastMaintenance,
          lastMaintenanceReminder: reminder ? { id: reminder.id, status: reminder.status } : null,
          lastKnownKm: await this.maintenancesService.getLastKnownKm(businessId, vehicle.id),
        };
      }),
    );
  }

  /** Historial de mantenimientos del vehículo (06-API.md), pendiente desde C1. */
  async listMaintenances(businessId: string, id: string): Promise<MaintenanceDetail[]> {
    const vehicle = await forBusiness(this.prisma, businessId).vehicle.findFirst({
      where: { id },
    });
    if (!vehicle) {
      throw this.notFound();
    }
    return this.maintenancesService.listByVehicle(businessId, id);
  }

  async create(businessId: string, userId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    if (dto.customerId) {
      await this.ensureRelatedExists(businessId, 'customer', dto.customerId);
    }
    if (dto.vehicleModelId) {
      await this.ensureRelatedExists(businessId, 'vehicleModel', dto.vehicleModelId);
    }

    try {
      return await forBusiness(this.prisma, businessId).vehicle.create({
        data: {
          id: dto.id ?? randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
          businessId,
          plate: dto.plate,
          plateNormalized: normalizePlate(dto.plate),
          customerId: dto.customerId,
          vehicleModelId: dto.vehicleModelId,
          year: dto.year,
          color: dto.color,
          notes: dto.notes,
          createdById: userId,
        },
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async findOne(businessId: string, id: string): Promise<VehicleWithRelations> {
    const vehicle = await forBusiness(this.prisma, businessId).vehicle.findFirst({
      where: { id },
      include: { customer: true, vehicleModel: true },
    });
    if (!vehicle) {
      throw this.notFound();
    }
    return vehicle;
  }

  async update(businessId: string, id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const existing = await forBusiness(this.prisma, businessId).vehicle.findFirst({
      where: { id },
    });
    if (!existing) {
      throw this.notFound();
    }

    if (dto.customerId) {
      await this.ensureRelatedExists(businessId, 'customer', dto.customerId);
    }
    if (dto.vehicleModelId) {
      await this.ensureRelatedExists(businessId, 'vehicleModel', dto.vehicleModelId);
    }

    try {
      return await forBusiness(this.prisma, businessId).vehicle.update({
        where: { id },
        data: {
          ...dto,
          plateNormalized: dto.plate ? normalizePlate(dto.plate) : undefined,
        },
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  /**
   * Productos con compatibilidad confirmada para el modelo del vehículo
   * (06-API.md). Quedó pendiente en C1 porque `Product` no existía todavía
   * (STATUS.md); ya no depende de nada más.
   */
  async compatibleProducts(businessId: string, id: string): Promise<Product[]> {
    const vehicle = await forBusiness(this.prisma, businessId).vehicle.findFirst({
      where: { id },
    });
    if (!vehicle) {
      throw this.notFound();
    }
    if (!vehicle.vehicleModelId) {
      return [];
    }

    const rows = await forBusiness(this.prisma, businessId).productCompatibility.findMany({
      where: { vehicleModelId: vehicle.vehicleModelId },
      include: { product: true },
      orderBy: { confirmedAt: 'desc' },
    });
    return rows.map((row) => row.product);
  }

  private async ensureRelatedExists(
    businessId: string,
    model: 'customer' | 'vehicleModel',
    id: string,
  ): Promise<void> {
    const scoped = forBusiness(this.prisma, businessId);
    const record =
      model === 'customer'
        ? await scoped.customer.findFirst({ where: { id } })
        : await scoped.vehicleModel.findFirst({ where: { id } });

    if (!record) {
      const field = model === 'customer' ? 'customerId' : 'vehicleModelId';
      const message =
        model === 'customer'
          ? 'El cliente indicado no existe'
          : 'El modelo de vehículo indicado no existe';
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        title: 'Referencia inválida',
        errors: [{ field, message }],
      });
    }
  }

  private translateWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'PLATE_ALREADY_EXISTS',
        title: 'Ya existe un vehículo con esa placa',
      });
    }
    throw error;
  }

  private notFound(): ProblemException {
    return new ProblemException({
      status: HttpStatus.NOT_FOUND,
      code: 'VEHICLE_NOT_FOUND',
      title: 'Vehículo no encontrado',
    });
  }
}
