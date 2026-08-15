import crypto from 'crypto';
import { prisma } from '../../db/client';
import { config } from '../../config';

const ENCRYPTION_VERSION = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

type EncryptedBlob = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

export interface FiscalCertificateSummary {
  id: number;
  organisationId: number;
  label: string | null;
  originalFilename: string;
  mimeType: string | null;
  fileSizeBytes: number;
  fileSha256: string;
  uploadedAt: string;
  updatedAt: string;
}

function getEncryptionKey() {
  return crypto
    .createHash('sha256')
    .update(config.certificates.encryptionSecret, 'utf8')
    .digest()
    .subarray(0, KEY_LENGTH);
}

function encryptBuffer(value: Buffer): EncryptedBlob {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { ciphertext, iv, authTag };
}

export function decryptBuffer(blob: EncryptedBlob) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), blob.iv);
  decipher.setAuthTag(blob.authTag);
  return Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
}

function toSummary(record: Awaited<ReturnType<typeof prisma.fiscalCertificate.findUnique>>) {
  if (!record) return null;

  return {
    id: record.id,
    organisationId: record.organisationId,
    label: record.label,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    fileSizeBytes: record.fileSizeBytes,
    fileSha256: record.fileSha256,
    uploadedAt: record.uploadedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  } satisfies FiscalCertificateSummary;
}

export async function getFiscalCertificateSummary(organisationId: number) {
  const record = await prisma.fiscalCertificate.findUnique({
    where: { organisationId },
  });

  return toSummary(record);
}

export async function saveFiscalCertificate(params: {
  organisationId: number;
  filename: string;
  mimeType?: string | null;
  label?: string | null;
  base64Content: string;
  passphrase: string;
}) {
  const normalizedBase64 = params.base64Content.trim();
  const fileBuffer = Buffer.from(normalizedBase64, 'base64');

  if (fileBuffer.length === 0) {
    throw new Error('El certificado está vacío');
  }

  if (fileBuffer.length > 1024 * 1024 * 4) {
    throw new Error('El certificado supera el tamaño máximo permitido de 4 MB');
  }

  const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const encryptedFile = encryptBuffer(fileBuffer);
  const encryptedPassphrase = encryptBuffer(Buffer.from(params.passphrase, 'utf8'));

  const record = await prisma.fiscalCertificate.upsert({
    where: { organisationId: params.organisationId },
    create: {
      organisationId: params.organisationId,
      label: params.label?.trim() || null,
      originalFilename: params.filename.trim(),
      mimeType: params.mimeType?.trim() || null,
      fileSizeBytes: fileBuffer.length,
      encryptionVersion: ENCRYPTION_VERSION,
      fileCiphertext: encryptedFile.ciphertext,
      fileIv: encryptedFile.iv,
      fileAuthTag: encryptedFile.authTag,
      passphraseCiphertext: encryptedPassphrase.ciphertext,
      passphraseIv: encryptedPassphrase.iv,
      passphraseAuthTag: encryptedPassphrase.authTag,
      fileSha256,
    },
    update: {
      label: params.label?.trim() || null,
      originalFilename: params.filename.trim(),
      mimeType: params.mimeType?.trim() || null,
      fileSizeBytes: fileBuffer.length,
      encryptionVersion: ENCRYPTION_VERSION,
      fileCiphertext: encryptedFile.ciphertext,
      fileIv: encryptedFile.iv,
      fileAuthTag: encryptedFile.authTag,
      passphraseCiphertext: encryptedPassphrase.ciphertext,
      passphraseIv: encryptedPassphrase.iv,
      passphraseAuthTag: encryptedPassphrase.authTag,
      fileSha256,
    },
  });

  return toSummary(record);
}

export async function deleteFiscalCertificate(organisationId: number) {
  await prisma.fiscalCertificate.deleteMany({
    where: { organisationId },
  });
}

export async function getFiscalCertificateBundle(organisationId: number) {
  const record = await prisma.fiscalCertificate.findUnique({
    where: { organisationId },
  });

  if (!record) {
    return null;
  }

  return {
    filename: record.originalFilename,
    mimeType: record.mimeType,
    fileBuffer: decryptBuffer({
      ciphertext: Buffer.from(record.fileCiphertext),
      iv: Buffer.from(record.fileIv),
      authTag: Buffer.from(record.fileAuthTag),
    }),
    passphrase: decryptBuffer({
      ciphertext: Buffer.from(record.passphraseCiphertext),
      iv: Buffer.from(record.passphraseIv),
      authTag: Buffer.from(record.passphraseAuthTag),
    }).toString('utf8'),
  };
}
