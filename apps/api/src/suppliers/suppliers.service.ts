import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Supplier } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

/** Mayúsculas y sin espacios: así "20 123456789" y "20123456789" son el mismo RUC. */
export function normalizeCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  return normalized === '' ? null : normalized;
}

/** Vacío = sin dato, para los textos opcionales que se pueden borrar al editar. */
function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value === '' ? null : value;
}

/**
 * Proveedores (R8, DEC-95). Catálogo del negocio: sin borrado físico (se
 * desactiva) y con el documento (RUC) único por negocio.
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list(businessId: string, includeInactive = false): Promise<Supplier[]> {
    return forBusiness(this.prisma, businessId).supplier.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(businessId: string, id: string): Promise<Supplier> {
    const supplier = await forBusiness(this.prisma, businessId).supplier.findFirst({
      where: { id },
    });
    if (!supplier) throw supplierNotFound();
    return supplier;
  }

  async create(businessId: string, userId: string, dto: CreateSupplierDto): Promise<Supplier> {
    try {
      return await forBusiness(this.prisma, businessId).supplier.create({
        data: {
          id: randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
          businessId,
          name: dto.name,
          taxId: normalizeCode(dto.taxId),
          phone: optionalText(dto.phone) ?? null,
          note: optionalText(dto.note) ?? null,
          createdById: userId,
        },
      });
    } catch (error) {
      throw mapTaxIdConflict(error);
    }
  }

  async update(businessId: string, id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    await this.findOne(businessId, id);
    try {
      return await forBusiness(this.prisma, businessId).supplier.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.taxId !== undefined ? { taxId: normalizeCode(dto.taxId) } : {}),
          ...(dto.phone !== undefined ? { phone: optionalText(dto.phone) } : {}),
          ...(dto.note !== undefined ? { note: optionalText(dto.note) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch (error) {
      throw mapTaxIdConflict(error);
    }
  }
}

export function supplierNotFound(): ProblemException {
  return new ProblemException({
    status: HttpStatus.NOT_FOUND,
    code: 'SUPPLIER_NOT_FOUND',
    title: 'Proveedor no encontrado',
  });
}

function mapTaxIdConflict(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'SUPPLIER_TAX_ID_TAKEN',
      title: 'Ya hay un proveedor con ese documento',
      errors: [{ field: 'taxId', message: 'Ya hay un proveedor con ese documento.' }],
    });
  }
  return error;
}
