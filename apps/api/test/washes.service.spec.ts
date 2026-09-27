import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../src/idempotency/idempotency.service';
import { SalesService } from '../src/sales/sales.service';
import {
  WASH_IDEMPOTENCY_ENDPOINT,
  WashesService,
  type CreateWashInput,
} from '../src/washes/washes.service';
import { buildFakeScopedPrisma } from './support/fake-scoped-prisma';

type Row = Record<string, unknown>;

function row(id: string, data: Row): [string, Row] {
  return [id, { id, businessId: 'biz-a', isActive: true, sortOrder: 0, ...data }];
}

function setup() {
  const { prisma, stores } = buildFakeScopedPrisma(
    [
      'sale',
      'saleLine',
      'washType',
      'washPriceOption',
      'product',
      'inventoryMovement',
      'idempotencyRecord',
    ],
    {
      // Como la PK de Postgres: un id repetido falla con P2002 (T4).
      sale: [['id']],
      idempotencyRecord: [['businessId', 'key', 'endpoint']],
    },
  );
  const types = stores.get('washType')!;
  for (const [id, data] of [
    row('t-auto', { name: 'Lavado Auto' }),
    row('t-moto', { name: 'Moto lineal' }),
    row('t-off', { name: 'Camión', isActive: false }),
    row('t-other', { businessId: 'biz-b', name: 'Ajeno' }),
  ]) {
    types.set(id, data);
  }
  const prices = stores.get('washPriceOption')!;
  for (const [id, data] of [
    row('p-auto', { washTypeId: 't-auto', amount: new Prisma.Decimal('25.50'), label: null }),
    row('p-auto-off', {
      washTypeId: 't-auto',
      amount: new Prisma.Decimal('30'),
      label: 'Grande',
      isActive: false,
    }),
    row('p-moto', { washTypeId: 't-moto', amount: new Prisma.Decimal('10') }),
    row('p-off-type', { washTypeId: 't-off', amount: new Prisma.Decimal('40') }),
    row('p-other', {
      businessId: 'biz-b',
      washTypeId: 't-other',
      amount: new Prisma.Decimal('99'),
    }),
  ]) {
    prices.set(id, data);
  }
  const products = stores.get('product')!;
  products.set('prod-1', {
    id: 'prod-1',
    businessId: 'biz-a',
    name: 'Aceite',
    unit: 'litro',
    isActive: true,
    tracksStock: true,
    stockQuantity: 10,
    isCounted: true,
  });

  return {
    prisma,
    service: new WashesService(prisma),
    salesService: new SalesService(prisma),
    types,
    sales: stores.get('sale')!,
    saleLines: stores.get('saleLine')!,
    movements: stores.get('inventoryMovement')!,
    products,
  };
}

function wash(extra: Partial<CreateWashInput> = {}): CreateWashInput {
  return { washTypeId: 't-auto', priceOptionId: 'p-auto', paymentMethod: 'CASH', ...extra };
}

