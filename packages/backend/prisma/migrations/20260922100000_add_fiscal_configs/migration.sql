-- CreateTable
CREATE TABLE "fiscal_configs" (
    "id" SERIAL NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'TEST',
    "customEndpointUrl" VARCHAR(255),
    "developerName" VARCHAR(120) NOT NULL DEFAULT 'Tavolo POS',
    "developerNif" VARCHAR(20),
    "softwareName" VARCHAR(30) NOT NULL DEFAULT 'TAVOLOPOS',
    "softwareId" VARCHAR(2) NOT NULL DEFAULT '01',
    "softwareVersion" VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    "installationId" VARCHAR(100) NOT NULL DEFAULT 'default',
    "onlyVerifactu" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_configs_organisationId_key" ON "fiscal_configs"("organisationId");

-- AddForeignKey
ALTER TABLE "fiscal_configs" ADD CONSTRAINT "fiscal_configs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
