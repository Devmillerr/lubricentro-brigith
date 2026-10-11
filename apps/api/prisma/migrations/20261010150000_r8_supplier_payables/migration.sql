-- R8 / M4 (DEC-98, DEC-99, DEC-100, DEC-101). Aditiva: no cambia ningún dato existente.
-- BEGIN/COMMIT explícitos: prisma migrate deploy no envuelve la migración en una transacción.
BEGIN;

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('PEN', 'USD');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "PayableAmountSource" AS ENUM ('RECEIPT_LINES', 'MANUAL');

-- CreateEnum
CREATE TYPE "DueDateSource" AS ENUM ('DEFAULT_TERM', 'AGREED');

-- CreateEnum
CREATE TYPE "DueDateChangeKind" AS ENUM ('INITIAL', 'CHANGE');

-- AlterTable
ALTER TABLE "inventory_receipts" ADD COLUMN     "currency" "Currency",
ADD COLUMN     "paymentTerms" "PaymentTerms",
ADD COLUMN     "purchaseExchangeRate" DECIMAL(10,4);

-- CreateTable
CREATE TABLE "supplier_payables" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "originalAmount" DECIMAL(10,2) NOT NULL,
    "amountSource" "PayableAmountSource" NOT NULL,
    "issueDate" DATE NOT NULL,
    "issueDateReason" TEXT,
    "termDays" INTEGER NOT NULL DEFAULT 30,
    "dueDate" DATE NOT NULL,
    "dueDateSource" "DueDateSource" NOT NULL,
    "referenceExchangeRate" DECIMAL(10,4),
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "supplier_payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payable_due_date_changes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "kind" "DueDateChangeKind" NOT NULL,
    "previousDueDate" DATE,
    "newDueDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payable_due_date_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payables_businessId_dueDate_idx" ON "supplier_payables"("businessId", "dueDate");

-- CreateIndex
CREATE INDEX "supplier_payables_businessId_supplierId_dueDate_idx" ON "supplier_payables"("businessId", "supplierId", "dueDate");

-- CreateIndex
CREATE INDEX "supplier_payables_businessId_receiptId_idx" ON "supplier_payables"("businessId", "receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payables_businessId_id_key" ON "supplier_payables"("businessId", "id");

-- CreateIndex
CREATE INDEX "supplier_payable_due_date_changes_businessId_payableId_crea_idx" ON "supplier_payable_due_date_changes"("businessId", "payableId", "createdAt");

-- AddForeignKey
ALTER TABLE "supplier_payables" ADD CONSTRAINT "supplier_payables_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payables" ADD CONSTRAINT "supplier_payables_businessId_supplierId_fkey" FOREIGN KEY ("businessId", "supplierId") REFERENCES "suppliers"("businessId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_payables" ADD CONSTRAINT "supplier_payables_businessId_receiptId_fkey" FOREIGN KEY ("businessId", "receiptId") REFERENCES "inventory_receipts"("businessId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_payables" ADD CONSTRAINT "supplier_payables_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payables" ADD CONSTRAINT "supplier_payables_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payable_due_date_changes" ADD CONSTRAINT "supplier_payable_due_date_changes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payable_due_date_changes" ADD CONSTRAINT "supplier_payable_due_date_changes_businessId_payableId_fkey" FOREIGN KEY ("businessId", "payableId") REFERENCES "supplier_payables"("businessId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_payable_due_date_changes" ADD CONSTRAINT "supplier_payable_due_date_changes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola deuda activa por recepción (DEC-98). Índice parcial escrito a mano.
CREATE UNIQUE INDEX "supplier_payables_receipt_open_key"
  ON "supplier_payables" ("receiptId")
  WHERE "voidedAt" IS NULL;

-- Coherencia (respaldo de las validaciones de la API).
ALTER TABLE "inventory_receipts"
  ADD CONSTRAINT "inventory_receipts_purchase_rate_check"
    CHECK ("purchaseExchangeRate" IS NULL OR ("purchaseExchangeRate" > 0 AND "currency" = 'USD'));

ALTER TABLE "supplier_payables"
  ADD CONSTRAINT "supplier_payables_amount_check" CHECK ("originalAmount" > 0),
  ADD CONSTRAINT "supplier_payables_paid_check"
    CHECK ("paidAmount" >= 0 AND "paidAmount" <= "originalAmount"),
  ADD CONSTRAINT "supplier_payables_due_after_issue_check" CHECK ("dueDate" >= "issueDate"),
  ADD CONSTRAINT "supplier_payables_term_check" CHECK ("termDays" > 0),
  ADD CONSTRAINT "supplier_payables_reference_rate_check"
    CHECK ("referenceExchangeRate" IS NULL OR ("referenceExchangeRate" > 0 AND "currency" = 'USD')),
  ADD CONSTRAINT "supplier_payables_void_all_or_none_check"
    CHECK (("voidedAt" IS NULL) = ("voidedById" IS NULL) AND ("voidedAt" IS NULL) = ("voidReason" IS NULL));

ALTER TABLE "supplier_payable_due_date_changes"
  ADD CONSTRAINT "supplier_payable_due_date_changes_kind_check"
    CHECK (("kind" = 'INITIAL') = ("previousDueDate" IS NULL)),
  ADD CONSTRAINT "supplier_payable_due_date_changes_reason_check" CHECK (length(trim("reason")) > 0);

-- Row Level Security, como el resto de tablas (20260929220000_enable_rls).
ALTER TABLE "supplier_payables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_payable_due_date_changes" ENABLE ROW LEVEL SECURITY;

COMMIT;
