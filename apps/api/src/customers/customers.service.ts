import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type Customer } from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
} from '../common/exceptions/problem.exception';
import { paginate, type Page } from '../common/pagination';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

type CustomerWithVehicles = Prisma.CustomerGetPayload<{ include: { vehicles: true } }>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, query: ListCustomersQueryDto): Promise<Page<Customer>> {
    const limit = query.limit ?? 20;
    const where: Prisma.CustomerWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const rows = await forBusiness(this.prisma, businessId).customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return paginate(rows, limit);
  }

  async create(businessId: string, userId: string, dto: CreateCustomerDto): Promise<Customer> {
    assertIdentifiable(dto.name, dto.phone);
    const scoped = forBusiness(this.prisma, businessId);
    try {
      return await scoped.customer.create({
        data: {
          id: dto.id ?? randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
          businessId,
          name: dto.name,
          phone: dto.phone,
          notes: dto.notes,
          createdById: userId,
        },
      });
    } catch (error) {
      if (!dto.id || !isUniqueViolation(error)) throw error;
      // Reintento con el mismo id (doble toque, red que se cortó): si es el
      // mismo cliente de este negocio con los mismos datos, ya está creado y
      // se devuelve tal cual. Otro contenido u otro negocio: 409, nunca 500.
      const existing = await scoped.customer.findFirst({ where: { id: dto.id } });
      if (existing && isSameCustomer(existing, dto)) return existing;
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'CUSTOMER_ID_CONFLICT',
        title: 'Ya existe un cliente con ese id y otros datos',
      });
    }
  }

  async findOneWithVehicles(businessId: string, id: string): Promise<CustomerWithVehicles> {
    const customer = await forBusiness(this.prisma, businessId).customer.findFirst({
      where: { id },
      include: { vehicles: true },
    });
    if (!customer) {
      throw this.notFound();
    }
    return customer;
  }

  async update(businessId: string, id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const existing = await this.ensureExists(businessId, id);
    // Lo que quedaría guardado: un campo que no llega conserva su valor.
    assertIdentifiable(
      dto.name !== undefined ? dto.name : existing.name,
      dto.phone !== undefined ? dto.phone : existing.phone,
    );
    return forBusiness(this.prisma, businessId).customer.update({
      where: { id },
      data: dto,
    });
  }

  async deactivate(businessId: string, id: string): Promise<void> {
    await this.ensureExists(businessId, id);
    await forBusiness(this.prisma, businessId).customer.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async ensureExists(businessId: string, id: string): Promise<Customer> {
    const existing = await forBusiness(this.prisma, businessId).customer.findFirst({
      where: { id },
    });
    if (!existing) {
      throw this.notFound();
    }
    return existing;
  }

  private notFound(): ProblemException {
    return new ProblemException({
      status: HttpStatus.NOT_FOUND,
      code: 'CUSTOMER_NOT_FOUND',
      title: 'Cliente no encontrado',
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Lo guardado coincide con lo que se vuelve a enviar (un campo que no llega es null). */
function isSameCustomer(existing: Customer, dto: CreateCustomerDto): boolean {
  return (
    existing.name === (dto.name ?? null) &&
    existing.phone === (dto.phone ?? null) &&
    existing.notes === (dto.notes ?? null)
  );
}

/**
 * Un cliente necesita al menos nombre o teléfono (BR-C3): sin ninguno de los
 * dos no se puede encontrar ni avisar. El error va en `name`, el primer campo
 * del formulario.
 */
function assertIdentifiable(
  name: string | null | undefined,
  phone: string | null | undefined,
): void {
  if (!name?.trim() && !phone?.trim()) {
    throw new ValidationProblemException([
      { field: 'name', message: 'Escribe el nombre o el teléfono del cliente.' },
    ]);
  }
}
