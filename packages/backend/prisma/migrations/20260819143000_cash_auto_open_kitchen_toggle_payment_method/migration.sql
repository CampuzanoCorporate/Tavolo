ALTER TABLE "venues"
ADD COLUMN "kitchenEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "payment_method" AS ENUM ('CASH', 'CARD');

ALTER TABLE "tickets"
ADD COLUMN "paymentMethod" "payment_method" NOT NULL DEFAULT 'CARD';
