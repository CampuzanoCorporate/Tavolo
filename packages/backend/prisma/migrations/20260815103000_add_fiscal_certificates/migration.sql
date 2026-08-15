CREATE TABLE "fiscal_certificates" (
    "id" SERIAL NOT NULL,
    "organisationId" INTEGER NOT NULL,
    "label" VARCHAR(120),
    "originalFilename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100),
    "fileSizeBytes" INTEGER NOT NULL,
    "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
    "fileCiphertext" BYTEA NOT NULL,
    "fileIv" BYTEA NOT NULL,
    "fileAuthTag" BYTEA NOT NULL,
    "passphraseCiphertext" BYTEA NOT NULL,
    "passphraseIv" BYTEA NOT NULL,
    "passphraseAuthTag" BYTEA NOT NULL,
    "fileSha256" CHAR(64) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_certificates_organisationId_key" ON "fiscal_certificates"("organisationId");

ALTER TABLE "fiscal_certificates"
ADD CONSTRAINT "fiscal_certificates_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "organisations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
