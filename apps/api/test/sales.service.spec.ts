import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../src/idempotency/idempotency.service';
import {
  MAX_SALE_LINES,
  SALE_IDEMPOTENCY_ENDPOINT,
  SalesService,
  lineSubtotal,
  saleVoidIdempotencyEndpoint,
  type CreateSaleInput,
} from '../src/sales/sales.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

type Row = Record<string, unknown>;

function product(id: string, data: Row): [string, Row] {
  return [
    id,
    {
      id,
      businessId: 'biz-a',
      unit: 'unidad',
      code: null,
      isActive: true,
      tracksStock: true,
      stockQuantity: 0,
      isCounted: false,
      ...data,
    },
  ];
}

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(
    ['sale', 'saleLine', 'product', 'inventoryMovement', 'idempotencyRecord'],
    {
      // Como la PK de Postgres: un id repetido falla con P2002 (T4).
      sale: [['id']],
      idempotencyRecord: [['businessId', 'key', 'endpoint']],
    },
  );
  const products = stores.get('product')!;
  for (const [id, row] of [
    product('p-a', {
      name: 'Aceite 20W50 Repsol 1 L',
      unit: 'litro',
      stockQuantity: 10,
      isCounted: true,
    }),
    product('p-b', { name: 'Filtro de aire', code: '21050', stockQuantity: 5, isCounted: true }),
    product('p-nc', { name: 'Filtro sin conteo' }),
    product('p-svc', { name: 'Servicio sin stock', tracksStock: false }),
    product('p-off', {
      name: 'Aceite inactivo',
      isActive: false,
      stockQuantity: 4,
      isCounted: true,
    }),
    product('p-other', {
      businessId: 'biz-b',
      name: 'De otro negocio',
      stockQuantity: 9,
      isCounted: true,
    }),
  ]) {
    products.set(id, row);
  }

  return {
    prisma,
    service: new SalesService(prisma),
    sales: stores.get('sale')!,
    saleLines: stores.get('saleLine')!,
    movements: stores.get('inventoryMovement')!,
    products,
  };
}

function sale(
  lines: CreateSaleInput['lines'],
  extra: Partial<CreateSaleInput> = {},
): CreateSaleInput {
  return { paymentMethod: 'CASH', lines, ...extra };
}

const stockOf = (products: Map<string, Row>, id: string) => Number(products.get(id)!.stockQuantity);
const movementsOf = (movements: Map<string, Row>, type: string) =>
  [...movements.values()].filter((m) => m.type === type);

