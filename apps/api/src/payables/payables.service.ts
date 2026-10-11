import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Currency } from '@prisma/client';
import { addDays, fromDbDate, localDateString, toDbDate } from '../common/date-only';
import {
  ProblemException,
  ValidationProblemException,
} from '../common/exceptions/problem.exception';
import { lockReceipt } from '../inventory/receipt-void';
import { forBusiness, type ScopedTransaction } from '../prisma/business-scope';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChangeDueDateDto,
  CreateReceiptPayableDto,
  ListPayablesQueryDto,
} from './dto/payable.dto';
import { fxDifferenceOf, planPayment, type FxDifference } from './payment-math';
import type { RegisterPaymentDto } from './dto/payable.dto';
import { isDateOnly } from '../common/date-only';
import {
  DUE_SOON_DAYS,
  assertExchangeRate,
  exchangeRateWarning,
  assertPositiveMoney,
  buildPayableDraft,
  createPayable,
  payableBalance,
  payableNotFound,
  payableStatus,
} from './payable-rules';
import { PAYABLE_INCLUDE, payableView, type PayableView } from './payable-view';

export interface PaymentView {
  id: string;
  payableId: string;
  paidOn: string;
  paymentCurrency: Currency;
  amountPaid: string;
  debtCurrency: Currency;
  exchangeRate: string | null;
  computedAppliedAmount: string;
  appliedAmount: string;
  settlesBalance: boolean;
  settlementReason: string | null;
  method: string;
  reference: string | null;
  note: string | null;
  createdById: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidedById: string | null;
  voidReason: string | null;
  fxDifference: FxDifference;
}

export interface PayableDetail extends PayableView {
  payments: PaymentView[];
  fxDifferenceTotal: { calculatedCount: number; applicableCount: number; amountPen: string | null };
  dueDateChanges: {
    id: string;
    kind: 'INITIAL' | 'CHANGE';
    previousDueDate: string | null;
    newDueDate: string;
    reason: string;
    createdById: string;
    createdAt: Date;
  }[];
  warnings: string[];
}

