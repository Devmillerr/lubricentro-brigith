-- Monto pagado en recepciones (DEC-90, reabre DEC-36) y formas de venta por
-- producto (DEC-91). Solo agrega columnas opcionales y una tabla nueva: no
-- cambia ni borra datos existentes. Las recepciones y ventas anteriores
-- quedan con las columnas nuevas en NULL (sin monto; unidad del producto).
--
-- Reversión (si hiciera falta, antes de que existan datos nuevos):
--   ALTER TABLE "sale_lines" DROP CONSTRAINT "sale_lines_saleUnitId_fkey";
--   ALTER TABLE "sale_lines" DROP COLUMN "saleUnitId", DROP COLUMN "saleUnitLabel", DROP COLUMN "saleUnitFactor";
--   DROP TABLE "product_sale_units";
--   ALTER TABLE "inventory_receipts" DROP COLUMN "totalCost";
--   ALTER TABLE "inventory_movements" DROP COLUMN "purchaseCost";

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "purchaseCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "inventory_receipts" ADD COLUMN     "totalCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "sale_lines" ADD COLUMN     "saleUnitFactor" DECIMAL(12,3),
ADD COLUMN     "saleUnitId" TEXT,
ADD COLUMN     "saleUnitLabel" TEXT;

-- CreateTable
CREATE TABLE "product_sale_units" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "salePrice" DECIMAL(10,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sale_units_pkey" PRIMARY KEY ("id")
);

-- Igual que el resto de tablas (20260929220000_enable_rls): sin políticas,
-- solo el dueño de las tablas (la conexión de Prisma) accede.
ALTER TABLE "product_sale_units" ENABLE ROW LEVEL SECURITY;

-- CreateIndex
CREATE INDEX "product_sale_units_businessId_productId_idx" ON "product_sale_units"("businessId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_sale_units_businessId_productId_label_key" ON "product_sale_units"("businessId", "productId", "label");

-- AddForeignKey
ALTER TABLE "product_sale_units" ADD CONSTRAINT "product_sale_units_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sale_units" ADD CONSTRAINT "product_sale_units_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_saleUnitId_fkey" FOREIGN KEY ("saleUnitId") REFERENCES "product_sale_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