describe('SalesService.create', () => {
  it('crea la venta de mostrador con sus líneas, un SALE por línea y baja el stock', async () => {
    const { service, movements, products } = setup();

    const { sale: created, warnings } = await service.create(
      'biz-a',
      'user-a',
      sale(
        [
          { productId: 'p-a', quantity: 2, unitPrice: 35 },
          { productId: 'p-b', quantity: 1, unitPrice: 18.5 },
        ],
        { paymentMethod: 'YAPE', note: 'cliente de paso' },
      ),
    );

    expect(created).toMatchObject({
      businessId: 'biz-a',
      source: 'COUNTER',
      status: 'ACTIVE',
      paymentMethod: 'YAPE',
      note: 'cliente de paso',
      createdById: 'user-a',
    });
    expect(created.total.toString()).toBe('88.5');
    expect(created.lines).toHaveLength(2);
    expect(created.lines[0]).toMatchObject({
      businessId: 'biz-a',
      saleId: created.id,
      kind: 'PRODUCT',
      productId: 'p-a',
      descriptionSnapshot: 'Aceite 20W50 Repsol 1 L',
      codeSnapshot: null,
      quantity: 2,
      unitPrice: 35,
      movesStock: true,
    });
    expect(created.lines[1]).toMatchObject({ productId: 'p-b', codeSnapshot: '21050' });
    expect(warnings).toEqual([]);

    const sales = movementsOf(movements, 'SALE');
    expect(sales).toHaveLength(2);
    for (const movement of sales) {
      expect(movement).toMatchObject({ refType: 'Sale', refId: created.id, createdById: 'user-a' });
    }
    expect(Number(sales.find((m) => m.productId === 'p-a')!.quantityDelta)).toBe(-2);
    expect(stockOf(products, 'p-a')).toBe(8);
    expect(stockOf(products, 'p-b')).toBe(4);
  });

  it('usa el id del cliente y occurredAt si vienen (DEC-12)', async () => {
    const { service } = setup();

    const { sale: created } = await service.create(
      'biz-a',
      'user-a',
      sale([{ productId: 'p-a', quantity: 1, unitPrice: 30 }], {
        id: 'sale-cliente',
        occurredAt: '2026-09-20T15:00:00.000Z',
      }),
    );

    expect(created.id).toBe('sale-cliente');
    expect(created.occurredAt.toISOString()).toBe('2026-09-20T15:00:00.000Z');
  });

  it('precio editable: guarda el precio aplicado y no toca el precio del catálogo (DEC-29)', async () => {
    const { service, products } = setup();
    products.get('p-a')!.salePrice = 40;

    const { sale: created } = await service.create(
      'biz-a',
      'user-a',
      sale([{ productId: 'p-a', quantity: 1, unitPrice: 32.5 }]),
    );

    expect(created.lines[0]!.unitPrice).toBe(32.5);
    expect(products.get('p-a')!.salePrice).toBe(40);
  });

  describe('subtotal y total', () => {
    it('redondea half-up a 2 decimales por línea', () => {
      expect(lineSubtotal(1.5, 12.33).toString()).toBe('18.5'); // 18.495
      expect(lineSubtotal(0.005, 1).toString()).toBe('0.01'); // half-up, no al par
      expect(lineSubtotal(0.333, 3).toString()).toBe('1'); // 0.999
      expect(lineSubtotal(3, 0.1).toString()).toBe('0.3'); // sin error binario
      expect(lineSubtotal(2, 0).toString()).toBe('0');
    });

    it('el total es la suma de los subtotales ya redondeados', async () => {
      const { service } = setup();

      const { sale: created } = await service.create(
        'biz-a',
        'user-a',
        sale([
          { productId: 'p-a', quantity: 1.5, unitPrice: 12.33 }, // 18.50
          { productId: 'p-b', quantity: 0.005, unitPrice: 1 }, // 0.01
        ]),
      );

      expect(created.total.toString()).toBe('18.51');
      const subtotals = created.lines.map((line) => new Prisma.Decimal(line.subtotal).toString());
      expect(subtotals).toEqual(['18.5', '0.01']);
    });
  });

  it('producto con tracksStock = false: línea con movesStock = false, sin SALE ni aviso (BR-V4)', async () => {
    const { service, movements, products } = setup();

    const { sale: created, warnings } = await service.create(
      'biz-a',
      'user-a',
      sale([
        { productId: 'p-svc', quantity: 1, unitPrice: 20 },
        { productId: 'p-a', quantity: 1, unitPrice: 30 },
      ]),
    );

    expect(created.lines.find((l) => l.productId === 'p-svc')!.movesStock).toBe(false);
    expect(movementsOf(movements, 'SALE').map((m) => m.productId)).toEqual(['p-a']);
    expect(stockOf(products, 'p-svc')).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('producto sin conteo inicial: se vende con el aviso PRODUCT_NOT_COUNTED (DEC-27)', async () => {
    const { service, movements, products } = setup();

    const { warnings } = await service.create(
      'biz-a',
      'user-a',
      sale([{ productId: 'p-nc', quantity: 2, unitPrice: 15 }]),
    );

    expect(warnings).toEqual([
      expect.objectContaining({ code: 'PRODUCT_NOT_COUNTED', productId: 'p-nc' }),
    ]);
    expect(movementsOf(movements, 'SALE')).toHaveLength(1);
    expect(stockOf(products, 'p-nc')).toBe(-2);
  });

  describe('stock insuficiente: BLOCK fijo (DEC-26)', () => {
    it('422 INSUFFICIENT_STOCK en el campo lines y no escribe venta, líneas, movimientos ni saldos', async () => {
      const { service, sales, saleLines, movements, products } = setup();

      await expect(
        service.create(
          'biz-a',
          'user-a',
          sale([
            { productId: 'p-a', quantity: 1, unitPrice: 30 },
            { productId: 'p-b', quantity: 6, unitPrice: 18 },
          ]),
        ),
      ).rejects.toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        status: 422,
        errors: [expect.objectContaining({ field: 'lines' })],
      });

      expect(sales.size).toBe(0);
      expect(saleLines.size).toBe(0);
      expect(movements.size).toBe(0);
      expect(stockOf(products, 'p-a')).toBe(10);
      expect(stockOf(products, 'p-b')).toBe(5);
    });

    it('vender exactamente el saldo está permitido: queda en 0', async () => {
      const { service, products } = setup();

      await service.create(
        'biz-a',
        'user-a',
        sale([{ productId: 'p-b', quantity: 5, unitPrice: 18 }]),
      );

      expect(stockOf(products, 'p-b')).toBe(0);
    });
  });

  describe('productos que no se pueden vender', () => {
    it.each([
      ['inexistente', 'no-existe', 'PRODUCT_NOT_FOUND', 404],
      ['de otro negocio', 'p-other', 'PRODUCT_NOT_FOUND', 404],
      ['inactivo (BR-P21)', 'p-off', 'PRODUCT_INACTIVE', 409],
    ])('producto %s: %s y no guarda nada', async (_label, productId, code, status) => {
      const { service, sales, saleLines, movements, products } = setup();

      await expect(
        service.create(
          'biz-a',
          'user-a',
          sale([
            { productId: 'p-a', quantity: 1, unitPrice: 30 },
            { productId, quantity: 1, unitPrice: 10 },
          ]),
        ),
      ).rejects.toMatchObject({
        code,
        status,
        errors: [expect.objectContaining({ field: 'lines.1.productId' })],
      });

      expect(sales.size).toBe(0);
      expect(saleLines.size).toBe(0);
      expect(movements.size).toBe(0);
      expect(stockOf(products, 'p-a')).toBe(10);
      expect(stockOf(products, 'p-other')).toBe(9);
    });
  });

  describe('validación antes de tocar la base', () => {
    it('producto repetido: 400 DUPLICATE_PRODUCT_LINE', async () => {
      const { service, sales } = setup();

      await expect(
        service.create(
          'biz-a',
          'user-a',
          sale([
            { productId: 'p-a', quantity: 1, unitPrice: 30 },
            { productId: 'p-a', quantity: 2, unitPrice: 30 },
          ]),
        ),
      ).rejects.toMatchObject({
        code: 'DUPLICATE_PRODUCT_LINE',
        status: 400,
        errors: [{ field: 'lines.1.productId', message: 'Producto repetido.' }],
      });
      expect(sales.size).toBe(0);
    });

    it.each([
      ['sin líneas', sale([]), 'lines'],
      [
        `más de ${MAX_SALE_LINES} líneas`,
        sale(
          Array.from({ length: MAX_SALE_LINES + 1 }, (_, i) => ({
            productId: `p-${i}`,
            quantity: 1,
            unitPrice: 1,
          })),
        ),
        'lines',
      ],
      ['cantidad 0', sale([{ productId: 'p-a', quantity: 0, unitPrice: 1 }]), 'lines.0.quantity'],
      [
        'cantidad con 4 decimales',
        sale([{ productId: 'p-a', quantity: 1.2345, unitPrice: 1 }]),
        'lines.0.quantity',
      ],
      [
        'precio negativo',
        sale([{ productId: 'p-a', quantity: 1, unitPrice: -1 }]),
        'lines.0.unitPrice',
      ],
      [
        'precio con 3 decimales',
        sale([{ productId: 'p-a', quantity: 1, unitPrice: 1.005 }]),
        'lines.0.unitPrice',
      ],
      [
        'cantidad mayor que Decimal(12,3)',
        sale([{ productId: 'p-a', quantity: 1_000_000_000, unitPrice: 0 }]),
        'lines.0.quantity',
      ],
      [
        'precio mayor que Decimal(10,2)',
        sale([{ productId: 'p-a', quantity: 1, unitPrice: 100_000_000 }]),
        'lines.0.unitPrice',
      ],
      [
        'subtotal mayor que Decimal(10,2) con cantidad y precio válidos',
        sale([{ productId: 'p-a', quantity: 2, unitPrice: 99_999_999.99 }]),
        'lines.0.subtotal',
      ],
      [
        'total mayor que Decimal(10,2) con subtotales válidos',
        sale([
          { productId: 'p-a', quantity: 1, unitPrice: 99_999_999.99 },
          { productId: 'p-b', quantity: 1, unitPrice: 0.01 },
        ]),
        'total',
      ],
      [
        'método de pago desconocido',
        sale([{ productId: 'p-a', quantity: 1, unitPrice: 1 }], { paymentMethod: 'CARD' as never }),
        'paymentMethod',
      ],
      [
        'nota de más de 500 caracteres',
        sale([{ productId: 'p-a', quantity: 1, unitPrice: 1 }], { note: 'x'.repeat(501) }),
        'note',
      ],
    ])('%s: 400 VALIDATION_ERROR en %s', async (_label, input, field) => {
      const { service, sales, movements } = setup();

      await expect(service.create('biz-a', 'user-a', input)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
        errors: expect.arrayContaining([expect.objectContaining({ field })]),
      });
      expect(sales.size).toBe(0);
      expect(movements.size).toBe(0);
    });

    it('total calculado mayor que el máximo: 400 con un mensaje que explica el total', async () => {
      const { service, sales, movements } = setup();

      await expect(
        service.create(
          'biz-a',
          'user-a',
          sale([
            { productId: 'p-svc', quantity: 1, unitPrice: 99_999_999.99 },
            { productId: 'p-b', quantity: 1, unitPrice: 0.01 },
          ]),
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
        errors: [
          {
            field: 'total',
            message:
              'El total de la venta (S/ 100000000.00) supera el máximo por venta (S/ 99 999 999,99).',
          },
        ],
      });
      expect(sales.size).toBe(0);
      expect(movements.size).toBe(0);
    });

    it('total exactamente en el máximo (99 999 999,99): se acepta', async () => {
      const { service } = setup();

      const { sale: created } = await service.create(
        'biz-a',
        'user-a',
        sale([
          { productId: 'p-svc', quantity: 1, unitPrice: 99_999_999.98 },
          { productId: 'p-b', quantity: 1, unitPrice: 0.01 },
        ]),
      );
      expect(String(created.total)).toBe('99999999.99');
    });

    it('acepta precio 0, 3 decimales en la cantidad y 2 en el precio', async () => {
      const { service } = setup();

      const { sale: created } = await service.create(
        'biz-a',
        'user-a',
        sale([
          { productId: 'p-a', quantity: 1.125, unitPrice: 0 },
          { productId: 'p-b', quantity: 1, unitPrice: 9.99 },
        ]),
      );

      expect(created.total.toString()).toBe('9.99');
    });
  });

  it('T4: un id de cliente repetido falla en la base con el error genérico, sin un 409 propio', async () => {
    const { service, sales } = setup();
    await service.create(
      'biz-a',
      'user-a',
      sale([{ productId: 'p-a', quantity: 1, unitPrice: 30 }], { id: 'dup' }),
    );

    const error = await service
      .create(
        'biz-a',
        'user-a',
        sale([{ productId: 'p-b', quantity: 1, unitPrice: 18 }], { id: 'dup' }),
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    expect(sales.size).toBe(1);
    // En Postgres la transacción revierte el SALE ya escrito; el fake no tiene
    // rollback, así que eso lo cubre la prueba de integración.
  });

  describe('idempotencia con el patrón de la capa HTTP (IdempotencyService)', () => {
    function run(
      idempotency: IdempotencyService,
      service: SalesService,
      key: string,
      input: CreateSaleInput,
    ) {
      return idempotency.run({
        businessId: 'biz-a',
        key,
        endpoint: SALE_IDEMPOTENCY_ENDPOINT,
        requestHash: idempotency.hashRequest(input),
        handler: async () => ({
          status: 201,
          body: await service.create('biz-a', 'user-a', input),
        }),
      });
    }

    it('la misma clave y el mismo cuerpo devuelven la venta original sin crear otra', async () => {
      const { prisma, service, sales, movements } = setup();
      const idempotency = new IdempotencyService(prisma);
      const input = sale([{ productId: 'p-a', quantity: 1, unitPrice: 30 }]);

      const first = await run(idempotency, service, 'k1', input);
      const second = await run(idempotency, service, 'k1', input);

      expect(second.replayed).toBe(true);
      expect(second.body.sale.id).toBe(first.body.sale.id);
      expect(sales.size).toBe(1);
      expect(movementsOf(movements, 'SALE')).toHaveLength(1);
    });

    it('la misma clave con otro cuerpo: 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const { prisma, service, sales } = setup();
      const idempotency = new IdempotencyService(prisma);
      await run(
        idempotency,
        service,
        'k1',
        sale([{ productId: 'p-a', quantity: 1, unitPrice: 30 }]),
      );

      await expect(
        run(idempotency, service, 'k1', sale([{ productId: 'p-a', quantity: 2, unitPrice: 30 }])),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(sales.size).toBe(1);
    });

    it('la anulación registra la clave por venta: sales/:id/void', () => {
      expect(saleVoidIdempotencyEndpoint('abc')).toBe('sales/abc/void');
    });
  });
});

