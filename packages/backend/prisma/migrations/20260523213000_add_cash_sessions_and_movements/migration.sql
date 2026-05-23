-- CreateEnum
CREATE TYPE "cash_session_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "cash_movement_type" AS ENUM ('OPENING', 'CASH_IN', 'CASH_OUT', 'TICKET');

-- AlterTable
ALTER TABLE "cash_closures"
ADD COLUMN "sessionId" INTEGER,
ADD COLUMN "openingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "manualInTotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "manualOutTotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "expectedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "countedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN "discrepancyAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "openedByUserId" INTEGER NOT NULL,
    "closedByUserId" INTEGER,
    "status" "cash_session_status" NOT NULL DEFAULT 'OPEN',
    "openingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "expectedAmount" DECIMAL(10,2),
    "countedAmount" DECIMAL(10,2),
    "discrepancyAmount" DECIMAL(10,2),
    "openingNotes" TEXT,
    "closingNotes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "ticketId" INTEGER,
    "type" "cash_movement_type" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_closures_sessionId_key" ON "cash_closures"("sessionId");

-- CreateIndex
CREATE INDEX "cash_sessions_venueId_status_idx" ON "cash_sessions"("venueId", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_openedByUserId_openedAt_idx" ON "cash_sessions"("openedByUserId", "openedAt");

-- CreateIndex
CREATE INDEX "cash_sessions_closedByUserId_closedAt_idx" ON "cash_sessions"("closedByUserId", "closedAt");

-- CreateIndex
CREATE INDEX "cash_movements_venueId_createdAt_idx" ON "cash_movements"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_movements_sessionId_createdAt_idx" ON "cash_movements"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_movements_userId_createdAt_idx" ON "cash_movements"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_movements_ticketId_idx" ON "cash_movements"("ticketId");

-- AddForeignKey
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