/** Bloquea la deuda del negocio (`FOR UPDATE`). */
export async function lockPayable(
  tx: ScopedTransaction,
  businessId: string,
  payableId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "supplier_payables" WHERE "businessId" = ${businessId}::text AND "id" = ${payableId}::text FOR UPDATE`,
  );
}

/**
 * Cuentas por pagar a proveedores (R8, DEC-98). El estado y el saldo se
 * calculan al leer con "hoy" en la zona del negocio. Orden de bloqueo fijo en
 * toda operación: recepción → deuda → productos.
 */
@Injectable()
export class PayablesService {
  constructor(private readonly prisma: PrismaService) {}

  async today(businessId: string, now: Date = new Date()): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    return localDateString(now, business.timezone);
  }

  /** Lista por vencimiento. Volumen bajo (un negocio): el estado se filtra al leer. */
  async list(
    businessId: string,
    query: ListPayablesQueryDto,
    now = new Date(),
  ): Promise<PayableView[]> {
    const today = await this.today(businessId, now);
    const rows = await forBusiness(this.prisma, businessId).supplierPayable.findMany({
      where: {
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.receiptId ? { receiptId: query.receiptId } : {}),
      },
      include: PAYABLE_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const views = rows.map((row) => payableView(row, today));
    if (!query.status) return views;
    if (query.status === 'OPEN') {
      return views.filter((v) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(v.status));
    }
    return views.filter((v) => v.status === query.status);
  }

  /** Totales por moneda (DEC-100): nunca se suman soles con dólares. */
  async summary(businessId: string, now = new Date()) {
    const today = await this.today(businessId, now);
    const soon = addDays(today, DUE_SOON_DAYS);
    const rows = await forBusiness(this.prisma, businessId).supplierPayable.findMany({
      where: { voidedAt: null },
    });
    const byCurrency = new Map<Currency, ReturnType<typeof emptyTotals>>();
    for (const row of rows) {
      const status = payableStatus(row, today);
      if (status === 'PAID' || status === 'VOIDED') continue;
      const balance = payableBalance(row);
      const totals = byCurrency.get(row.currency) ?? emptyTotals(row.currency);
      totals.openCount += 1;
      totals.open = totals.open.plus(balance);
      const due = fromDbDate(row.dueDate);
      if (status === 'OVERDUE') {
        totals.overdueCount += 1;
        totals.overdue = totals.overdue.plus(balance);
      } else if (due <= soon) {
        totals.dueSoonCount += 1;
        totals.dueSoon = totals.dueSoon.plus(balance);
      }
      byCurrency.set(row.currency, totals);
    }
    return {
      today,
      currencies: [...byCurrency.values()]
        .sort((a, b) => a.currency.localeCompare(b.currency))
        .map((t) => ({
          currency: t.currency,
          openCount: t.openCount,
          openBalance: t.open.toFixed(2),
          overdueCount: t.overdueCount,
          overdueBalance: t.overdue.toFixed(2),
          dueSoonCount: t.dueSoonCount,
          dueSoonBalance: t.dueSoon.toFixed(2),
        })),
    };
  }

  async findOne(businessId: string, id: string, now = new Date()): Promise<PayableDetail> {
    const today = await this.today(businessId, now);
    const scoped = forBusiness(this.prisma, businessId);
    const payable = await scoped.supplierPayable.findFirst({
      where: { id },
      include: PAYABLE_INCLUDE,
    });
    if (!payable) throw payableNotFound();
    const [changes, paymentRows] = await Promise.all([
      scoped.supplierPayableDueDateChange.findMany({
        where: { payableId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      scoped.supplierPayment.findMany({
        where: { payableId: id },
        orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const view = payableView(payable, today);
    const reference = payable.referenceExchangeRate
      ? new Prisma.Decimal(payable.referenceExchangeRate)
      : null;
    const payments: PaymentView[] = paymentRows.map((p) => ({
      id: p.id,
      payableId: p.payableId,
      paidOn: fromDbDate(p.paidOn),
      paymentCurrency: p.paymentCurrency,
      amountPaid: new Prisma.Decimal(p.amountPaid).toFixed(2),
      debtCurrency: p.debtCurrency,
      exchangeRate: p.exchangeRate ? new Prisma.Decimal(p.exchangeRate).toFixed(4) : null,
      computedAppliedAmount: new Prisma.Decimal(p.computedAppliedAmount).toFixed(2),
      appliedAmount: new Prisma.Decimal(p.appliedAmount).toFixed(2),
      settlesBalance: p.settlesBalance,
      settlementReason: p.settlementReason,
      method: p.method,
      reference: p.reference,
      note: p.note,
      createdById: p.createdById,
      createdAt: p.createdAt,
      voidedAt: p.voidedAt,
      voidedById: p.voidedById,
      voidReason: p.voidReason,
      fxDifference: fxDifferenceOf({
        debtCurrency: p.debtCurrency,
        paymentCurrency: p.paymentCurrency,
        amountPaid: new Prisma.Decimal(p.amountPaid),
        appliedAmount: new Prisma.Decimal(p.appliedAmount),
        referenceRate: reference,
      }),
    }));
    const active = payments.filter(
      (p) => !p.voidedAt && p.fxDifference.status !== 'NOT_APPLICABLE',
    );
    const calculated = active.filter((p) => p.fxDifference.status === 'CALCULATED');
    return {
      ...view,
      payments,
      fxDifferenceTotal: {
        calculatedCount: calculated.length,
        applicableCount: active.length,
        amountPen:
          calculated.length === 0
            ? null
            : calculated
                .reduce((acc, p) => acc.plus(p.fxDifference.amountPen!), new Prisma.Decimal(0))
                .toFixed(2),
      },
      dueDateChanges: changes.map((c) => ({
        id: c.id,
        kind: c.kind,
        previousDueDate: c.previousDueDate ? fromDbDate(c.previousDueDate) : null,
        newDueDate: fromDbDate(c.newDueDate),
        reason: c.reason,
        createdById: c.createdById,
        createdAt: c.createdAt,
      })),
      warnings: [],
    };
  }

  /**
   * Cambia el vencimiento pactado (BR-K8): con motivo y una fila `CHANGE` en el
   * historial. No en una deuda pagada o anulada; nunca antes de la fecha base.
   * La misma fecha no cambia nada (un reintento no duplica el historial).
   */
  async changeDueDate(
    businessId: string,
    userId: string,
    id: string,
    dto: ChangeDueDateDto,
    now = new Date(),
  ): Promise<PayableDetail> {
    const today = await this.today(businessId, now);
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new ValidationProblemException([
        { field: 'reason', message: 'Escribe el motivo del cambio (al menos 3 caracteres).' },
      ]);
    }
    await forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      await lockPayable(tx, businessId, id);
      const payable = await tx.supplierPayable.findFirst({ where: { id } });
      if (!payable) throw payableNotFound();
      const status = payableStatus(payable, today);
      if (status === 'PAID' || status === 'VOIDED') {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'PAYABLE_NOT_OPEN',
          title: status === 'PAID' ? 'La deuda ya está pagada' : 'La deuda está anulada',
        });
      }
      if (dto.dueDate < fromDbDate(payable.issueDate)) {
        throw new ValidationProblemException([
          { field: 'dueDate', message: 'El vencimiento no puede ser anterior a la fecha base.' },
        ]);
      }
      const current = fromDbDate(payable.dueDate);
      if (dto.dueDate === current) return;
      await tx.supplierPayable.update({
        where: { id },
        data: { dueDate: toDbDate(dto.dueDate), dueDateSource: 'AGREED' },
      });
      await tx.supplierPayableDueDateChange.create({
        data: {
          businessId,
          payableId: id,
          kind: 'CHANGE',
          previousDueDate: payable.dueDate,
          newDueDate: toDbDate(dto.dueDate),
          reason,
          createdById: userId,
        },
      });
    });
    return this.findOne(businessId, id, now);
  }

  /**
   * Registra la deuda de una recepción ya existente (R8, D22/D30): una sola vez,
   * con monto y moneda escritos y sin tocar el stock. Exige proveedor en la
   * recepción. Si la recepción no tenía fecha de compra y la deuda usa la de
   * recepción, la fija (de vacío a valor, origen `RECEIPT_DATE`).
   */
  async createForReceipt(
    businessId: string,
    userId: string,
    receiptId: string,
    dto: CreateReceiptPayableDto,
    now = new Date(),
  ): Promise<PayableDetail> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const today = localDateString(now, business.timezone);
    const amount = assertPositiveMoney(
      dto.amount,
      'amount',
      'El monto debe ser mayor que 0, con hasta 2 decimales.',
    );

    const payableId = await forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      await lockReceipt(tx, businessId, receiptId);
      const receipt = await tx.inventoryReceipt.findFirst({ where: { id: receiptId } });
      if (!receipt) {
        throw new ProblemException({
          status: HttpStatus.NOT_FOUND,
          code: 'RECEIPT_NOT_FOUND',
          title: 'Recepción no encontrada',
        });
      }
      if (receipt.voidedAt) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'RECEIPT_VOIDED',
          title: 'La recepción está anulada',
        });
      }
      if (!receipt.supplierId) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'PURCHASE_INFO_REQUIRED',
          title: 'Primero indica el proveedor de la recepción',
          detail: 'La deuda es con un proveedor: complétalo en los datos de compra.',
        });
      }
      const purchaseDate = receipt.purchaseDate
        ? fromDbDate(receipt.purchaseDate)
        : localDateString(receipt.occurredAt, business.timezone);
      const draft = buildPayableDraft(
        {
          currency: dto.currency,
          amount,
          amountSource: 'MANUAL',
          purchaseDate,
          issueDate: dto.issueDate,
          issueDateReason: dto.issueDateReason,
          dueDate: dto.dueDate,
          dueDateReason: dto.dueDateReason,
          referenceExchangeRate: dto.referenceExchangeRate,
        },
        today,
      );
      const payable = await createPayable(tx, {
        businessId,
        userId,
        supplierId: receipt.supplierId,
        receiptId,
        draft,
      });
      const receiptData: Prisma.InventoryReceiptUncheckedUpdateInput = {};
      if (!receipt.purchaseDate && draft.issueDate === purchaseDate) {
        receiptData.purchaseDate = toDbDate(purchaseDate);
        receiptData.purchaseDateSource = 'RECEIPT_DATE';
      }
      if (!receipt.paymentTerms) receiptData.paymentTerms = 'CREDIT';
      if (Object.keys(receiptData).length > 0) {
        await tx.inventoryReceipt.update({ where: { id: receiptId }, data: receiptData });
      }
      return payable.id;
    });
    const detail = await this.findOne(businessId, payableId, now);
    return { ...detail, warnings: detail.status === 'OVERDUE' ? ['PAYABLE_ALREADY_OVERDUE'] : [] };
  }

  /** Registra un pago y devuelve la deuda actualizada con sus avisos. */
  async addPayment(
    businessId: string,
    userId: string,
    payableId: string,
    dto: RegisterPaymentDto,
    now = new Date(),
  ): Promise<PayableDetail> {
    const today = await this.today(businessId, now);
    const { warnings } = await registerPayment(this.prisma, {
      businessId,
      userId,
      payableId,
      dto,
      today,
    });
    return { ...(await this.findOne(businessId, payableId, now)), warnings };
  }

  /** Anula un pago y devuelve la deuda actualizada. */
  async cancelPayment(
    businessId: string,
    userId: string,
    payableId: string,
    paymentId: string,
    reason: string,
    now = new Date(),
  ): Promise<PayableDetail> {
    await voidPayment(this.prisma, { businessId, userId, payableId, paymentId, reason, now });
    return this.findOne(businessId, payableId, now);
  }

  /**
   * Anula solo la deuda (R8, D31), con motivo, si no tiene pagos activos. No
   * toca la recepción ni el stock. Orden de bloqueo: recepción → deuda.
   */
  async voidPayable(
    businessId: string,
    userId: string,
    id: string,
    reason: string,
    now = new Date(),
  ): Promise<PayableDetail> {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      throw new ValidationProblemException([
        { field: 'reason', message: 'Escribe el motivo de la anulación (de 3 a 500 caracteres).' },
      ]);
    }
    await forBusiness(this.prisma, businessId).$transaction(async (tx) => {
      const found = await tx.supplierPayable.findFirst({
        where: { id },
        select: { receiptId: true },
      });
      if (!found) throw payableNotFound();
      await lockReceipt(tx, businessId, found.receiptId);
      await lockPayable(tx, businessId, id);
      const payable = await tx.supplierPayable.findFirstOrThrow({ where: { id } });
      if (payable.voidedAt) {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: 'PAYABLE_ALREADY_VOIDED',
          title: 'La deuda ya está anulada',
        });
      }
      assertNoActivePayments(payable);
      await tx.supplierPayable.update({
        where: { id },
        data: { voidedAt: now, voidedById: userId, voidReason: trimmed },
      });
    });
    return this.findOne(businessId, id, now);
  }
}

/**
 * Registra un pago (R8, DEC-99, BR-K11 a BR-K13). Bloquea solo la deuda: dos
 * pagos simultáneos se ordenan y el segundo ve el saldo que dejó el primero.
 * Guarda lo entregado, su moneda, el tipo de cambio escrito y el monto aplicado.
 */
export async function registerPayment(
  prisma: PrismaService,
  params: {
    businessId: string;
    userId: string;
    payableId: string;
    dto: RegisterPaymentDto;
    today: string;
  },
): Promise<{ paymentId: string; warnings: string[] }> {
  const { businessId, userId, payableId, dto, today } = params;
  const amountPaid = assertPositiveMoney(
    dto.amountPaid,
    'amountPaid',
    'El monto pagado debe ser mayor que 0, con hasta 2 decimales.',
  );
  if (!isDateOnly(dto.paidOn) || dto.paidOn > today) {
    throw new ValidationProblemException([
      { field: 'paidOn', message: 'La fecha del pago no es válida o es futura.' },
    ]);
  }
  const rate =
    dto.exchangeRate !== undefined ? assertExchangeRate(dto.exchangeRate, 'exchangeRate') : null;

  const paymentId = await forBusiness(prisma, businessId).$transaction(async (tx) => {
    await lockPayable(tx, businessId, payableId);
    const payable = await tx.supplierPayable.findFirst({ where: { id: payableId } });
    if (!payable) throw payableNotFound();
    if (payable.voidedAt) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'PAYABLE_VOIDED',
        title: 'La deuda está anulada',
      });
    }
    const balance = payableBalance(payable);
    if (balance.lessThanOrEqualTo(0)) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'PAYABLE_NOT_OPEN',
        title: 'La deuda ya está pagada',
      });
    }
    if (dto.paidOn < fromDbDate(payable.issueDate)) {
      throw new ValidationProblemException([
        {
          field: 'paidOn',
          message:
            'El pago no puede ser anterior a la fecha de compra (no se registran anticipos).',
        },
      ]);
    }
    const sameCurrency = dto.paymentCurrency === payable.currency;
    if (sameCurrency && rate) {
      throw new ValidationProblemException([
        { field: 'exchangeRate', message: 'Con la misma moneda no se usa tipo de cambio.' },
      ]);
    }
    if (!sameCurrency && !rate) {
      throw new ValidationProblemException([
        { field: 'exchangeRate', message: 'Escribe el tipo de cambio del día del pago.' },
      ]);
    }
    const plan = planPayment({
      balance,
      amountPaid,
      paymentCurrency: dto.paymentCurrency,
      debtCurrency: payable.currency,
      rate,
      settlesBalance: dto.settlesBalance === true,
      settlementReason: dto.settlementReason,
    });
    const payment = await tx.supplierPayment.create({
      data: {
        businessId,
        payableId,
        paidOn: toDbDate(dto.paidOn),
        paymentCurrency: dto.paymentCurrency,
        amountPaid,
        debtCurrency: payable.currency,
        exchangeRate: rate,
        computedAppliedAmount: plan.computedAppliedAmount,
        appliedAmount: plan.appliedAmount,
        settlesBalance: dto.settlesBalance === true,
        settlementReason: dto.settlesBalance
          ? (dto.settlementReason ?? '').trim().slice(0, 500)
          : null,
        method: dto.method,
        reference: dto.reference?.trim() || null,
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });
    await tx.supplierPayable.update({
      where: { id: payableId },
      data: { paidAmount: new Prisma.Decimal(payable.paidAmount).plus(plan.appliedAmount) },
    });
    return payment.id;
  });
  return { paymentId, warnings: exchangeRateWarning(rate) ? ['EXCHANGE_RATE_OUT_OF_RANGE'] : [] };
}

/**
 * Anula un pago con motivo (D18): nunca se edita. Restituye el saldo en la
 * misma transacción, con la deuda bloqueada.
 */
export async function voidPayment(
  prisma: PrismaService,
  params: {
    businessId: string;
    userId: string;
    payableId: string;
    paymentId: string;
    reason: string;
    now: Date;
  },
): Promise<void> {
  const reason = params.reason.trim();
  if (reason.length < 3) {
    throw new ValidationProblemException([
      { field: 'reason', message: 'Escribe el motivo de la anulación (de 3 a 500 caracteres).' },
    ]);
  }
  await forBusiness(prisma, params.businessId).$transaction(async (tx) => {
    await lockPayable(tx, params.businessId, params.payableId);
    const payable = await tx.supplierPayable.findFirst({ where: { id: params.payableId } });
    if (!payable) throw payableNotFound();
    const payment = await tx.supplierPayment.findFirst({
      where: { id: params.paymentId, payableId: params.payableId },
    });
    if (!payment) {
      throw new ProblemException({
        status: HttpStatus.NOT_FOUND,
        code: 'PAYMENT_NOT_FOUND',
        title: 'Pago no encontrado',
      });
    }
    if (payment.voidedAt) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: 'PAYMENT_ALREADY_VOIDED',
        title: 'El pago ya está anulado',
      });
    }
    await tx.supplierPayment.update({
      where: { id: payment.id },
      data: { voidedAt: params.now, voidedById: params.userId, voidReason: reason.slice(0, 500) },
    });
    await tx.supplierPayable.update({
      where: { id: payable.id },
      data: {
        paidAmount: new Prisma.Decimal(payable.paidAmount).minus(payment.appliedAmount),
      },
    });
  });
}

/**
 * Una deuda con pagos activos no se anula (D16, D31): primero se anulan los
 * pagos. Se mira la caché `paidAmount` (Σ de los pagos activos) con la deuda
 * bloqueada.
 */
export function assertNoActivePayments(payable: { id: string; paidAmount: Prisma.Decimal }): void {
  if (new Prisma.Decimal(payable.paidAmount).greaterThan(0)) {
    throw new ProblemException({
      status: HttpStatus.CONFLICT,
      code: 'PAYABLE_HAS_PAYMENTS',
      title: 'La deuda tiene pagos registrados',
      detail: 'Primero anula los pagos.',
      data: { payableId: payable.id },
    });
  }
}

function emptyTotals(currency: Currency) {
  return {
    currency,
    openCount: 0,
    open: new Prisma.Decimal(0),
    overdueCount: 0,
    overdue: new Prisma.Decimal(0),
    dueSoonCount: 0,
    dueSoon: new Prisma.Decimal(0),
  };
}
