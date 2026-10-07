import { Prisma } from '@prisma/client';

/** Línea de recepción (`PURCHASE_IN`) con los datos de su producto. */
export interface ReceiptLineInput {
  refId: string | null;
  productId: string;
  quantityDelta: Prisma.Decimal;
  purchaseCost: Prisma.Decimal | null;
  product: { name: string; brand: string | null; unit: string };
}

/**
 * Lo comprado de un producto en un período (DEC-94). Todo sale de las
 * recepciones reales: nada se estima. La cantidad va en la unidad de stock
 * del producto (litros, unidades…), sin convertir.
 */
export interface ReceiptProductSummary {
  productId: string;
  name: string;
  brand: string | null;
  unit: string;
  /** Suma de lo recibido, con o sin monto (Decimal como string). */
  quantity: string;
  /** Recepciones distintas en las que llegó. */
  receiptCount: number;
  /** Suma de los montos registrados (2 decimales); "0.00" si ninguna línea tiene monto. */
  totalCost: string;
  /** Cantidad recibida en líneas con monto: la base del costo unitario. */
  quantityWithCost: string;
  /** Líneas sin monto: no se suman al total ni al costo unitario. */
  linesWithoutCost: number;
  /**
   * Costo por unidad de stock, calculado: `totalCost / quantityWithCost`
   * (2 decimales). `null` si no hay monto o la cantidad con monto es 0.
   */
  unitCost: string | null;
}

/**
 * Agrupa las líneas por producto. Orden: primero lo que más se pagó; los
 * productos sin monto al final, por nombre.
 */
export function summarizeReceiptLinesByProduct(lines: ReceiptLineInput[]): ReceiptProductSummary[] {
  const byProduct = new Map<
    string,
    {
      line: ReceiptLineInput;
      quantity: Prisma.Decimal;
      quantityWithCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
      withCost: number;
      withoutCost: number;
      receipts: Set<string>;
    }
  >();
  for (const line of lines) {
    let entry = byProduct.get(line.productId);
    if (!entry) {
      entry = {
        line,
        quantity: new Prisma.Decimal(0),
        quantityWithCost: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
        withCost: 0,
        withoutCost: 0,
        receipts: new Set(),
      };
      byProduct.set(line.productId, entry);
    }
    entry.quantity = entry.quantity.plus(line.quantityDelta);
    if (line.refId) entry.receipts.add(line.refId);
    if (line.purchaseCost === null) {
      entry.withoutCost += 1;
    } else {
      entry.withCost += 1;
      entry.totalCost = entry.totalCost.plus(line.purchaseCost);
      entry.quantityWithCost = entry.quantityWithCost.plus(line.quantityDelta);
    }
  }

  const summaries = [...byProduct.values()].map((entry) => ({
    productId: entry.line.productId,
    name: entry.line.product.name,
    brand: entry.line.product.brand,
    unit: entry.line.product.unit,
    quantity: entry.quantity.toString(),
    receiptCount: entry.receipts.size,
    totalCost: entry.totalCost.toFixed(2),
    quantityWithCost: entry.quantityWithCost.toString(),
    linesWithoutCost: entry.withoutCost,
    unitCost:
      entry.withCost > 0 && entry.quantityWithCost.greaterThan(0)
        ? entry.totalCost.dividedBy(entry.quantityWithCost).toFixed(2)
        : null,
    hasCost: entry.withCost > 0,
  }));

  summaries.sort((a, b) => {
    if (a.hasCost !== b.hasCost) return a.hasCost ? -1 : 1;
    const byCost = new Prisma.Decimal(b.totalCost).comparedTo(a.totalCost);
    return byCost !== 0 ? byCost : a.name.localeCompare(b.name, 'es');
  });
  return summaries.map(({ hasCost: _hasCost, ...summary }) => summary);
}
