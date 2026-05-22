-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN');

-- CreateEnum
CREATE TYPE "table_status" AS ENUM ('FREE', 'OCCUPIED', 'ORDERING', 'BILL_REQUESTED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('OPEN', 'SENT_TO_KITCHEN', 'READY', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "aeat_status" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "printer_type" AS ENUM ('RECEIPT', 'KITCHEN', 'BAR');

-- CreateTable
CREATE TABLE "organisations" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "nif" VARCHAR(20) NOT NULL,
    "address" VARCHAR(500),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" SERIAL NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "address" VARCHAR(500),
    "phone" VARCHAR(20),
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Europe/Madrid',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "useOrgNif" BOOLEAN NOT NULL DEFAULT true,
    "nifOverride" VARCHAR(20),
    "nameOverride" VARCHAR(200),
    "invoiceSeries" VARCHAR(20) NOT NULL DEFAULT 'T',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "role" NOT NULL DEFAULT 'WAITER',
    "password" VARCHAR(60) NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_users" (
    "userId" INTEGER NOT NULL,
    "venueId" INTEGER NOT NULL,

    CONSTRAINT "venue_users_pkey" PRIMARY KEY ("userId","venueId")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "name" VARCHAR(50),
    "seats" INTEGER NOT NULL DEFAULT 4,
    "zone" VARCHAR(50),
    "status" "table_status" NOT NULL DEFAULT 'FREE',

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7),
    "icon" VARCHAR(50),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "categoryId" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "imagePath" VARCHAR(255),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "tableId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "notes" VARCHAR(500),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "invoiceSeries" VARCHAR(20) NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "invoiceCode" VARCHAR(50) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "hashSelf" CHAR(64) NOT NULL,
    "hashPrevious" CHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    "previousInvoiceCode" VARCHAR(50),
    "aeatStatus" "aeat_status" NOT NULL DEFAULT 'PENDING',
    "aeatSentAt" TIMESTAMP(3),
    "aeatResponseCode" VARCHAR(50),
    "aeatResponseMsg" TEXT,
    "aeatPayloadJson" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessName" VARCHAR(200) NOT NULL,
    "businessNif" VARCHAR(20) NOT NULL,
    "businessAddress" VARCHAR(500) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "ipAddress" VARCHAR(45) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "type" "printer_type" NOT NULL DEFAULT 'RECEIPT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organisationId_role_idx" ON "users"("organisationId", "role");

-- CreateIndex
CREATE INDEX "tables_venueId_status_idx" ON "tables"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tables_venueId_number_key" ON "tables"("venueId", "number");

-- CreateIndex
CREATE INDEX "categories_venueId_isActive_idx" ON "categories"("venueId", "isActive");

-- CreateIndex
CREATE INDEX "products_venueId_categoryId_idx" ON "products"("venueId", "categoryId");

-- CreateIndex
CREATE INDEX "products_venueId_isAvailable_idx" ON "products"("venueId", "isAvailable");

-- CreateIndex
CREATE INDEX "orders_venueId_tableId_status_idx" ON "orders"("venueId", "tableId", "status");

-- CreateIndex
CREATE INDEX "orders_venueId_status_idx" ON "orders"("venueId", "status");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_orderId_key" ON "tickets"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_invoiceCode_key" ON "tickets"("invoiceCode");

-- CreateIndex
CREATE INDEX "tickets_venueId_issuedAt_idx" ON "tickets"("venueId", "issuedAt");

-- CreateIndex
CREATE INDEX "tickets_aeatStatus_idx" ON "tickets"("aeatStatus");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_venueId_invoiceSeries_invoiceNumber_key" ON "tickets"("venueId", "invoiceSeries", "invoiceNumber");

-- CreateIndex
CREATE INDEX "printers_venueId_type_isActive_idx" ON "printers"("venueId", "type", "isActive");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_users" ADD CONSTRAINT "venue_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_users" ADD CONSTRAINT "venue_users_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
