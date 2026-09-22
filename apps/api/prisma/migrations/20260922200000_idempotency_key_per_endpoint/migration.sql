-- DropIndex
DROP INDEX "idempotency_records_businessId_key_key";

-- AlterTable
ALTER TABLE "idempotency_records" ALTER COLUMN "responseStatus" DROP NOT NULL,
ALTER COLUMN "responseBody" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_businessId_key_endpoint_key" ON "idempotency_records"("businessId", "key", "endpoint");

