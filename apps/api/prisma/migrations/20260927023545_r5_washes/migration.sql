-- CreateTable
CREATE TABLE "wash_types" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wash_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wash_price_options" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "washTypeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wash_price_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wash_types_businessId_sortOrder_idx" ON "wash_types"("businessId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "wash_types_businessId_name_key" ON "wash_types"("businessId", "name");

-- CreateIndex
CREATE INDEX "wash_price_options_businessId_washTypeId_sortOrder_idx" ON "wash_price_options"("businessId", "washTypeId", "sortOrder");

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_washTypeId_fkey" FOREIGN KEY ("washTypeId") REFERENCES "wash_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wash_types" ADD CONSTRAINT "wash_types_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wash_price_options" ADD CONSTRAINT "wash_price_options_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wash_price_options" ADD CONSTRAINT "wash_price_options_washTypeId_fkey" FOREIGN KEY ("washTypeId") REFERENCES "wash_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
