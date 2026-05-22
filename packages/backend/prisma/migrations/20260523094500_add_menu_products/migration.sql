CREATE TYPE "product_type" AS ENUM ('NORMAL', 'MENU');

ALTER TABLE "products"
ADD COLUMN "productType" "product_type" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "menuCourseTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "menuConfig" JSONB;
