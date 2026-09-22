import { HttpStatus, Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma, type InventoryMovement } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { paginate, type Page } from '../common/pagination';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import type { CreateCountDto } from './dto/create-count.dto';
import type { CreateReceiptDto } from './dto/create-receipt.dto';
import type { ListMovementsQueryDto } from './dto/list-movements-query.dto';

export interface StockView {
  productId: string;
  balance: number;
  isCounted: boolean;
}

/**
 * Todo cambio de stock es un movimiento inmutable; el saldo es la suma de
 * sus `quantityDelta` (BR-P2, BR-P3, invariante 1 de 05-DATABASE.md §3). No
 * hay `update`/`delete` para movimientos: solo se insertan filas (BR-G5).
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saldo por producto, con `isCounted` (BR-P8). */
  async getStock(businessId: string, productId: string): Promise<StockView> {
    await this.ensureProductExists(businessId, productId);
    const movements = await this.movementsFor(businessId, productId);
    return {
      productId,
      balance: this.sum(movements),
      isCounted: movements.some((movement) => movement.type === InventoryMovementType.COUNT),
    };
  }

  async listMovements(
    businessId: string,
    query: ListMovementsQueryDto,
  ): Promise<Page<InventoryMovement>> {
    const limit = query.limit ?? 20;
    const where: Prisma.InventoryMovementWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;

    const rows = await forBusiness(this.prisma, businessId).inventoryMovement.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return paginate(rows, limit);
  }

  /**
   * Conteo físico: sirve para el stock inicial y para recontar (BR-P7).
   * `quantityDelta = countedQuantity − previousBalance` (invariante 2), así
   * que el saldo posterior queda igual a lo contado.
   */
  async count(businessId: string, dto: CreateCountDto): Promise<InventoryMovement> {
    await this.ensureProductExists(businessId, dto.productId);
    const previousBalance = this.sum(await this.movementsFor(businessId, dto.productId));

    return forBusiness(this.prisma, businessId).inventoryMovement.create({
      data: {
        // forBusiness sobrescribe businessId igual; se pasa para que el tipo compile (ver auth.service.ts).
        businessId,
        productId: dto.productId,
        type: InventoryMovementType.COUNT,
        quantityDelta: dto.countedQuantity - previousBalance,
        countedQuantity: dto.countedQuantity,
        previousBalance,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
    });
  }

  /** Ingreso de mercadería (BR-P6): siempre entra (+). */
  async receipt(businessId: string, dto: CreateReceiptDto): Promise<InventoryMovement> {
    await this.ensureProductExists(businessId, dto.productId);

    return forBusiness(this.prisma, businessId).inventoryMovement.create({
      data: {
        businessId,
        productId: dto.productId,
        type: InventoryMovementType.PURCHASE_IN,
        quantityDelta: dto.quantity,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
    });
  }

  /** Ajuste manual: el motivo es obligatorio (BR-P10). */
  async adjustment(businessId: string, dto: CreateAdjustmentDto): Promise<InventoryMovement> {
    await this.ensureProductExists(businessId, dto.productId);

    return forBusiness(this.prisma, businessId).inventoryMovement.create({
      data: {
        businessId,
        productId: dto.productId,
        type: InventoryMovementType.ADJUSTMENT,
        quantityDelta: dto.quantityDelta,
        reason: dto.reason,
        occurredAt: new Date(),
      },
    });
  }

  private async movementsFor(businessId: string, productId: string): Promise<InventoryMovement[]> {
    return forBusiness(this.prisma, businessId).inventoryMovement.findMany({
      where: { productId },
    });
  }

  /** Prisma.Decimal (real) o number (fake de pruebas): ambos coercen bien con Number(). */
  private sum(movements: InventoryMovement[]): number {
    return movements.reduce((total, movement) => total + Number(movement.quantityDelta), 0);
  }

  private async ensureProductExists(businessId: string, productId: string): Promise<void> {
    const product = await forBusiness(this.prisma, businessId).product.findFirst({
      where: { id: productId },
    });
    if (!product) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'PRODUCT_NOT_FOUND',
        title: 'Producto no encontrado',
      });
    }
  }
}
