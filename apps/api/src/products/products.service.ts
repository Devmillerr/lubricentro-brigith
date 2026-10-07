import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type Product, type ProductSaleUnit, type VehicleModel } from '@prisma/client';
import {
  ProblemException,
  ValidationProblemException,
  type FieldError,
} from '../common/exceptions/problem.exception';
import { paginate, type Page } from '../common/pagination';
import { toStockView, type StockView } from '../inventory/inventory.service';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CATALOG_SUGGESTIONS, isValidUnit, UNIT_MESSAGE } from './catalog-suggestions';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ListProductsQueryDto } from './dto/list-products-query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

export interface FacetValue {
  value: string;
  count: number;
  suggested: boolean;
}

export interface ProductFacets {
  brands: FacetValue[];
  viscosities: FacetValue[];
  presentations: FacetValue[];
  /** Unidades de stock en uso (sin valores inválidos como "0") y sugeridas. */
  units: FacetValue[];
}

/** Formas de venta por producto (DEC-91). */
export const MAX_SALE_UNITS = 20;

/** Elemento de `PUT /products/:id/sale-units` (DEC-91). */
export interface SaleUnitInput {
  id?: string;
  label: string;
  factor: number;
  salePrice?: number | null;
}

/** Producto con sus formas de venta activas, en orden (DEC-91). */
export type ProductWithSaleUnits = Product & { saleUnits: ProductSaleUnit[] };