describe('SalesService.get', () => {
  it('devuelve la venta con sus líneas ordenadas por productId (T5), igual que el POST', async () => {
    const { service } = setup();
    const { sale: created } = await service.create(
      'biz-a',
      'user-a',
      sale([
        { productId: 'p-svc', quantity: 1, unitPrice: 20 },
        { productId: 'p-b', quantity: 1, unitPrice: 18 },
        { productId: 'p-a', quantity: 1, unitPrice: 30 },
      ]),
    );

    const detail = await service.get('biz-a', created.id);

    const order = ['p-a', 'p-b', 'p-svc'];
    expect(detail.lines.map((l) => l.productId)).toEqual(order);
    expect(created.lines.map((l) => l.productId)).toEqual(order);
    expect(detail).toMatchObject({ id: created.id, status: 'ACTIVE' });
  });

  it('inexistente o de otro negocio: 404 SALE_NOT_FOUND', async () => {
    const { service } = setup();
    const { sale: created } = await service.create(
      'biz-a',
      'user-a',
      sale([{ productId: 'p-a', quantity: 1, unitPrice: 30 }]),
    );

    await expect(service.get('biz-a', 'no-existe')).rejects.toMatchObject({
      code: 'SALE_NOT_FOUND',
      status: 404,
    });
    await expect(service.get('biz-b', created.id)).rejects.toMatchObject({
      code: 'SALE_NOT_FOUND',
    });
  });
});

