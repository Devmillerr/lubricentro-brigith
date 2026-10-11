-- R8 / M1 (DEC-96, DEC-101). Aditiva: no cambia ningún dato existente.
-- `prisma migrate deploy` no envuelve la migración en una transacción
-- (comprobado en F0): BEGIN/COMMIT explícitos para que un fallo no deje nada a medias.
BEGIN;

-- Orden y hora de registro de cada movimiento. Se agregan SIN valor por
-- defecto para que las filas existentes queden en NULL (no se rellenan) y
-- después se activa el valor por defecto, que solo aplica a filas nuevas.
CREATE SEQUENCE "inventory_movements_ledgerSeq_seq" AS INTEGER;
ALTER TABLE "inventory_movements" ADD COLUMN "ledgerSeq" INTEGER;
ALTER TABLE "inventory_movements" ADD COLUMN "recordedAt" TIMESTAMP(3);
ALTER TABLE "inventory_movements" ALTER COLUMN "ledgerSeq" SET DEFAULT nextval('"inventory_movements_ledgerSeq_seq"'::regclass);
ALTER SEQUENCE "inventory_movements_ledgerSeq_seq" OWNED BY "inventory_movements"."ledgerSeq";
ALTER TABLE "inventory_movements" ALTER COLUMN "recordedAt" SET DEFAULT clock_timestamp();

CREATE INDEX "inventory_movements_businessId_productId_ledgerSeq_idx" ON "inventory_movements"("businessId", "productId", "ledgerSeq");
CREATE INDEX "inventory_movements_businessId_refType_refId_idx" ON "inventory_movements"("businessId", "refType", "refId");

-- Recepción atrasada: resolución elegida por producto y confirmación de posible duplicado.
ALTER TABLE "inventory_receipts" ADD COLUMN "laterStockResolution" JSONB;
ALTER TABLE "inventory_receipts" ADD COLUMN "possibleDuplicateAcknowledged" BOOLEAN;

COMMIT;
