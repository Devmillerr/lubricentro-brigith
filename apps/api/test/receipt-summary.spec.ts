import { Prisma } from '@prisma/client';
import {
  summarizeReceiptLinesByProduct,
  type ReceiptLineInput,
} from '../src/inventory/receipt-summary';

/** Resumen de compras por producto (DEC-94): todo sale de las líneas reales. */
function line(
  productId: string,
  refId: string,
  quantity: string,
  purchaseCost: string | null,
  product: Partial<ReceiptLineInput['product']> = {},
): ReceiptLineInput {
  return {
    refId,
    productId,
    quantityDelta: new Prisma.Decimal(quantity),
    purchaseCost: purchaseCost === null ? null : new Prisma.Decimal(purchaseCost),
    product: { name: productId, brand: null, unit: 'unidad', ...product },
  };
}

describe('summarizeReceiptLinesByProduct', () => {
  it('sin líneas: lista vacía', () => {
    expect(summarizeReceiptLinesByProduct([])).toEqual([]);
  });

  it('producto por unidad: 1 unidad a S/ 341.60 → S/ 341.60 por unidad', () => {
    const [atf] = summarizeReceiptLinesByProduct([
      line('atf', 'r1', '1', '341.60', { name: 'ATF', unit: 'unidad' }),
    ]);
    expect(atf).toEqual({
      productId: 'atf',
      name: 'ATF',
      brand: null,
      unit: 'unidad',
      quantity: '1',
      receiptCount: 1,
      totalCost: '341.60',
      quantityWithCost: '1',
      linesWithoutCost: 0,
      unitCost: '341.60',
    });
  });

  it('producto en litros: respeta la unidad y no convierte (1 L a S/ 115 → S/ 115 por litro; 20 L a S/ 115 → S/ 5.75)', () => {
    const [oneLiter] = summarizeReceiptLinesByProduct([
      line('granel', 'r1', '1', '115', { unit: 'litro' }),
    ]);
    expect(oneLiter).toMatchObject({ unit: 'litro', quantity: '1', unitCost: '115.00' });

    const [bucket] = summarizeReceiptLinesByProduct([
      line('granel', 'r1', '20', '115', { unit: 'litro' }),
    ]);
    expect(bucket).toMatchObject({ unit: 'litro', quantity: '20', unitCost: '5.75' });
  });

  it('sin monto: cuenta la cantidad y la recepción, pero no el total ni el costo unitario', () => {
    const [product] = summarizeReceiptLinesByProduct([line('p', 'r1', '12', null)]);
    expect(product).toMatchObject({
      quantity: '12',
      receiptCount: 1,
      totalCost: '0.00',
      quantityWithCost: '0',
      linesWithoutCost: 1,
      unitCost: null,
    });
  });

  it('mezcla con y sin monto: el costo unitario usa solo la cantidad que tiene monto', () => {
    const [product] = summarizeReceiptLinesByProduct([
      line('p', 'r1', '4', '100'),
      line('p', 'r2', '6', null),
    ]);
    expect(product).toMatchObject({
      quantity: '10',
      receiptCount: 2,
      totalCost: '100.00',
      quantityWithCost: '4',
      linesWithoutCost: 1,
      unitCost: '25.00',
    });
  });

  it('varias recepciones del mismo producto: suma cantidades y montos, costo promedio ponderado', () => {
    const [product] = summarizeReceiptLinesByProduct([
      line('p', 'r1', '20', '115', { unit: 'litro' }),
      line('p', 'r2', '40', '220', { unit: 'litro' }),
    ]);
    // (115 + 220) / 60 = 5.583… → 5.58
    expect(product).toMatchObject({
      quantity: '60',
      receiptCount: 2,
      totalCost: '335.00',
      unitCost: '5.58',
    });
  });

  it('una recepción con varios productos los separa y cuenta una recepción para cada uno', () => {
    const summary = summarizeReceiptLinesByProduct([
      line('a', 'r1', '2', '50'),
      line('b', 'r1', '3', '90'),
      line('c', 'r1', '1', null),
    ]);
    expect(summary.map((p) => [p.productId, p.receiptCount, p.totalCost])).toEqual([
      ['b', 1, '90.00'],
      ['a', 1, '50.00'],
      ['c', 1, '0.00'],
    ]);
  });

  it('monto 0 con cantidad: costo unitario 0, no se inventa otro valor', () => {
    const [product] = summarizeReceiptLinesByProduct([line('p', 'r1', '5', '0')]);
    expect(product).toMatchObject({ totalCost: '0.00', unitCost: '0.00', linesWithoutCost: 0 });
  });

  it('orden: primero lo que más se pagó; los productos sin monto al final, por nombre', () => {
    const summary = summarizeReceiptLinesByProduct([
      line('z', 'r1', '1', null, { name: 'Zeta' }),
      line('b', 'r1', '1', '10', { name: 'Beta' }),
      line('a', 'r1', '1', null, { name: 'Alfa' }),
      line('c', 'r1', '1', '30', { name: 'Gamma' }),
    ]);
    expect(summary.map((p) => p.name)).toEqual(['Gamma', 'Beta', 'Alfa', 'Zeta']);
  });
});
