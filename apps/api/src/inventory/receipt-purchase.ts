import { HttpStatus } from '@nestjs/common';
import { Prisma, type InventoryReceipt, type Supplier } from '@prisma/client';
import { fromDbDate, isDateOnly } from '../common/date-only';
import {
  ProblemException,
  ValidationProblemException,
} from '../common/exceptions/problem.exception';
import type { ScopedTransaction } from '../prisma/business-scope';
import { normalizeCode, supplierNotFound } from '../suppliers/suppliers.service';

/** Proveedor resumido que acompaña a una recepción en las respuestas. */
export interface ReceiptSupplier {
  id: string;
  name: string;
  taxId: string | null;
}

/**
 * Recepción tal como sale de la API (R8): la fecha de compra como `YYYY-MM-DD`
 * y el proveedor resumido.
 */
export type ReceiptView = Omit<InventoryReceipt, 'purchaseDate' | 'purchaseExchangeRate'> & {
  purchaseDate: string | null;
  purchaseExchangeRate: string | null;
  supplier: ReceiptSupplier | null;
};

export const RECEIPT_SUPPLIER_SELECT = { select: { id: true, name: true, taxId: true } } as const;

export function receiptView(
  receipt: InventoryReceipt & { supplier?: Pick<Supplier, 'id' | 'name' | 'taxId'> | null },
): ReceiptView {
  const { supplier, purchaseDate, purchaseExchangeRate, ...rest } = receipt;
  return {
    ...rest,
    purchaseDate: purchaseDate ? fromDbDate(purchaseDate) : null,
    purchaseExchangeRate: purchaseExchangeRate
      ? new Prisma.Decimal(purchaseExchangeRate).toFixed(4)
      : null,
    supplier: supplier ? { id: supplier.id, name: supplier.name, taxId: supplier.taxId } : null,
  };
}

/** Mayúsculas y sin espacios: "F001 - 123" y "f001-123" son el mismo comprobante. */
export function normalizeDocumentRef(value: string | null | undefined): string | null {
  return normalizeCode(value);
}

/** Fecha de compra: calendario válido y no posterior a hoy en la zona del negocio (BR-K2). */
export function assertPurchaseDate(value: string | undefined, today: string): void {
  if (value === undefined) return;
  if (!isDateOnly(value)) {
    throw new ValidationProblemException([
      { field: 'purchaseDate', message: 'La fecha de compra no es válida.' },
    ]);
  }
  if (value > today) {
    throw new ValidationProblemException([
      { field: 'purchaseDate', message: 'La fecha de compra no puede ser futura.' },
    ]);
  }
}

/** El comprobante exige proveedor (DEC-95). */
export function assertDocumentHasSupplier(
  documentRef: string | null,
  supplierId: string | null | undefined,
): void {
  if (documentRef && !supplierId) {
    throw new ValidationProblemException([
      { field: 'documentRef', message: 'Elige el proveedor del comprobante.' },
    ]);
  }
}

/** Proveedor del negocio y activo; si no, 404 o 409 `SUPPLIER_INACTIVE`. */
export async function assertSupplierUsable(
  tx: ScopedTransaction,
  supplierId: string,
): Promise<Supplier> {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId } });
  if (!supplier) throw supplierNotFound();
  if (!supplier.isActive) {
    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'SUPPLIER_INACTIVE',
      title: 'El proveedor está desactivado',
      detail: 'Reactívalo o elige otro proveedor.',
    });
  }
  return supplier;
}

/**
 * Comprobante libre para ese proveedor entre recepciones no anuladas (DEC-95).
 * El índice único parcial lo respalda ante dos registros simultáneos.
 */
export async function assertDocumentFree(
  tx: ScopedTransaction,
  params: { supplierId: string; documentRef: string; exceptReceiptId?: string },
): Promise<void> {
  const existing = await tx.inventoryReceipt.findFirst({
    where: {
      supplierId: params.supplierId,
      documentRef: params.documentRef,
      voidedAt: null,
      ...(params.exceptReceiptId ? { id: { not: params.exceptReceiptId } } : {}),
    },
    select: { id: true, occurredAt: true },
  });
  if (existing) throw duplicateDocument(existing);
}

export function duplicateDocument(existing?: { id: string; occurredAt: Date }): ProblemException {
  return new ProblemException({
    status: HttpStatus.CONFLICT,
    code: 'DUPLICATE_DOCUMENT',
    title: 'Ese comprobante ya está registrado',
    detail: 'Ya hay una recepción de este proveedor con el mismo número de comprobante.',
    errors: [{ field: 'documentRef', message: 'Ya registraste este comprobante.' }],
    ...(existing
      ? { data: { receiptId: existing.id, occurredAt: existing.occurredAt.toISOString() } }
      : {}),
  });
}

/** El índice parcial del comprobante, si dos registros simultáneos chocan. */
export function isDocumentUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    /documentRef|inventory_receipts_supplier_document_open_key/.test(
      JSON.stringify(error.meta ?? {}) + error.message,
    )
  );
}
