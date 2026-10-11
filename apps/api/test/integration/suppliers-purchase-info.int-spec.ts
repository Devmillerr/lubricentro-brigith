import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.validation';
import { ProblemException } from '../../src/common/exceptions/problem.exception';
import { InventoryService, type ReceiptBatchInput } from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SuppliersService } from '../../src/suppliers/suppliers.service';

/**
 * Proveedores, comprobante y datos de compra (R8, DEC-95, BR-K1/K4/K5) contra
 * Postgres real: unicidad del comprobante (también en paralelo, por el índice
 * parcial), datos completados sin tocar el stock, restricciones SQL, FK
 * compuestas entre negocios y RLS.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan Postgres.',
  );
}
if (!/\/[^/?]*_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test".');
}

const prisma = new PrismaService({
  get: () => url,
} as unknown as ConfigService<Env, true>);
const inventory = new InventoryService(prisma);
const suppliers = new SuppliersService(prisma);

interface Tenant {
  businessId: string;
  userId: string;
}

async function createTenant(): Promise<Tenant> {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: `R8P ${suffix}`, slug: `r8p-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { businessId: business.id, name: 'R8P', username: `r8p-${suffix}`, passwordHash: 'x' },
  });
  return { businessId: business.id, userId: user.id };
}

async function createProduct(tenant: Tenant): Promise<string> {
  const product = await prisma.product.create({
    data: { businessId: tenant.businessId, name: `Aceite ${randomUUID()}`, unit: 'litro' },
  });
  return product.id;
}

const NOW = new Date('2026-10-10T15:00:00.000Z');

function receive(tenant: Tenant, input: ReceiptBatchInput) {
  return inventory.createReceiptBatch(tenant.businessId, tenant.userId, input, NOW);
}

async function rejection(promise: Promise<unknown>): Promise<ProblemException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('Se esperaba un rechazo');
}

/** Movimientos y saldos del negocio: lo que completar datos de compra no debe tocar. */
async function stockFingerprint(tenant: Tenant) {
  const [movements, products] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { id: 'asc' },
    }),
    prisma.product.findMany({
      where: { businessId: tenant.businessId },
      select: { id: true, stockQuantity: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return JSON.stringify({ movements, products });
}

async function sqlError(sql: string): Promise<string> {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    const text = String((error as Error).message);
    const code = /\b(23503|23514|23505)\b/.exec(text)?.[1];
    return code ?? text;
  }
  return 'ok';
}

describe('Proveedores (R8, DEC-95)', () => {
  it('crea, lista activos por nombre, normaliza el RUC y no lo repite en el negocio', async () => {
    const tenant = await createTenant();
    const b = await suppliers.create(tenant.businessId, tenant.userId, {
      name: 'Distribuidora B',
      taxId: '20 1234 5678 9',
    });
    await suppliers.create(tenant.businessId, tenant.userId, { name: 'Aceites A' });
    expect(b.taxId).toBe('20123456789');

    const error = await rejection(
      suppliers.create(tenant.businessId, tenant.userId, { name: 'Otro', taxId: '20123456789' }),
    );
    expect(error.code).toBe('SUPPLIER_TAX_ID_TAKEN');

    await suppliers.update(tenant.businessId, b.id, { isActive: false });
    expect((await suppliers.list(tenant.businessId)).map((s) => s.name)).toEqual(['Aceites A']);
    expect((await suppliers.list(tenant.businessId, true)).map((s) => s.name)).toEqual([
      'Aceites A',
      'Distribuidora B',
    ]);
  });

  it('aislamiento: otro negocio no ve ni edita el proveedor, y puede usar el mismo RUC', async () => {
    const a = await createTenant();
    const b = await createTenant();
    const supplier = await suppliers.create(a.businessId, a.userId, {
      name: 'Proveedor A',
      taxId: '20999999999',
    });
    expect((await rejection(suppliers.findOne(b.businessId, supplier.id))).code).toBe(
      'SUPPLIER_NOT_FOUND',
    );
    expect((await rejection(suppliers.update(b.businessId, supplier.id, { name: 'X' }))).code).toBe(
      'SUPPLIER_NOT_FOUND',
    );
    expect(await suppliers.list(b.businessId)).toEqual([]);
    await suppliers.create(b.businessId, b.userId, { name: 'Proveedor B', taxId: '20999999999' });
  });
});

describe('Recepción con proveedor, comprobante y fecha de compra (R8)', () => {
  it('guarda proveedor, comprobante normalizado y fecha de compra del comprobante', async () => {
    const tenant = await createTenant();
    const supplier = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P' });
    const productId = await createProduct(tenant);
    const { receipt } = await receive(tenant, {
      occurredAt: '2026-09-15T15:00:00.000Z',
      supplierId: supplier.id,
      documentRef: ' f001 - 123 ',
      purchaseDate: '2026-09-14',
      lines: [{ productId, quantity: 4 }],
    });
    expect(receipt).toMatchObject({
      supplierId: supplier.id,
      supplier: { id: supplier.id, name: 'P', taxId: null },
      documentRef: 'F001-123',
      purchaseDate: '2026-09-14',
      purchaseDateSource: 'DOCUMENT',
      purchaseInfoRecordedAt: null,
    });
    const [row] = await prisma.$queryRaw<{ d: string }[]>`
      SELECT "purchaseDate"::text AS d FROM "inventory_receipts" WHERE "id" = ${receipt.id}`;
    expect(row!.d).toBe('2026-09-14');
  });

  it('sin fecha escrita no la fija (vale la de recepción); con fecha futura: 400', async () => {
    const tenant = await createTenant();
    const supplier = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P' });
    const productId = await createProduct(tenant);
    const { receipt } = await receive(tenant, {
      supplierId: supplier.id,
      lines: [{ productId, quantity: 1 }],
    });
    expect(receipt.purchaseDate).toBeNull();
    const error = await rejection(
      receive(tenant, {
        supplierId: supplier.id,
        purchaseDate: '2026-10-11',
        lines: [{ productId, quantity: 2 }],
      }),
    );
    expect(error.errors).toEqual([
      { field: 'purchaseDate', message: 'La fecha de compra no puede ser futura.' },
    ]);
  });

  it('comprobante sin proveedor: 400; proveedor de otro negocio: 404; desactivado: 409', async () => {
    const a = await createTenant();
    const b = await createTenant();
    const productId = await createProduct(a);
    const foreign = await suppliers.create(b.businessId, b.userId, { name: 'Ajeno' });
    const inactive = await suppliers.create(a.businessId, a.userId, { name: 'Viejo' });
    await suppliers.update(a.businessId, inactive.id, { isActive: false });

    expect(
      (await rejection(receive(a, { documentRef: 'F1', lines: [{ productId, quantity: 1 }] })))
        .errors,
    ).toEqual([{ field: 'documentRef', message: 'Elige el proveedor del comprobante.' }]);
    expect(
      (await rejection(receive(a, { supplierId: foreign.id, lines: [{ productId, quantity: 1 }] })))
        .code,
    ).toBe('SUPPLIER_NOT_FOUND');
    expect(
      (
        await rejection(
          receive(a, { supplierId: inactive.id, lines: [{ productId, quantity: 1 }] }),
        )
      ).code,
    ).toBe('SUPPLIER_INACTIVE');
    expect(await prisma.inventoryReceipt.count({ where: { businessId: a.businessId } })).toBe(0);
  });

  it('comprobante repetido del mismo proveedor: 409 sin escribir; de otro proveedor sí se acepta', async () => {
    const tenant = await createTenant();
    const p1 = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P1' });
    const p2 = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P2' });
    const productId = await createProduct(tenant);
    const first = await receive(tenant, {
      supplierId: p1.id,
      documentRef: 'F001-9',
      lines: [{ productId, quantity: 1 }],
    });
    const before = await stockFingerprint(tenant);

    const error = await rejection(
      receive(tenant, {
        supplierId: p1.id,
        documentRef: 'f001-9',
        lines: [{ productId, quantity: 7 }],
      }),
    );
    expect(error.code).toBe('DUPLICATE_DOCUMENT');
    expect(error.data).toMatchObject({ receiptId: first.receipt.id });
    expect(await stockFingerprint(tenant)).toBe(before);

    await receive(tenant, {
      supplierId: p2.id,
      documentRef: 'F001-9',
      lines: [{ productId, quantity: 1 }],
    });
  });

  it('comprobante de una recepción anulada queda libre (índice parcial)', async () => {
    const tenant = await createTenant();
    const supplier = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P' });
    const productId = await createProduct(tenant);
    const first = await receive(tenant, {
      supplierId: supplier.id,
      documentRef: 'B1',
      lines: [{ productId, quantity: 1 }],
    });
    // Simula la anulación (F3) solo en la cabecera: el índice ya no la cuenta.
    await prisma.inventoryReceipt.update({
      where: { id: first.receipt.id },
      data: { voidedAt: NOW, voidedById: tenant.userId, voidReason: 'prueba' },
    });
    await receive(tenant, {
      supplierId: supplier.id,
      documentRef: 'B1',
      lines: [{ productId, quantity: 2 }],
    });
  });

  it('concurrencia: el mismo comprobante a la vez con productos distintos → uno se guarda', async () => {
    const tenant = await createTenant();
    const supplier = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P' });
    const a = await createProduct(tenant);
    const b = await createProduct(tenant);
    const results = await Promise.allSettled([
      receive(tenant, {
        supplierId: supplier.id,
        documentRef: 'C1',
        lines: [{ productId: a, quantity: 1 }],
      }),
      receive(tenant, {
        supplierId: supplier.id,
        documentRef: 'C1',
        lines: [{ productId: b, quantity: 1 }],
      }),
    ]);
    const failed = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0]!.reason as ProblemException).code).toBe('DUPLICATE_DOCUMENT');
    expect(await prisma.inventoryReceipt.count({ where: { businessId: tenant.businessId } })).toBe(
      1,
    );
    expect(await prisma.inventoryMovement.count({ where: { businessId: tenant.businessId } })).toBe(
      1,
    );
  });

  it('posible duplicado sin comprobante: distingue proveedor', async () => {
    const tenant = await createTenant();
    const p1 = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P1' });
    const p2 = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P2' });
    const productId = await createProduct(tenant);
    const lines = [{ productId, quantity: 3 }];
    await receive(tenant, { supplierId: p1.id, lines });
    await receive(tenant, { supplierId: p2.id, lines });
    await receive(tenant, { lines });
    expect((await rejection(receive(tenant, { supplierId: p1.id, lines }))).code).toBe(
      'POSSIBLE_DUPLICATE_RECEIPT',
    );
  });
});

