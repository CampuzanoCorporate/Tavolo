"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicketLogoSummary = getTicketLogoSummary;
exports.saveTicketLogo = saveTicketLogo;
exports.deleteTicketLogo = deleteTicketLogo;
exports.getTicketLogoBase64 = getTicketLogoBase64;
const client_1 = require("../../db/client");
function toSummary(record) {
    if (!record)
        return null;
    return {
        id: record.id,
        organisationId: record.organisationId,
        label: record.label,
        originalFilename: record.originalFilename,
        mimeType: record.mimeType,
        width: record.width,
        height: record.height,
        fileSizeBytes: record.fileSizeBytes,
        uploadedAt: record.uploadedAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}
async function getTicketLogoSummary(organisationId) {
    const record = await client_1.prisma.ticketLogo.findUnique({
        where: { organisationId },
    });
    return toSummary(record);
}
async function saveTicketLogo(params) {
    const normalized = params.pngBase64.trim();
    const fileSizeBytes = Buffer.from(normalized, 'base64').length;
    if (fileSizeBytes === 0) {
        throw new Error('El logotipo está vacío');
    }
    if (fileSizeBytes > 1024 * 1024 * 2) {
        throw new Error('El logotipo supera el tamaño máximo permitido de 2 MB');
    }
    const record = await client_1.prisma.ticketLogo.upsert({
        where: { organisationId: params.organisationId },
        create: {
            organisationId: params.organisationId,
            label: params.label?.trim() || null,
            originalFilename: params.filename.trim(),
            mimeType: params.mimeType?.trim() || 'image/png',
            width: params.width,
            height: params.height,
            fileSizeBytes,
            pngBase64: normalized,
        },
        update: {
            label: params.label?.trim() || null,
            originalFilename: params.filename.trim(),
            mimeType: params.mimeType?.trim() || 'image/png',
            width: params.width,
            height: params.height,
            fileSizeBytes,
            pngBase64: normalized,
        },
    });
    return toSummary(record);
}
async function deleteTicketLogo(organisationId) {
    await client_1.prisma.ticketLogo.deleteMany({
        where: { organisationId },
    });
}
async function getTicketLogoBase64(organisationId) {
    const record = await client_1.prisma.ticketLogo.findUnique({
        where: { organisationId },
        select: { pngBase64: true },
    });
    return record?.pngBase64 ?? null;
}
//# sourceMappingURL=logo.service.js.map