CREATE TYPE "printer_connection_type" AS ENUM ('NETWORK', 'SYSTEM');

ALTER TABLE "printers"
ADD COLUMN "connectionType" "printer_connection_type" NOT NULL DEFAULT 'NETWORK',
ADD COLUMN "systemName" VARCHAR(255);

ALTER TABLE "printers"
ALTER COLUMN "ipAddress" DROP NOT NULL,
ALTER COLUMN "port" DROP NOT NULL;

UPDATE "printers"
SET "connectionType" = 'NETWORK'
WHERE "connectionType" IS NULL;
