import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_MONEY, MAX_QUANTITY } from '../src/common/decimal-limits';
import { CreateAdjustmentDto } from '../src/inventory/dto/create-adjustment.dto';
import { CreateCountDto } from '../src/inventory/dto/create-count.dto';
import { ReceiptLineDto } from '../src/inventory/dto/create-receipt.dto';
import { MaintenanceChargeDto } from '../src/maintenances/dto/maintenance-charge.dto';
import { MaintenanceItemDto } from '../src/maintenances/dto/maintenance-item.dto';
import { CreateProductDto } from '../src/products/dto/create-product.dto';
import { UpdateProductDto } from '../src/products/dto/update-product.dto';
import { CreateSaleLineDto } from '../src/sales/dto/create-sale.dto';

/**
 * Topes de las columnas Decimal (hallazgo H4): el máximo que cabe se acepta y
 * lo que no cabe falla en la validación (400 `VALIDATION_ERROR` por el
 * ValidationPipe), antes de llegar a Postgres y terminar en un 500.
 * Decimal(10,2) → 99 999 999,99; Decimal(12,3) → 999 999 999,999.
 */
const PRODUCT_ID = '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

type Case = {
  label: string;
  dto: new () => object;
  base: Record<string, unknown>;
  field: string;
  max: number;
  over: number;
};

const cases: Case[] = [
  {
    label: 'venta: unitPrice',
    dto: CreateSaleLineDto,
    base: { productId: PRODUCT_ID, quantity: 1 },
    field: 'unitPrice',
    max: MAX_MONEY,
    over: 100_000_000,
  },
  {
    label: 'venta: quantity',
    dto: CreateSaleLineDto,
    base: { productId: PRODUCT_ID, unitPrice: 1 },
    field: 'quantity',
    max: MAX_QUANTITY,
    over: 1_000_000_000,
  },
  {
    label: 'cobro de mantenimiento: totalAmount',
    dto: MaintenanceChargeDto,
    base: { paymentMethod: 'CASH' },
    field: 'totalAmount',
    max: MAX_MONEY,
    over: 100_000_000,
  },
  {
    label: 'producto (alta): salePrice',
    dto: CreateProductDto,
    base: { name: 'Aceite', unit: 'litro' },
    field: 'salePrice',
    max: MAX_MONEY,
    over: 100_000_000,
  },
  {
    label: 'producto (edición): salePrice',
    dto: UpdateProductDto,
    base: {},
    field: 'salePrice',
    max: MAX_MONEY,
    over: 100_000_000,
  },
  {
    label: 'recepción: quantity',
    dto: ReceiptLineDto,
    base: { productId: PRODUCT_ID },
    field: 'quantity',
    max: MAX_QUANTITY,
    over: 1_000_000_000,
  },
  {
    label: 'conteo: countedQuantity',
    dto: CreateCountDto,
    base: { productId: PRODUCT_ID },
    field: 'countedQuantity',
    max: MAX_QUANTITY,
    over: 1_000_000_000,
  },
  {
    label: 'ajuste: physicalQuantity',
    dto: CreateAdjustmentDto,
    base: { productId: PRODUCT_ID, reason: 'Recuento' },
    field: 'physicalQuantity',
    max: MAX_QUANTITY,
    over: 1_000_000_000,
  },
  {
    label: 'producto usado en mantenimiento: quantity',
    dto: MaintenanceItemDto,
    base: { productId: PRODUCT_ID },
    field: 'quantity',
    max: MAX_QUANTITY,
    over: 1_000_000_000,
  },
];

async function errorsFor(dto: new () => object, body: Record<string, unknown>) {
  return validate(plainToInstance(dto, body));
}

describe('Topes Decimal en los DTOs (H4)', () => {
  it('los topes coinciden con las columnas: Decimal(10,2) y Decimal(12,3)', () => {
    expect(MAX_MONEY).toBe(99_999_999.99);
    expect(MAX_QUANTITY).toBe(999_999_999.999);
  });

  it.each(cases)('$label: acepta el máximo que cabe en la columna', async (c) => {
    expect(await errorsFor(c.dto, { ...c.base, [c.field]: c.max })).toEqual([]);
  });

  it.each(cases)('$label: acepta un valor habitual', async (c) => {
    expect(await errorsFor(c.dto, { ...c.base, [c.field]: 25.5 })).toEqual([]);
  });

  it.each(cases)('$label: rechaza lo que no cabe, con error en el campo', async (c) => {
    const errors = await errorsFor(c.dto, { ...c.base, [c.field]: c.over });
    expect(errors.map((e) => e.property)).toEqual([c.field]);
    expect(Object.keys(errors[0]!.constraints ?? {})).toContain('max');
  });

  it('también como texto (el ValidationPipe transforma a número)', async () => {
    const errors = await errorsFor(CreateSaleLineDto, {
      productId: PRODUCT_ID,
      quantity: 1,
      unitPrice: '100000000',
    });
    expect(errors.map((e) => e.property)).toEqual(['unitPrice']);
  });
});
