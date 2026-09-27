import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, SaleLineKind, SaleSource } from '@prisma/client';
import { ProblemException } from '../common/exceptions/problem.exception';
import { forBusiness } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import { writeSale, type SaleWithLines } from '../sales/sales.service';

/** Endpoint con el que la capa HTTP registra la `Idempotency-Key` de `POST /washes`. */
export const WASH_IDEMPOTENCY_ENDPOINT = 'washes';

/** Entrada de un lavado (06-API.md §2, "Lavados"): sin monto, sin cliente ni placa. */
export interface CreateWashInput {
  id?: string;
  washTypeId: string;
  priceOptionId: string;
  paymentMethod: PaymentMethod;
  occurredAt?: string;
  note?: string;
}

/**
 * Registro de un lavado (R5). No hay tabla `Wash` (DEC-53): un lavado es una
 * `Sale` `source = WASH` con una sola `SaleLine` `WASH`, escrita con el mismo
 * helper que la venta de mostrador (`writeSale`, DEC-61). No mueve stock
 * (DEC-54): no pasa por el StockLedger ni al crearse ni al anularse. El
 * historial, el detalle y la anulación son los de `/sales` (DEC-59).
 */
@Injectable()
export class WashesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * En una transacción, todo o nada: el tipo y la opción de precio deben ser
   * del negocio (404), la opción debe ser del tipo (409
   * `WASH_PRICE_NOT_IN_TYPE`) y los dos deben estar activos (409, DEC-55).
   * El precio sale siempre de la opción: `unitPrice` = `subtotal` = `total` =
   * `amount` (sin monto libre). `descriptionSnapshot` = el `name` del tipo,
   * sin prefijos (DEC-67). Un `id` repetido falla en la base con el error
   * genérico, igual que la venta de mostrador (T4).
   */
  async create(businessId: string, userId: string, input: CreateWashInput): Promise<SaleWithLines> {
    const saleId = input.id ?? randomUUID();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    return forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const washType = await tx.washType.findFirst({ where: { id: input.washTypeId } });
      if (!washType) {
        throw problem(
          HttpStatus.NOT_FOUND,
          'WASH_TYPE_NOT_FOUND',
          'Tipo de lavado no encontrado',
          'washTypeId',
        );
      }
      const price = await tx.washPriceOption.findFirst({ where: { id: input.priceOptionId } });
      if (!price) {
        throw problem(
          HttpStatus.NOT_FOUND,
          'WASH_PRICE_NOT_FOUND',
          'Precio de lavado no encontrado',
          'priceOptionId',
        );
      }
      if (price.washTypeId !== washType.id) {
        throw problem(
          HttpStatus.CONFLICT,
          'WASH_PRICE_NOT_IN_TYPE',
          'El precio no pertenece a este tipo de lavado',
          'priceOptionId',
        );
      }
      if (!washType.isActive) {
        throw problem(
          HttpStatus.CONFLICT,
          'WASH_TYPE_INACTIVE',
          'El tipo de lavado está inactivo',
          'washTypeId',
        );
      }
      if (!price.isActive) {
        throw problem(
          HttpStatus.CONFLICT,
          'WASH_PRICE_INACTIVE',
          'El precio de lavado está inactivo',
          'priceOptionId',
        );
      }

      const amount = new Prisma.Decimal(price.amount);
      return writeSale(tx, {
        businessId,
        userId,
        saleId,
        source: SaleSource.WASH,
        paymentMethod: input.paymentMethod,
        occurredAt,
        note: input.note,
        lines: [
          {
            kind: SaleLineKind.WASH,
            productId: null,
            washTypeId: washType.id,
            descriptionSnapshot: washType.name,
            codeSnapshot: null,
            quantity: 1,
            unitPrice: amount,
            subtotal: amount,
            movesStock: false,
          },
        ],
      });
    });
  }
}

function problem(status: HttpStatus, code: string, title: string, field: string): ProblemException {
  return new ProblemException({
    status,
    code,
    title,
    errors: [{ field, message: `${title}.` }],
  });
}
