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
import { applyStockMovements, type StockEntry } from './stock-ledger';

export interface StockView {
  productId: string;
  balance: number;
  isCounted: boolean;
}

/**
 * Todo cambio de stock es un movimiento inmutable; el saldo es la suma de
 * sus `quantityDelta` (BR-P2, BR-P3, invariante 1 de 05-DATABASE.md §3). Las
 * escrituras pasan por el StockLedger, que además mantiene el saldo en caché
 * de `Product` (R1). No hay `update`/`delete` para movimientos (BR-G5).
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saldo por producto, con `isCounted` (BR-P8). Lee la caché de `Product`. */
  async getStock(businessId: string, productId: string): Promise<StockView> {
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
    return toStockView(product);
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
  async count(businessId: string, userId: string, dto: CreateCountDto): Promise<InventoryMovement> {
    return this.applyOne(businessId, userId, {
      productId: dto.productId,
      type: InventoryMovementType.COUNT,
      countedQuantity: dto.countedQuantity,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
  }

  /** Ingreso de mercadería (BR-P6): siempre entra (+). */
  async receipt(
    businessId: string,
    userId: string,
    dto: CreateReceiptDto,
  ): Promise<InventoryMovement> {
    return this.applyOne(businessId, userId, {
      productId: dto.productId,
      type: InventoryMovementType.PURCHASE_IN,
      quantityDelta: dto.quantity,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
  }

  /**
   * Ajuste manual: el motivo es obligatorio (BR-P10). Refleja el estante,
   * así que nunca se bloquea por saldo (DEC-26 aplica a las salidas por
   * consumo, no a las correcciones).
   */
  async adjustment(
    businessId: string,
    userId: string,
    dto: CreateAdjustmentDto,
  ): Promise<InventoryMovement> {
    return this.applyOne(businessId, userId, {
      productId: dto.productId,
      type: InventoryMovementType.ADJUSTMENT,
      quantityDelta: dto.quantityDelta,
      reason: dto.reason,
      occurredAt: new Date(),
    });
  }

  private async applyOne(
    businessId: string,
    userId: string,
    entry: StockEntry,
  ): Promise<InventoryMovement> {
    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const { movements } = await applyStockMovements(tx, {
        businessId,
        createdById: userId,
        policy: 'WARN',
        entries: [entry],
      });
      return movements[0]!;
    });
  }
}

/** `Prisma.Decimal` (real) o number (fake de pruebas): ambos coercen bien con Number(). */
export function toStockView(product: {
  id: string;
  stockQuantity: Prisma.Decimal | number | null;
  isCounted: boolean | null;
}): StockView {
  return {
    productId: product.id,
    balance: Number(product.stockQuantity ?? 0),
    isCounted: Boolean(product.isCounted),
  };
}
