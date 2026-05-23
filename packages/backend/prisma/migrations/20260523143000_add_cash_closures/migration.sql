CREATE TABLE "cash_closures" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "ticketCount" INTEGER NOT NULL DEFAULT 0,
    "billedTotal" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_closures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_closures_venueId_periodEnd_idx" ON "cash_closures"("venueId", "periodEnd");
CREATE INDEX "cash_closures_userId_createdAt_idx" ON "cash_closures"("userId", "createdAt");

ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
