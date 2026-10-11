-- R8 / M2 (DEC-95, DEC-97, DEC-101). Aditiva: no cambia ningún dato existente.
-- BEGIN/COMMIT explícitos: prisma migrate deploy no envuelve la migración en una transacción.
BEGIN;


-- CreateEnum
CREATE TYPE "PurchaseDateSource" AS ENUM ('DOCUMENT', 'RECEIPT_DATE');

-- AlterTable
ALTER TABLE "inventory_receipts" ADD COLUMN     "documentRef" TEXT,
ADD COLUMN     "purchaseDate" DATE,
ADD COLUMN     "purchaseDateSource" "PurchaseDateSource",
ADD COLUMN     "purchaseInfoRecordedAt" TIMESTAMP(3),
ADD COLUMN     "purchaseInfoRecordedById" TEXT,
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_businessId_isActive_name_idx" ON "suppliers"("businessId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_businessId_id_key" ON "suppliers"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_businessId_taxId_key" ON "suppliers"("businessId", "taxId");

-- CreateIndex
CREATE INDEX "inventory_receipts_businessId_supplierId_occurredAt_idx" ON "inventory_receipts"("businessId", "supplierId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_receipts_businessId_id_key" ON "inventory_receipts"("businessId", "id");

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_businessId_supplierId_fkey" FOREIGN KEY ("businessId", "supplierId") REFERENCES "suppliers"("businessId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_purchaseInfoRecordedById_fkey" FOREIGN KEY ("purchaseInfoRecordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Comprobante único por proveedor entre recepciones no anuladas (DEC-95).
-- Índice parcial escrito a mano: Prisma no los expresa en el schema.
CREATE UNIQUE INDEX "inventory_receipts_supplier_document_open_key"
  ON "inventory_receipts" ("businessId", "supplierId", "documentRef")
  WHERE "documentRef" IS NOT NULL AND "voidedAt" IS NULL;

-- Coherencia (respaldo de las validaciones de la API).
ALTER TABLE "inventory_receipts"
  ADD CONSTRAINT "inventory_receipts_document_requires_supplier_check"
    CHECK ("documentRef" IS NULL OR "supplierId" IS NOT NULL),
  ADD CONSTRAINT "inventory_receipts_purchase_date_source_check"
    CHECK (("purchaseDate" IS NULL) = ("purchaseDateSource" IS NULL)),
  ADD CONSTRAINT "inventory_receipts_void_all_or_none_check"
    CHECK (("voidedAt" IS NULL) = ("voidedById" IS NULL) AND ("voidedAt" IS NULL) = ("voidReason" IS NULL));

-- Row Level Security, como el resto de tablas (20260929220000_enable_rls).
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;

COMMIT;
