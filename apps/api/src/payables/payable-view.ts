import { Prisma, type Supplier, type SupplierPayable } from '@prisma/client';
import { fromDbDate } from '../common/date-only';
import { payableBalance, payableStatus, type PayableStatus } from './payable-rules';

/** Deuda tal como sale de la API (R8): montos como string y fechas `YYYY-MM-DD`. */
export interface PayableView {
  id: string;
  businessId: string;
  supplierId: string;
  supplier: { id: string; name: string } | null;
  receiptId: string;
  receipt: { id: string; occurredAt: Date; documentRef: string | null } | null;
  currency: SupplierPayable['currency'];
  originalAmount: string;
  paidAmount: string;
  balance: string;
  amountSource: SupplierPayable['amountSource'];
  issueDate: string;
  issueDateReason: string | null;
  termDays: number;
  dueDate: string;
  dueDateSource: SupplierPayable['dueDateSource'];
  referenceExchangeRate: string | null;
  status: PayableStatus;
  createdById: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidedById: string | null;
  voidReason: string | null;
}

export const PAYABLE_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  receipt: { select: { id: true, occurredAt: true, documentRef: true } },
} as const;

export function payableView(
  payable: SupplierPayable & {
    supplier?: Pick<Supplier, 'id' | 'name'> | null;
    receipt?: { id: string; occurredAt: Date; documentRef: string | null } | null;
  },
  today: string,
): PayableView {
  return {
    id: payable.id,
    businessId: payable.businessId,
    supplierId: payable.supplierId,
    supplier: payable.supplier ? { id: payable.supplier.id, name: payable.supplier.name } : null,
    receiptId: payable.receiptId,
    receipt: payable.receipt ?? null,
    currency: payable.currency,
    originalAmount: new Prisma.Decimal(payable.originalAmount).toFixed(2),
    paidAmount: new Prisma.Decimal(payable.paidAmount).toFixed(2),
    balance: payableBalance(payable).toFixed(2),
    amountSource: payable.amountSource,
    issueDate: fromDbDate(payable.issueDate),
    issueDateReason: payable.issueDateReason,
    termDays: payable.termDays,
    dueDate: fromDbDate(payable.dueDate),
    dueDateSource: payable.dueDateSource,
    referenceExchangeRate: payable.referenceExchangeRate
      ? new Prisma.Decimal(payable.referenceExchangeRate).toFixed(4)
      : null,
    status: payableStatus(payable, today),
    createdById: payable.createdById,
    createdAt: payable.createdAt,
    voidedAt: payable.voidedAt,
    voidedById: payable.voidedById,
    voidReason: payable.voidReason,
  };
}