describe('Datos de compra en una recepción ya registrada (R8, BR-K5)', () => {
  it('de vacío a valor, con auditoría y sin tocar movimientos ni saldos', async () => {
    const tenant = await createTenant();
    const supplier = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P' });
    const productId = await createProduct(tenant);
    const { receipt } = await receive(tenant, { lines: [{ productId, quantity: 5 }] });
    const before = await stockFingerprint(tenant);

    const updated = await inventory.setPurchaseInfo(
      tenant.businessId,
      tenant.userId,
      receipt.id,
      { supplierId: supplier.id, documentRef: 'f-77', purchaseDate: '2026-09-30' },
      NOW,
    );
    expect(updated).toMatchObject({
      supplierId: supplier.id,
      documentRef: 'F-77',
      purchaseDate: '2026-09-30',
      purchaseDateSource: 'DOCUMENT',
      purchaseInfoRecordedById: tenant.userId,
    });
    expect(updated.purchaseInfoRecordedAt?.toISOString()).toBe(NOW.toISOString());
    expect(await stockFingerprint(tenant)).toBe(before);

    // Repetir lo mismo no cambia nada; un valor distinto: 409 por campo.
    const same = await inventory.setPurchaseInfo(
      tenant.businessId,
      tenant.userId,
      receipt.id,
      { supplierId: supplier.id, documentRef: 'F-77' },
      NOW,
    );
    expect(same.documentRef).toBe('F-77');
    const other = await suppliers.create(tenant.businessId, tenant.userId, { name: 'Q' });
    const error = await rejection(
      inventory.setPurchaseInfo(
        tenant.businessId,
        tenant.userId,
        receipt.id,
        { supplierId: other.id, documentRef: 'X', purchaseDate: '2026-09-01' },
        NOW,
      ),
    );
    expect(error.code).toBe('PURCHASE_INFO_ALREADY_SET');
    expect(error.errors!.map((e) => e.field)).toEqual([
      'supplierId',
      'documentRef',
      'purchaseDate',
    ]);
    expect(await stockFingerprint(tenant)).toBe(before);
  });

  it('valida: sin datos 400, inexistente u otro negocio 404, anulada 409, comprobante repetido 409', async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const supplier = await suppliers.create(tenant.businessId, tenant.userId, { name: 'P' });
    const productId = await createProduct(tenant);
    const one = await receive(tenant, {
      supplierId: supplier.id,
      documentRef: 'D1',
      lines: [{ productId, quantity: 1 }],
    });
    const two = await receive(tenant, { lines: [{ productId, quantity: 2 }] });

    expect(
      (
        await rejection(
          inventory.setPurchaseInfo(tenant.businessId, tenant.userId, two.receipt.id, {}),
        )
      ).code,
    ).toBe('VALIDATION_ERROR');
    expect(
      (
        await rejection(
          inventory.setPurchaseInfo(otherTenant.businessId, otherTenant.userId, two.receipt.id, {
            documentRef: 'Z',
          }),
        )
      ).code,
    ).toBe('RECEIPT_NOT_FOUND');
    expect(
      (
        await rejection(
          inventory.setPurchaseInfo(tenant.businessId, tenant.userId, two.receipt.id, {
            supplierId: supplier.id,
            documentRef: 'd1',
          }),
        )
      ).code,
    ).toBe('DUPLICATE_DOCUMENT');
    expect(
      (
        await rejection(
          inventory.setPurchaseInfo(tenant.businessId, tenant.userId, two.receipt.id, {
            documentRef: 'D2',
          }),
        )
      ).errors,
    ).toEqual([{ field: 'documentRef', message: 'Elige el proveedor del comprobante.' }]);

    await prisma.inventoryReceipt.update({
      where: { id: one.receipt.id },
      data: { voidedAt: NOW, voidedById: tenant.userId, voidReason: 'prueba' },
    });
    expect(
      (
        await rejection(
          inventory.setPurchaseInfo(tenant.businessId, tenant.userId, one.receipt.id, {
            purchaseDate: '2026-09-01',
          }),
        )
      ).code,
    ).toBe('RECEIPT_VOIDED');
  });
});

