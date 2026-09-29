-- CreateTable
CREATE TABLE "rate_limit_windows" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limit_windows_resetAt_idx" ON "rate_limit_windows"("resetAt");