describe('SalesService.list', () => {
  async function seed() {
    const ctx = setup();
    const at = (iso: string, id: string, extra: Partial<CreateSaleInput> = {}) =>
      ctx.service.create(
        'biz-a',
        'user-a',
        sale([{ productId: 'p-svc', quantity: 1, unitPrice: 10 }], {
          id,
          occurredAt: iso,
          ...extra,
        }),
      );
    await at('2026-09-20T10:00:00.000Z', 's-1');
    await at('2026-09-21T10:00:00.000Z', 's-2', { paymentMethod: 'YAPE' });
    await at('2026-09-21T10:00:00.000Z', 's-3');
    await at('2026-09-22T10:00:00.000Z', 's-4');
    return ctx;
  }

  it('más recientes primero; con la misma fecha desempata por id; incluye lineCount', async () => {
    const { service } = await seed();

    const page = await service.list('biz-a', {});

    expect(page.items.map((s) => s.id)).toEqual(['s-4', 's-3', 's-2', 's-1']);
    expect(page.items.every((s) => s.lineCount === 1)).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  it('pagina con cursor sin repetir ni saltar', async () => {
    const { service } = await seed();

    const first = await service.list('biz-a', { limit: 2 });
    const second = await service.list('biz-a', { limit: 2, cursor: first.nextCursor! });

    expect(first.items.map((s) => s.id)).toEqual(['s-4', 's-3']);
    expect(second.items.map((s) => s.id)).toEqual(['s-2', 's-1']);
    expect(second.nextCursor).toBeNull();
  });

  it('from incluido y to excluido, comparados contra occurredAt', async () => {
    const { service } = await seed();

    const page = await service.list('biz-a', {
      from: '2026-09-21T10:00:00.000Z',
      to: '2026-09-22T10:00:00.000Z',
    });

    expect(page.items.map((s) => s.id)).toEqual(['s-3', 's-2']);
  });

  it('filtra por método de pago y por estado', async () => {
    const { service } = await seed();
    await service.void('biz-a', 'user-a', 's-1', { reason: 'error de registro' });

    expect((await service.list('biz-a', { paymentMethod: 'YAPE' })).items.map((s) => s.id)).toEqual(
      ['s-2'],
    );
    expect((await service.list('biz-a', { status: 'VOIDED' })).items.map((s) => s.id)).toEqual([
      's-1',
    ]);
    expect((await service.list('biz-a', { status: 'ACTIVE' })).items).toHaveLength(3);
    expect((await service.list('biz-a', { source: 'WASH' })).items).toHaveLength(0);
  });

  it('solo ve las ventas del negocio autenticado', async () => {
    const { service } = await seed();

    const page = await service.list('biz-b', {});

    expect(page).toEqual({ items: [], nextCursor: null });
  });
});

describe('SalesService.void', () => {
  async function withSale(lines: CreateSaleInput['lines']) {
    const ctx = setup();
    const { sale: created } = await ctx.service.create('biz-a', 'user-a', sale(lines));
    return { ...ctx, created };
  }

  it('anula: VOIDED con fecha, usuario y motivo; SALE_VOID por línea con stock; el stock vuelve', async () => {
    const { service, created, movements, products, saleLines } = await withSale([
      { productId: 'p-a', quantity: 2, unitPrice: 35 },
      { productId: 'p-svc', quantity: 1, unitPrice: 20 },
    ]);

    const voided = await service.void('biz-a', 'user-b', created.id, {
      reason: '  cliente devolvió  ',
    });

    expect(voided).toMatchObject({
      status: 'VOIDED',
      voidedById: 'user-b',
      voidReason: 'cliente devolvió',
    });
    expect(voided.voidedAt).toBeInstanceOf(Date);
    expect(voided.lines).toHaveLength(2);

    const voids = movementsOf(movements, 'SALE_VOID');
    expect(voids).toHaveLength(1);
    expect(voids[0]).toMatchObject({
      productId: 'p-a',
      refType: 'Sale',
      refId: created.id,
      createdById: 'user-b',
    });
    expect(Number(voids[0]!.quantityDelta)).toBe(2);
    expect(stockOf(products, 'p-a')).toBe(10);

    // Nada se borra ni se edita (BR-G5): el SALE original y las líneas siguen.
    expect(movementsOf(movements, 'SALE')).toHaveLength(1);
    expect(saleLines.size).toBe(2);
  });

  it('una venta sin líneas que muevan stock se anula sin generar movimientos', async () => {
    const { service, created, movements } = await withSale([
      { productId: 'p-svc', quantity: 1, unitPrice: 20 },
    ]);

    const voided = await service.void('biz-a', 'user-a', created.id, { reason: 'error' });

    expect(voided.status).toBe('VOIDED');
    expect(movements.size).toBe(0);
  });

  it('se anula aunque el producto se haya desactivado después de la venta (BR-P21)', async () => {
    const { service, created, movements, products } = await withSale([
      { productId: 'p-a', quantity: 3, unitPrice: 35 },
    ]);
    products.get('p-a')!.isActive = false;

    await service.void('biz-a', 'user-a', created.id, { reason: 'error' });

    expect(movementsOf(movements, 'SALE_VOID')).toHaveLength(1);
    expect(stockOf(products, 'p-a')).toBe(10);
  });

  it('una venta ya anulada: 409 SALE_ALREADY_VOIDED sin otro SALE_VOID', async () => {
    const { service, created, movements, sales } = await withSale([
      { productId: 'p-a', quantity: 1, unitPrice: 35 },
    ]);
    await service.void('biz-a', 'user-a', created.id, { reason: 'primera' });

    await expect(
      service.void('biz-a', 'user-a', created.id, { reason: 'segunda' }),
    ).rejects.toMatchObject({
      code: 'SALE_ALREADY_VOIDED',
      status: 409,
    });
    expect(movementsOf(movements, 'SALE_VOID')).toHaveLength(1);
    expect(sales.get(created.id)!.voidReason).toBe('primera');
  });

  it('T3: dos anulaciones simultáneas: una anula, la otra recibe 409 y el stock vuelve una sola vez', async () => {
    const { service, created, movements, products } = await withSale([
      { productId: 'p-a', quantity: 2, unitPrice: 35 },
    ]);

    const results = await Promise.allSettled([
      service.void('biz-a', 'user-a', created.id, { reason: 'A' }),
      service.void('biz-a', 'user-a', created.id, { reason: 'B' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'SALE_ALREADY_VOIDED' });
    expect(movementsOf(movements, 'SALE_VOID')).toHaveLength(1);
    expect(stockOf(products, 'p-a')).toBe(10);
  });

  it('R6 (DEC-70): una venta MAINTENANCE no se anula por aquí: 409 SALE_MANAGED_BY_MAINTENANCE y no cambia nada', async () => {
    const { service, created, sales, movements } = await withSale([
      { productId: 'p-a', quantity: 1, unitPrice: 35 },
    ]);
    // El cobro de un mantenimiento lo crea R6; aquí solo importa su `source`.
    Object.assign(sales.get(created.id)!, { source: 'MAINTENANCE', maintenanceId: 'm-1' });

    await expect(
      service.void('biz-a', 'user-a', created.id, { reason: 'desde ventas' }),
    ).rejects.toMatchObject({ code: 'SALE_MANAGED_BY_MAINTENANCE', status: 409 });
    expect(sales.get(created.id)!.status).toBe('ACTIVE');
    expect(sales.get(created.id)!.voidReason ?? null).toBeNull();
    expect(movementsOf(movements, 'SALE_VOID')).toHaveLength(0);
  });

  it('inexistente o de otro negocio: 404 SALE_NOT_FOUND y no cambia nada', async () => {
    const { service, created, sales } = await withSale([
      { productId: 'p-a', quantity: 1, unitPrice: 35 },
    ]);

    await expect(
      service.void('biz-a', 'user-a', 'no-existe', { reason: 'x' }),
    ).rejects.toMatchObject({
      code: 'SALE_NOT_FOUND',
      status: 404,
    });
    await expect(
      service.void('biz-b', 'user-a', created.id, { reason: 'x' }),
    ).rejects.toMatchObject({
      code: 'SALE_NOT_FOUND',
    });
    expect(sales.get(created.id)!.status).toBe('ACTIVE');
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['de más de 500 caracteres', 'x'.repeat(501)],
  ])('motivo %s: 400 VALIDATION_ERROR en reason', async (_label, reason) => {
    const { service, created, sales } = await withSale([
      { productId: 'p-a', quantity: 1, unitPrice: 35 },
    ]);

    await expect(service.void('biz-a', 'user-a', created.id, { reason })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [expect.objectContaining({ field: 'reason' })],
    });
    expect(sales.get(created.id)!.status).toBe('ACTIVE');
  });
});
