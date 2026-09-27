import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type WashPriceOption, type WashType } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateWashPriceOptionDto } from './dto/create-wash-price-option.dto';
import type { CreateWashTypeDto } from './dto/create-wash-type.dto';
import type { UpdateWashPriceOptionDto } from './dto/update-wash-price-option.dto';
import type { UpdateWashTypeDto } from './dto/update-wash-type.dto';

export type WashTypeWithPrices = WashType & { prices: WashPriceOption[] };

/**
 * Configuración de lavados (R5, DEC-56 y DEC-63 a DEC-66): tipos y sus
 * opciones de precio. Se crean, editan, ordenan y desactivan; nunca se
 * borran (DEC-17). Todo pasa por `forBusiness`: un tipo o precio de otro
 * negocio es, para este servicio, uno que no existe (404).
 */
@Injectable()
export class WashTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tipos por `sortOrder`, nombre e `id`; sus precios por `sortOrder`, monto
   * e `id`. Sin `includeInactive`, solo tipos activos con sus precios activos
   * (flujo de cobro); con `true`, todo (Configuración, DEC-64).
   */
  async list(businessId: string, includeInactive = false): Promise<WashTypeWithPrices[]> {
    const scoped = forBusiness(this.prisma, businessId);
    const types = await scoped.washType.findMany({
      where: includeInactive ? {} : { isActive: true },
    });
    const prices = await scoped.washPriceOption.findMany({
      where: {
        washTypeId: { in: types.map((type) => type.id) },
        ...(includeInactive ? {} : { isActive: true }),
      },
    });

    const pricesByType = new Map<string, WashPriceOption[]>();
    for (const price of prices) {
      const list = pricesByType.get(price.washTypeId) ?? [];
      list.push(price);
      pricesByType.set(price.washTypeId, list);
    }

    return types
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es') || compareIds(a, b),
      )
      .map((type) => ({
        ...type,
        prices: (pricesByType.get(type.id) ?? []).sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            new Prisma.Decimal(a.amount).comparedTo(b.amount) ||
            compareIds(a, b),
        ),
      }));
  }

  async create(businessId: string, dto: CreateWashTypeDto): Promise<WashType> {
    try {
      return await forBusiness(this.prisma, businessId).washType.create({
        data: {
          id: dto.id ?? randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
          businessId,
          name: dto.name,
          imageKey: dto.imageKey ?? null,
          sortOrder: dto.sortOrder ?? 0,
          // Siempre nace activo (explícito, como en product-categories.service.ts).
          isActive: true,
        },
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(businessId: string, id: string, dto: UpdateWashTypeDto): Promise<WashType> {
    const scoped = forBusiness(this.prisma, businessId);
    await this.findType(businessId, id);

    if (dto.name !== undefined) {
      const sameName = await scoped.washType.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (sameName) throw alreadyExists();
    }

    try {
      return await scoped.washType.update({
        where: { id },
        data: {
          // `undefined` = no se toca; `imageKey: null` quita la imagen.
          name: dto.name,
          imageKey: dto.imageKey,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  /** Agrega una opción de precio al tipo de la URL; nace activa. */
  async createPrice(
    businessId: string,
    washTypeId: string,
    dto: CreateWashPriceOptionDto,
  ): Promise<WashPriceOption> {
    await this.findType(businessId, washTypeId);
    return forBusiness(this.prisma, businessId).washPriceOption.create({
      data: {
        id: dto.id ?? randomUUID(),
        businessId,
        washTypeId,
        amount: new Prisma.Decimal(dto.amount),
        label: dto.label ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      },
    });
  }

  /**
   * Edita o desactiva una opción de precio (DEC-63). El tipo de la URL debe
   * ser del negocio (404 `WASH_TYPE_NOT_FOUND`), el precio también (404
   * `WASH_PRICE_NOT_FOUND`) y además debe ser de ese tipo (409
   * `WASH_PRICE_NOT_IN_TYPE`).
   */
  async updatePrice(
    businessId: string,
    washTypeId: string,
    priceId: string,
    dto: UpdateWashPriceOptionDto,
  ): Promise<WashPriceOption> {
    const scoped = forBusiness(this.prisma, businessId);
    await this.findType(businessId, washTypeId);

    const price = await scoped.washPriceOption.findFirst({ where: { id: priceId } });
    if (!price) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'WASH_PRICE_NOT_FOUND',
        title: 'Precio de lavado no encontrado',
      });
    }
    if (price.washTypeId !== washTypeId) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'WASH_PRICE_NOT_IN_TYPE',
        title: 'El precio no pertenece a este tipo de lavado',
      });
    }

    return scoped.washPriceOption.update({
      // `washTypeId` también en el filtro: la escritura no puede tocar un precio de otro tipo.
      where: { id: priceId, washTypeId },
      data: {
        amount: dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount),
        // `null` quita la etiqueta.
        label: dto.label,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  private async findType(businessId: string, id: string): Promise<WashType> {
    const type = await forBusiness(this.prisma, businessId).washType.findFirst({ where: { id } });
    if (!type) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'WASH_TYPE_NOT_FOUND',
        title: 'Tipo de lavado no encontrado',
      });
    }
    return type;
  }
}

function compareIds(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function alreadyExists(): ProblemException {
  return new ProblemException({
    status: HttpStatus.CONFLICT,
    code: 'WASH_TYPE_ALREADY_EXISTS',
    title: 'Ya existe un tipo de lavado con ese nombre',
    errors: [{ field: 'name', message: 'Ya existe un tipo de lavado con ese nombre.' }],
  });
}

/** Único `(businessId, name)`: el duplicado (también por carrera) es un 409, no un 500. */
function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw alreadyExists();
  }
  throw error;
}