/** Solo las formas activas, en el orden configurado. */
const ACTIVE_SALE_UNITS = {
  saleUnits: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

/**
 * Primero los valores en uso (más productos primero), luego las sugerencias
 * confirmadas que todavía no se usan, en su orden original.
 */
function buildFacet(values: (string | null)[], suggestions: readonly string[]): FacetValue[] {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase('es');
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(value, (spellings.get(value) ?? 0) + 1);
    groups.set(key, spellings);
  }
  const suggestedKeys = new Set(suggestions.map((value) => value.toLocaleLowerCase('es')));

  const used: FacetValue[] = [...groups.entries()].map(([key, spellings]) => {
    const [value] = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const count = [...spellings.values()].reduce((total, n) => total + n, 0);
    return { value, count, suggested: suggestedKeys.has(key) };
  });
  used.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'es'));

  const unused = suggestions
    .filter((value) => !groups.has(value.toLocaleLowerCase('es')))
    .map((value) => ({ value, count: 0, suggested: true }));

  return [...used, ...unused];
}

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
  ): Promise<Page<ProductWithSaleUnits | (ProductWithSaleUnits & { stock: StockView })>> {
    const limit = query.limit ?? 20;
    // Claves de primer nivel: Prisma ya las combina con AND implícito.
    const where: Prisma.ProductWhereInput = {};

    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' } as const;
      where.OR = [
        { name: contains },
        { brand: contains },
        { code: contains },
        { viscosity: contains },
        { presentation: contains },
        // Por vehículo compatible confirmado ("yaris" → sus filtros). La
        // compatibilidad pertenece al mismo negocio que el producto (BR-F1).
        {
          compatibilities: {
            some: { vehicleModel: { OR: [{ model: contains }, { make: contains }] } },
          },
        },
      ];
    }
    if (query.code) {
      where.code = { equals: query.code, mode: 'insensitive' };
    }
    if (query.categoryId) {
      where.categoryId = { in: await this.categoryWithChildren(businessId, query.categoryId) };
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.brand) {
      where.brand = { equals: query.brand, mode: 'insensitive' };
    }
    if (query.viscosity) {
      where.viscosity = { equals: query.viscosity, mode: 'insensitive' };
    }
    if (query.presentation) {
      where.presentation = { equals: query.presentation, mode: 'insensitive' };
    }
    if (query.missingPrice) {
      where.salePrice = null;
    }

    const rows = await forBusiness(this.prisma, businessId).product.findMany({
      where,
      include: ACTIVE_SALE_UNITS,
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

  /**
   * Valores para elegir en vez de escribir (BR-P19b): marcas, viscosidades y
   * presentaciones de los productos activos (de la categoría y sus
   * subcategorías, si se indica), con su conteo, más las sugerencias
   * confirmadas por el dueño. Los valores iguales sin distinguir mayúsculas
   * se agrupan con la escritura más usada.
   */
  async facets(businessId: string, categoryId?: string): Promise<ProductFacets> {
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (categoryId) {
      where.categoryId = { in: await this.categoryWithChildren(businessId, categoryId) };
    }
    const products = await forBusiness(this.prisma, businessId).product.findMany({ where });

    return {
      brands: buildFacet(
        products.map((product) => product.brand),
        CATALOG_SUGGESTIONS.brands,
      ),
      viscosities: buildFacet(
        products.map((product) => product.viscosity),
        CATALOG_SUGGESTIONS.viscosities,
      ),
      presentations: buildFacet(
        products.map((product) => product.presentation),
        CATALOG_SUGGESTIONS.presentations,
      ),
      units: buildFacet(
        products.map((product) => (isValidUnit(product.unit) ? product.unit : null)),
        CATALOG_SUGGESTIONS.units,
      ),
    };
  }

  async create(businessId: string, dto: CreateProductDto): Promise<ProductWithSaleUnits> {
    assertContainer({
      unit: dto.unit,
      containerCapacity: dto.containerCapacity ?? null,
      containerLabel: dto.containerLabel?.trim() || null,
    });
    if (dto.categoryId) {
      await this.ensureCategoryExists(businessId, dto.categoryId);
    }

    try {
      return await forBusiness(this.prisma, businessId).product.create({
        include: ACTIVE_SALE_UNITS,
        data: {
          id: dto.id ?? randomUUID(),
          // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
          businessId,
          categoryId: dto.categoryId,
          brand: dto.brand,
          code: dto.code,
          viscosity: dto.viscosity,
          presentation: dto.presentation,
          name: dto.name,
          unit: dto.unit,
          salePrice: dto.salePrice,
          // BR-P16: por defecto controla stock. Se fija explícito en vez de
          // confiar en el default de Postgres, que no todo entorno de
          // prueba simula (ver test/support/fake-scoped-prisma.ts).
          tracksStock: dto.tracksStock ?? true,
          containerCapacity: dto.containerCapacity,
          containerLabel: dto.containerLabel?.trim() || undefined,
        },
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductWithSaleUnits> {
    const existing = await this.findExisting(businessId, id);
    if (dto.containerLabel) dto.containerLabel = dto.containerLabel.trim() || null;
    // Se valida el resultado final: lo enviado sobre lo que ya tiene.
    if (
      dto.containerCapacity !== undefined ||
      dto.containerLabel !== undefined ||
      (dto.unit !== undefined && existing.containerCapacity !== null)
    ) {
      assertContainer({
        unit: dto.unit ?? existing.unit,
        containerCapacity:
          dto.containerCapacity !== undefined
            ? dto.containerCapacity
            : existing.containerCapacity === null
              ? null
              : Number(existing.containerCapacity),
        containerLabel:
          dto.containerLabel !== undefined ? dto.containerLabel || null : existing.containerLabel,
      });
    }

    if (dto.categoryId) {
      await this.ensureCategoryExists(businessId, dto.categoryId);
    }

    try {
      return await forBusiness(this.prisma, businessId).product.update({
        where: { id },
        data: dto,
        include: ACTIVE_SALE_UNITS,
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  /**
   * Formas de venta del producto (DEC-91): la lista enviada pasa a ser la de
   * formas activas, en ese orden. Cada elemento se aplica a la forma con su
   * `id` (que debe ser de este producto) o, sin `id`, a la que tenga el
   * mismo nombre aunque esté desactivada (sin distinguir mayúsculas); si no
   * hay, se crea. Las activas que no vienen se desactivan: nunca se borran,
   * porque las ventas pasadas las referencian (y conservan su nombre y
   * equivalencia copiados, así que cambiarlas no altera el pasado).
   *
   * Para configurar formas, la unidad del producto debe ser un nombre válido:
   * la equivalencia se expresa en esa unidad (p. ej. 0.125 galón).
   */
  async setSaleUnits(
    businessId: string,
    productId: string,
    units: SaleUnitInput[],
  ): Promise<ProductWithSaleUnits> {
    const normalized = validateSaleUnits(units);

    try {
      return await forBusiness(this.prisma, businessId).$transaction(async (tx) => {
        const product = await tx.product.findFirst({ where: { id: productId } });
        if (!product) throw this.notFound();
        if (normalized.length > 0 && !isValidUnit(product.unit)) {
          throw new ProblemException({
            status: HttpStatus.CONFLICT,
            code: 'PRODUCT_UNIT_INVALID',
            title: 'Primero define la unidad del producto',
            detail: `La unidad actual («${product.unit}») no es válida. ${UNIT_MESSAGE}`,
          });
        }

        const existing = await tx.productSaleUnit.findMany({ where: { productId } });
        const byId = new Map(existing.map((unit) => [unit.id, unit]));
        const byLabel = new Map(existing.map((unit) => [labelKey(unit.label), unit]));
        const kept = new Set<string>();

        for (const [index, input] of normalized.entries()) {
          let target = input.id ? byId.get(input.id) : byLabel.get(labelKey(input.label));
          if (input.id && !target) {
            throw new ProblemException({
              status: HttpStatus.NOT_FOUND,
              code: 'SALE_UNIT_NOT_FOUND',
              title: 'Forma de venta no encontrada',
              errors: [
                { field: `units.${index}.id`, message: 'No es una forma de este producto.' },
              ],
            });
          }
          // Dos elementos no pueden terminar en la misma fila.
          if (target && kept.has(target.id)) target = undefined;
          const data = {
            label: input.label,
            factor: input.factor,
            salePrice: input.salePrice,
            sortOrder: index,
            isActive: true,
          };
          if (target) {
            kept.add(target.id);
            await tx.productSaleUnit.update({ where: { id: target.id }, data });
          } else {
            const created = await tx.productSaleUnit.create({
              // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile.
              data: { ...data, id: randomUUID(), businessId, productId },
            });
            kept.add(created.id);
          }
        }

        const toDeactivate = existing.filter((unit) => unit.isActive && !kept.has(unit.id));
        if (toDeactivate.length > 0) {
          await tx.productSaleUnit.updateMany({
            where: { id: { in: toDeactivate.map((unit) => unit.id) } },
            data: { isActive: false },
          });
        }

        return tx.product.findFirstOrThrow({
          where: { id: productId },
          include: ACTIVE_SALE_UNITS,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'SALE_UNIT_ALREADY_EXISTS',
          title: 'Ya hay otra forma de venta con ese nombre',
        });
      }
      throw error;
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

  /** Una categoría activa del negocio: las desactivadas no reciben productos nuevos. */
  private async ensureCategoryExists(businessId: string, categoryId: string): Promise<void> {
    const category = await forBusiness(this.prisma, businessId).productCategory.findFirst({
      where: { id: categoryId },
    });
    if (!category?.isActive) {
      throw new ProblemException({
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        title: 'Referencia inválida',
        errors: [
          {
            field: 'categoryId',
            message: category ? 'La categoría está desactivada' : 'La categoría indicada no existe',
          },
        ],
      });
    }
  }

  /** La categoría y sus subcategorías (máximo 2 niveles, BR-P18), dentro del negocio. */
  private async categoryWithChildren(businessId: string, categoryId: string): Promise<string[]> {
    const children = await forBusiness(this.prisma, businessId).productCategory.findMany({
      where: { parentId: categoryId },
    });
    return [categoryId, ...children.map((child) => child.id)];
  }

  private async findExisting(businessId: string, id: string): Promise<Product> {
    const existing = await forBusiness(this.prisma, businessId).product.findFirst({
      where: { id },
    });
    if (!existing) throw this.notFound();
    return existing;
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

function labelKey(label: string): string {
  return label.trim().toLocaleLowerCase('es');
}

interface NormalizedSaleUnit {
  id?: string;
  label: string;
  factor: number;
  salePrice: number | null;
}

/**
 * Forma de `PUT /products/:id/sale-units` (DEC-91), antes de tocar la base:
 * hasta MAX_SALE_UNITS formas, nombre obligatorio y sin repetir (sin
 * distinguir mayúsculas), equivalencia > 0 con hasta 3 decimales y precio
 * opcional ≥ 0 con hasta 2. Devuelve los nombres recortados y el precio en
 * `null` si no se envió.
 */
function validateSaleUnits(units: SaleUnitInput[]): NormalizedSaleUnit[] {
  if (units.length > MAX_SALE_UNITS) {
    throw new ValidationProblemException([
      { field: 'units', message: `Un producto admite hasta ${MAX_SALE_UNITS} formas de venta.` },
    ]);
  }
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  const normalized = units.map((unit, index) => {
    const label = typeof unit.label === 'string' ? unit.label.trim() : '';
    if (!label || label.length > 50) {
      errors.push({
        field: `units.${index}.label`,
        message: 'Escribe un nombre de hasta 50 caracteres.',
      });
    } else if (seen.has(labelKey(label))) {
      errors.push({ field: `units.${index}.label`, message: 'Ese nombre ya está en la lista.' });
    }
    seen.add(labelKey(label));
    if (!hasDecimals(unit.factor, 3) || unit.factor <= 0) {
      errors.push({
        field: `units.${index}.factor`,
        message: 'La equivalencia debe ser mayor que 0, con hasta 3 decimales.',
      });
    }
    const salePrice = unit.salePrice ?? null;
    if (salePrice !== null && (!hasDecimals(salePrice, 2) || salePrice < 0)) {
      errors.push({
        field: `units.${index}.salePrice`,
        message: 'El precio debe ser 0 o más, con hasta 2 decimales.',
      });
    }
    return { id: unit.id, label, factor: unit.factor, salePrice };
  });
  if (errors.length > 0) throw new ValidationProblemException(errors);
  return normalized;
}

function hasDecimals(value: number, maxDecimals: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    new Prisma.Decimal(String(value)).decimalPlaces() <= maxDecimals
  );
}

/**
 * Envase abierto (DEC-93): capacidad y nombre van juntos (los dos o ninguno),
 * y la capacidad se expresa en la unidad del producto, que debe ser válida
 * (DEC-92). Sin envase, el producto es normal y no se valida nada más.
 */
function assertContainer(product: {
  unit: string;
  containerCapacity: number | null;
  containerLabel: string | null;
}): void {
  const errors: FieldError[] = [];
  if (product.containerCapacity !== null && !product.containerLabel) {
    errors.push({
      field: 'containerLabel',
      message: 'Escribe el nombre del envase (p. ej. Balde).',
    });
  }
  if (product.containerLabel && product.containerCapacity === null) {
    errors.push({ field: 'containerCapacity', message: 'Indica la capacidad del envase.' });
  }
  if (product.containerCapacity !== null && !isValidUnit(product.unit)) {
    errors.push({ field: 'unit', message: UNIT_MESSAGE });
  }
  if (errors.length > 0) throw new ValidationProblemException(errors);
}
