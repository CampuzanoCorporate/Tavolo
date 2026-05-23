-- CreateEnum
CREATE TYPE "license_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "licenses" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER,
  "code" VARCHAR(64) NOT NULL,
  "label" VARCHAR(120),
  "status" "license_status" NOT NULL DEFAULT 'ACTIVE',
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "graceDays" INTEGER NOT NULL DEFAULT 7,
  "graceUntil" TIMESTAMP(3) NOT NULL,
  "activatedAt" TIMESTAMP(3),
  "lastValidatedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licenses_code_key" ON "licenses"("code");

-- CreateIndex
CREATE INDEX "licenses_organisationId_idx" ON "licenses"("organisationId");

-- CreateIndex
CREATE INDEX "licenses_status_validUntil_idx" ON "licenses"("status", "validUntil");

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
