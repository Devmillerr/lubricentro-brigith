-- R8 / M5 (DEC-99, DEC-101). Aditiva: no cambia ningún dato existente.
-- BEGIN/COMMIT explícitos: prisma migrate deploy no envuelve la migración en una transacción.
BEGIN;

-- CreateEnum
CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH', 'YAPE', 'TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "paymentCurrency" "Currency" NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL,
    "debtCurrency" "Currency" NOT NULL,
    "exchangeRate" DECIMAL(10,4),
    "computedAppliedAmount" DECIMAL(10,2) NOT NULL,
    "appliedAmount" DECIMAL(10,2) NOT NULL,
    "settlesBalance" BOOLEAN NOT NULL DEFAULT false,
    "settlementReason" TEXT,
    "method" "SupplierPaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payments_businessId_payableId_paidOn_idx" ON "supplier_payments"("businessId", "payableId", "paidOn");

-- CreateIndex
CREATE INDEX "supplier_payments_businessId_paidOn_idx" ON "supplier_payments"("businessId", "paidOn");

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_businessId_payableId_fkey" FOREIGN KEY ("businessId", "payableId") REFERENCES "supplier_payables"("businessId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Coherencia del pago (respaldo de las validaciones de la API, DEC-99).
ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_amounts_check"
    CHECK ("amountPaid" > 0 AND "appliedAmount" > 0 AND "computedAppliedAmount" > 0),
  ADD CONSTRAINT "supplier_payments_rate_iff_currencies_differ_check"
    CHECK (("paymentCurrency" = "debtCurrency") = ("exchangeRate" IS NULL)),
  ADD CONSTRAINT "supplier_payments_rate_positive_check"
    CHECK ("exchangeRate" IS NULL OR "exchangeRate" > 0),
  ADD CONSTRAINT "supplier_payments_plain_payment_check"
    CHECK ("settlesBalance" OR ("computedAppliedAmount" = "appliedAmount" AND "settlementReason" IS NULL)),
  ADD CONSTRAINT "supplier_payments_settlement_check"
    CHECK (NOT "settlesBalance" OR (
      "paymentCurrency" <> "debtCurrency"
      AND "settlementReason" IS NOT NULL
      AND abs("computedAppliedAmount" - "appliedAmount") <= 0.01
    )),
  ADD CONSTRAINT "supplier_payments_void_all_or_none_check"
    CHECK (("voidedAt" IS NULL) = ("voidedById" IS NULL) AND ("voidedAt" IS NULL) = ("voidReason" IS NULL));

-- Row Level Security, como el resto de tablas (20260929220000_enable_rls).
ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;

COMMIT;
