CREATE TYPE "production_item_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'READY');
CREATE TYPE "production_source_type" AS ENUM ('ORDER_ITEM', 'MENU_COURSE');

CREATE TABLE "production_stations" (
  "id" SERIAL NOT NULL,
  "venueId" INTEGER NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "code" VARCHAR(40),
  "printerId" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_items" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "orderItemId" INTEGER,
  "stationId" INTEGER,
  "sourceType" "production_source_type" NOT NULL DEFAULT 'ORDER_ITEM',
  "sourceKey" VARCHAR(120) NOT NULL,
  "productName" VARCHAR(200) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "description" TEXT,
  "notes" VARCHAR(500),
  "courseTag" VARCHAR(20),
  "sourceMenuName" VARCHAR(200),
  "status" "production_item_status" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "categories" ADD COLUMN "preparationStationId" INTEGER;
ALTER TABLE "products" ADD COLUMN "preparationStationId" INTEGER;

CREATE UNIQUE INDEX "production_items_sourceKey_key" ON "production_items"("sourceKey");
CREATE INDEX "production_stations_venueId_isActive_idx" ON "production_stations"("venueId", "isActive");
CREATE INDEX "production_items_orderId_status_idx" ON "production_items"("orderId", "status");
CREATE INDEX "production_items_stationId_status_idx" ON "production_items"("stationId", "status");
CREATE INDEX "production_items_orderItemId_idx" ON "production_items"("orderItemId");
CREATE INDEX "categories_preparationStationId_idx" ON "categories"("preparationStationId");
CREATE INDEX "products_preparationStationId_idx" ON "products"("preparationStationId");

ALTER TABLE "production_stations"
  ADD CONSTRAINT "production_stations_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_stations"
  ADD CONSTRAINT "production_stations_printerId_fkey"
  FOREIGN KEY ("printerId") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "production_items"
  ADD CONSTRAINT "production_items_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_items"
  ADD CONSTRAINT "production_items_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_items"
  ADD CONSTRAINT "production_items_stationId_fkey"
  FOREIGN KEY ("stationId") REFERENCES "production_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_preparationStationId_fkey"
  FOREIGN KEY ("preparationStationId") REFERENCES "production_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products"
  ADD CONSTRAINT "products_preparationStationId_fkey"
  FOREIGN KEY ("preparationStationId") REFERENCES "production_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