describe('Restricciones SQL e integridad entre negocios (R8, DEC-101)', () => {
  it('FK compuesta: una recepción no puede apuntar al proveedor de otro negocio (23503)', async () => {
    const a = await createTenant();
    const b = await createTenant();
    const supplierB = await suppliers.create(b.businessId, b.userId, { name: 'B' });
    const productId = await createProduct(a);
    const { receipt } = await receive(a, { lines: [{ productId, quantity: 1 }] });
    expect(
      await sqlError(
        `UPDATE "inventory_receipts" SET "supplierId" = '${supplierB.id}' WHERE "id" = '${receipt.id}'`,
      ),
    ).toBe('23503');
    // Ni se puede borrar un proveedor con recepciones.
    const supplierA = await suppliers.create(a.businessId, a.userId, { name: 'A' });
    await receive(a, { supplierId: supplierA.id, lines: [{ productId, quantity: 9 }] });
    expect(await sqlError(`DELETE FROM "suppliers" WHERE "id" = '${supplierA.id}'`)).toBe('23503');
  });

  it('CHECK: comprobante sin proveedor, fecha sin origen y anulación incompleta (23514)', async () => {
    const tenant = await createTenant();
    const productId = await createProduct(tenant);
    const { receipt } = await receive(tenant, { lines: [{ productId, quantity: 1 }] });
    const id = receipt.id;
    expect(
      await sqlError(`UPDATE "inventory_receipts" SET "documentRef" = 'X' WHERE "id" = '${id}'`),
    ).toBe('23514');
    expect(
      await sqlError(
        `UPDATE "inventory_receipts" SET "purchaseDate" = '2026-09-01' WHERE "id" = '${id}'`,
      ),
    ).toBe('23514');
    expect(
      await sqlError(`UPDATE "inventory_receipts" SET "voidedAt" = now() WHERE "id" = '${id}'`),
    ).toBe('23514');
  });

  it('RLS activado en todas las tablas de la aplicación', async () => {
    const rows = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
    const forced = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity`;
    expect(forced).toEqual([]);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
