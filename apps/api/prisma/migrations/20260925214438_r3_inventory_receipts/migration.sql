-- CreateTable
CREATE TABLE "inventory_receipts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_receipts_businessId_occurredAt_idx" ON "inventory_receipts"("businessId", "occurredAt");

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
