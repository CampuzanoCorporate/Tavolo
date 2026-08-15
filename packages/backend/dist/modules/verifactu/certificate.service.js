"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptBuffer = decryptBuffer;
exports.getFiscalCertificateSummary = getFiscalCertificateSummary;
exports.saveFiscalCertificate = saveFiscalCertificate;
exports.deleteFiscalCertificate = deleteFiscalCertificate;
exports.getFiscalCertificateBundle = getFiscalCertificateBundle;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../../db/client");
const config_1 = require("../../config");
const ENCRYPTION_VERSION = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
function getEncryptionKey() {
    return crypto_1.default
        .createHash('sha256')
        .update(config_1.config.certificates.encryptionSecret, 'utf8')
        .digest()
        .subarray(0, KEY_LENGTH);
}
function encryptBuffer(value) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { ciphertext, iv, authTag };
}
function decryptBuffer(blob) {
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', getEncryptionKey(), blob.iv);
    decipher.setAuthTag(blob.authTag);
    return Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
}
function toSummary(record) {
    if (!record)
        return null;
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
    };
}
async function getFiscalCertificateSummary(organisationId) {
    const record = await client_1.prisma.fiscalCertificate.findUnique({
        where: { organisationId },
    });
    return toSummary(record);
}
async function saveFiscalCertificate(params) {
    const normalizedBase64 = params.base64Content.trim();
    const fileBuffer = Buffer.from(normalizedBase64, 'base64');
    if (fileBuffer.length === 0) {
        throw new Error('El certificado está vacío');
    }
    if (fileBuffer.length > 1024 * 1024 * 4) {
        throw new Error('El certificado supera el tamaño máximo permitido de 4 MB');
    }
    const fileSha256 = crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
    const encryptedFile = encryptBuffer(fileBuffer);
    const encryptedPassphrase = encryptBuffer(Buffer.from(params.passphrase, 'utf8'));
    const record = await client_1.prisma.fiscalCertificate.upsert({
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
async function deleteFiscalCertificate(organisationId) {
    await client_1.prisma.fiscalCertificate.deleteMany({
        where: { organisationId },
    });
}
async function getFiscalCertificateBundle(organisationId) {
    const record = await client_1.prisma.fiscalCertificate.findUnique({
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
//# sourceMappingURL=certificate.service.js.map