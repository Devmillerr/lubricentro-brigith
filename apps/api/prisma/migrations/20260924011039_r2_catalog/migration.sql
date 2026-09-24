-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "presentation" TEXT,
ADD COLUMN     "viscosity" TEXT;

-- AlterTable
ALTER TABLE "vehicle_models" ALTER COLUMN "make" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "products_businessId_categoryId_isActive_idx" ON "products"("businessId", "categoryId", "isActive");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
