-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('COUNT', 'PURCHASE_IN', 'MAINTENANCE_USE', 'MAINTENANCE_VOID', 'ADJUSTMENT', 'SALE', 'SALE_VOID');

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantityDelta" DECIMAL(12,3) NOT NULL,
    "countedQuantity" DECIMAL(12,3),
    "previousBalance" DECIMAL(12,3),
    "reason" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_movements_businessId_productId_occurredAt_idx" ON "inventory_movements"("businessId", "productId", "occurredAt");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
