-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "resultingBalance" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isCounted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stockQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (R1): el saldo en caché arranca igual a la suma de los movimientos
-- existentes, y `isCounted` refleja si ya hay algún COUNT (BR-P8). Solo toca
-- las dos columnas nuevas; ningún movimiento se modifica (BR-G5).
UPDATE "products" AS p
SET "stockQuantity" = s."total",
    "isCounted"     = s."hasCount"
FROM (
  SELECT "productId",
         SUM("quantityDelta")      AS "total",
         BOOL_OR("type" = 'COUNT') AS "hasCount"
  FROM "inventory_movements"
  GROUP BY "productId"
) AS s
WHERE s."productId" = p."id";