describe('WashesService.create (R5, POST /washes)', () => {
  it('crea una Sale WASH con una sola línea WASH, sin producto ni stock', async () => {
    const { service, sales, saleLines } = setup();

    const created = await service.create('biz-a', 'user-a', wash({ paymentMethod: 'YAPE' }));

    expect(created).toMatchObject({
      businessId: 'biz-a',
      source: 'WASH',
      status: 'ACTIVE',
      paymentMethod: 'YAPE',
      createdById: 'user-a',
      note: null,
    });
    expect(created.lines).toHaveLength(1);
    expect(created.lines[0]).toMatchObject({
      kind: 'WASH',
      productId: null,
      washTypeId: 't-auto',
      codeSnapshot: null,
      quantity: 1,
      movesStock: false,
      saleId: created.id,
      businessId: 'biz-a',
    });
    expect(sales.size).toBe(1);
    expect(saleLines.size).toBe(1);
  });

  it('snapshot = exactamente el name del tipo, y se conserva si el tipo se renombra (DEC-67)', async () => {
    const { types, service, saleLines } = setup();

    const created = await service.create('biz-a', 'user-a', wash());
    expect(created.lines[0]!.descriptionSnapshot).toBe('Lavado Auto');

    types.get('t-auto')!.name = 'Otro nombre';
    expect([...saleLines.values()][0]!.descriptionSnapshot).toBe('Lavado Auto');
  });

  it('monto de la opción: unitPrice = subtotal = total = amount (DEC-55)', async () => {
    const { service } = setup();

    const created = await service.create('biz-a', 'user-a', wash());

    expect(created.total.toString()).toBe('25.5');
    expect(created.lines[0]!.unitPrice.toString()).toBe('25.5');
    expect(created.lines[0]!.subtotal.toString()).toBe('25.5');
  });

  it('occurredAt enviado se respeta; sin él, la hora del servidor (DEC-58)', async () => {
    const { service } = setup();

    const dated = await service.create(
      'biz-a',
      'user-a',
      wash({ occurredAt: '2026-09-20T15:30:00.000Z' }),
    );
    expect(dated.occurredAt.toISOString()).toBe('2026-09-20T15:30:00.000Z');

    const before = Date.now();
    const now = await service.create('biz-a', 'user-a', wash());
    expect(now.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('guarda la nota (DEC-57)', async () => {
    const { service } = setup();

    const created = await service.create('biz-a', 'user-a', wash({ note: 'pagó con sencillo' }));

    expect(created.note).toBe('pagó con sencillo');
  });

  it('respeta el id enviado; repetido falla sin escribir otra venta (T4)', async () => {
    const { service, sales, saleLines } = setup();
    const id = '7c1d1b2e-4b8e-4f2a-9a3d-6f0e5b1c2d3e';

    const created = await service.create('biz-a', 'user-a', wash({ id }));
    expect(created.id).toBe(id);

    await expect(service.create('biz-a', 'user-a', wash({ id }))).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(sales.size).toBe(1);
    expect(saleLines.size).toBe(1);
  });

  describe('errores (DEC-55, DEC-65), sin escribir nada', () => {
    it.each([
      ['tipo inexistente', { washTypeId: 'nope' }, 'WASH_TYPE_NOT_FOUND', 404],
      [
        'tipo de otro negocio',
        { washTypeId: 't-other', priceOptionId: 'p-other' },
        'WASH_TYPE_NOT_FOUND',
        404,
      ],
      ['precio inexistente', { priceOptionId: 'nope' }, 'WASH_PRICE_NOT_FOUND', 404],
      ['precio de otro negocio', { priceOptionId: 'p-other' }, 'WASH_PRICE_NOT_FOUND', 404],
      ['precio de otro tipo', { priceOptionId: 'p-moto' }, 'WASH_PRICE_NOT_IN_TYPE', 409],
      [
        'tipo inactivo',
        { washTypeId: 't-off', priceOptionId: 'p-off-type' },
        'WASH_TYPE_INACTIVE',
        409,
      ],
      ['precio inactivo', { priceOptionId: 'p-auto-off' }, 'WASH_PRICE_INACTIVE', 409],
    ] as const)('%s → %s', async (_, extra, code, status) => {
      const { service, sales, saleLines } = setup();

      await expect(service.create('biz-a', 'user-a', wash(extra))).rejects.toMatchObject({
        code,
        status,
      });
      expect(sales.size).toBe(0);
      expect(saleLines.size).toBe(0);
    });
  });

  it('no genera movimientos de inventario ni cambia la caché de ningún producto (DEC-54)', async () => {
    const { service, movements, products } = setup();

    await service.create('biz-a', 'user-a', wash());

    expect(movements.size).toBe(0);
    expect(products.get('prod-1')).toMatchObject({ stockQuantity: 10, isCounted: true });
  });

  it('se anula por SalesService.void sin SALE_VOID (DEC-59) y aparece en el historial WASH', async () => {
    const { service, salesService, movements } = setup();
    const created = await service.create('biz-a', 'user-a', wash());

    const voided = await salesService.void('biz-a', 'user-a', created.id, { reason: 'error' });

    expect(voided).toMatchObject({ status: 'VOIDED', voidReason: 'error' });
    expect(movements.size).toBe(0);
    const page = await salesService.list('biz-a', { source: 'WASH' });
    expect(page.items.map((s) => s.id)).toEqual([created.id]);
    expect(page.items[0]).toMatchObject({ lineCount: 1 });
    expect((await salesService.list('biz-a', { source: 'COUNTER' })).items).toEqual([]);
    expect((await salesService.list('biz-b', { source: 'WASH' })).items).toEqual([]);
  });

  describe('idempotencia (endpoint "washes")', () => {
    function run(
      idempotency: IdempotencyService,
      service: WashesService,
      key: string,
      input: CreateWashInput,
    ) {
      return idempotency.run({
        businessId: 'biz-a',
        key,
        endpoint: WASH_IDEMPOTENCY_ENDPOINT,
        requestHash: idempotency.hashRequest(input),
        handler: async () => ({
          status: 201,
          body: { id: (await service.create('biz-a', 'user-a', input)).id },
        }),
      });
    }

    it('misma clave y mismo cuerpo: misma respuesta y un solo lavado', async () => {
      const { prisma, service, sales } = setup();
      const idempotency = new IdempotencyService(prisma);

      const first = await run(idempotency, service, 'k1', wash());
      const second = await run(idempotency, service, 'k1', wash());

      expect(second).toMatchObject({ replayed: true, body: first.body });
      expect(sales.size).toBe(1);
    });

    it('misma clave con otro cuerpo: 409 IDEMPOTENCY_KEY_REUSED sin otro lavado', async () => {
      const { prisma, service, sales } = setup();
      const idempotency = new IdempotencyService(prisma);
      await run(idempotency, service, 'k1', wash());

      await expect(
        run(idempotency, service, 'k1', wash({ paymentMethod: 'YAPE' })),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(sales.size).toBe(1);
    });

    it('un error de negocio libera la clave: el reintento corregido crea el lavado', async () => {
      const { prisma, service, sales } = setup();
      const idempotency = new IdempotencyService(prisma);
      const bad = wash({ priceOptionId: 'p-auto-off' });

      await expect(run(idempotency, service, 'k1', bad)).rejects.toMatchObject({
        code: 'WASH_PRICE_INACTIVE',
      });
      await expect(run(idempotency, service, 'k2', wash())).resolves.toMatchObject({
        replayed: false,
      });
      expect(sales.size).toBe(1);
    });
  });
});
