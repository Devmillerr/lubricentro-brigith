-- Envase abierto del que se vende un producto (DEC-93): p. ej. un balde de
-- 20 litros. Solo agrega dos columnas opcionales: los productos existentes
-- quedan en NULL (producto normal) y no cambia ningún dato.
--
-- Reversión (si hiciera falta):
--   ALTER TABLE "products" DROP COLUMN "containerCapacity", DROP COLUMN "containerLabel";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "containerCapacity" DECIMAL(12,3),
ADD COLUMN     "containerLabel" TEXT;
