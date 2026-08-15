CREATE TABLE "ticket_logos" (
    "id" SERIAL NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "label" VARCHAR(120),
    "originalFilename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100),
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "pngBase64" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_logos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_logos_organisationId_key" ON "ticket_logos"("organisationId");

ALTER TABLE "ticket_logos"
ADD CONSTRAINT "ticket_logos_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "organisations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
