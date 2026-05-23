"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLicenseDates = buildLicenseDates;
exports.generateLicenseCode = generateLicenseCode;
exports.evaluateLicense = evaluateLicense;
exports.getCurrentOrganisationLicense = getCurrentOrganisationLicense;
exports.getOrganisationLicenseStatus = getOrganisationLicenseStatus;
exports.touchOrganisationLicense = touchOrganisationLicense;
exports.generateLicense = generateLicense;
exports.activateLicenseForOrganisation = activateLicenseForOrganisation;
exports.refreshLicense = refreshLicense;
exports.updateLicenseStatus = updateLicenseStatus;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const client_2 = require("../../db/client");
const config_1 = require("../../config");
function isMissingLicenseTableError(error) {
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        return error.code === 'P2021';
    }
    return error instanceof Error
        && (error.message.includes('licenses')
            || error.message.includes('License')
            || error.message.includes('does not exist'));
}
function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}
function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}
function buildLicenseDates(validityDays = config_1.config.licensing.defaultValidityDays, graceDays = config_1.config.licensing.defaultGraceDays) {
    const validFrom = new Date();
    const validUntil = addDays(validFrom, validityDays);
    const graceUntil = addDays(validUntil, graceDays);
    return { validFrom, validUntil, graceUntil };
}
function generateLicenseCode() {
    return `TAV-${crypto_1.default.randomBytes(4).toString('hex').toUpperCase()}-${crypto_1.default.randomBytes(4).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}
function evaluateLicense(license, now = new Date()) {
    if (!license) {
        return {
            effectiveState: 'UNLICENSED',
            canWrite: false,
            reason: 'No hay licencia asignada a esta organización.',
            license: null,
        };
    }
    const nowMs = now.getTime();
    const validUntilMs = new Date(license.validUntil).getTime();
    const graceUntilMs = new Date(license.graceUntil).getTime();
    if (license.status === 'ACTIVE') {
        if (nowMs <= validUntilMs) {
            return {
                effectiveState: 'ACTIVE',
                canWrite: true,
                reason: 'Licencia activa y validada.',
                license,
            };
        }
        if (nowMs <= graceUntilMs) {
            return {
                effectiveState: 'GRACE',
                canWrite: true,
                reason: 'La licencia ha entrado en período de gracia. La sede puede seguir operando temporalmente.',
                license,
            };
        }
    }
    if ((license.status === 'SUSPENDED' || license.status === 'CANCELLED') && nowMs <= graceUntilMs) {
        return {
            effectiveState: 'GRACE',
            canWrite: true,
            reason: 'La licencia está suspendida, pero aún se encuentra dentro del período de gracia.',
            license,
        };
    }
    return {
        effectiveState: 'BLOCKED',
        canWrite: false,
        reason: license.status === 'CANCELLED'
            ? 'La licencia está cancelada y ha agotado el período de gracia.'
            : 'La licencia ha agotado el período de gracia y la sede queda en modo solo consulta.',
        license,
    };
}
async function getCurrentOrganisationLicense(organisationId) {
    try {
        return await client_2.prisma.license.findFirst({
            where: { organisationId },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        });
    }
    catch (error) {
        if (isMissingLicenseTableError(error)) {
            return null;
        }
        throw error;
    }
}
async function getOrganisationLicenseStatus(organisationId) {
    try {
        const license = await getCurrentOrganisationLicense(organisationId);
        if (!license) {
            return {
                effectiveState: 'ACTIVE',
                canWrite: true,
                reason: 'Módulo de licencias aún no inicializado en esta base de datos.',
                license: null,
            };
        }
        return evaluateLicense(license);
    }
    catch (error) {
        if (isMissingLicenseTableError(error)) {
            return {
                effectiveState: 'ACTIVE',
                canWrite: true,
                reason: 'Módulo de licencias aún no inicializado en esta base de datos.',
                license: null,
            };
        }
        throw error;
    }
}
async function touchOrganisationLicense(organisationId) {
    try {
        const license = await getCurrentOrganisationLicense(organisationId);
        if (!license)
            return null;
        return await client_2.prisma.license.update({
            where: { id: license.id },
            data: { lastSeenAt: new Date() },
        });
    }
    catch (error) {
        if (isMissingLicenseTableError(error)) {
            return null;
        }
        throw error;
    }
}
async function generateLicense(params) {
    const graceDays = params.graceDays ?? config_1.config.licensing.defaultGraceDays;
    const { validFrom, validUntil, graceUntil } = buildLicenseDates(params.validityDays, graceDays);
    if (params.organisationId) {
        await client_2.prisma.license.updateMany({
            where: { organisationId: params.organisationId },
            data: { organisationId: null },
        });
    }
    return client_2.prisma.license.create({
        data: {
            organisationId: params.organisationId,
            code: generateLicenseCode(),
            label: params.label?.trim() || null,
            status: params.status ?? 'ACTIVE',
            validFrom,
            validUntil,
            graceDays,
            graceUntil,
            activatedAt: params.organisationId ? new Date() : null,
            lastValidatedAt: new Date(),
            notes: params.notes?.trim() || null,
        },
    });
}
async function activateLicenseForOrganisation(code, organisationId) {
    const cleanedCode = code.trim().toUpperCase();
    const license = await client_2.prisma.license.findUnique({ where: { code: cleanedCode } });
    if (!license) {
        throw Object.assign(new Error('Código de licencia no encontrado'), { statusCode: 404 });
    }
    if (license.organisationId && license.organisationId !== organisationId) {
        throw Object.assign(new Error('Esta licencia ya está asignada a otra organización'), { statusCode: 409 });
    }
    const current = await getCurrentOrganisationLicense(organisationId);
    if (current && current.id !== license.id) {
        await client_2.prisma.license.update({
            where: { id: current.id },
            data: { organisationId: null },
        });
    }
    const now = new Date();
    const validUntil = new Date(license.validUntil);
    const graceUntil = new Date(license.graceUntil);
    if (validUntil < now) {
        const refreshed = buildLicenseDates(config_1.config.licensing.defaultValidityDays, license.graceDays);
        return client_2.prisma.license.update({
            where: { id: license.id },
            data: {
                organisationId,
                status: 'ACTIVE',
                validFrom: refreshed.validFrom,
                validUntil: refreshed.validUntil,
                graceUntil: refreshed.graceUntil,
                activatedAt: now,
                lastValidatedAt: now,
                lastSeenAt: now,
            },
        });
    }
    return client_2.prisma.license.update({
        where: { id: license.id },
        data: {
            organisationId,
            activatedAt: license.activatedAt ?? now,
            lastValidatedAt: now,
            lastSeenAt: now,
        },
    });
}
async function refreshLicense(id, validityDays = config_1.config.licensing.defaultValidityDays) {
    const existing = await client_2.prisma.license.findUnique({ where: { id } });
    if (!existing) {
        throw Object.assign(new Error('Licencia no encontrada'), { statusCode: 404 });
    }
    const validFrom = startOfDay(new Date());
    const validUntil = addDays(validFrom, validityDays);
    const graceUntil = addDays(validUntil, existing.graceDays);
    return client_2.prisma.license.update({
        where: { id },
        data: {
            status: 'ACTIVE',
            validFrom,
            validUntil,
            graceUntil,
            lastValidatedAt: new Date(),
        },
    });
}
async function updateLicenseStatus(id, status) {
    const existing = await client_2.prisma.license.findUnique({ where: { id } });
    if (!existing) {
        throw Object.assign(new Error('Licencia no encontrada'), { statusCode: 404 });
    }
    const now = new Date();
    const graceUntil = existing.graceUntil > now ? existing.graceUntil : addDays(now, existing.graceDays);
    return client_2.prisma.license.update({
        where: { id },
        data: {
            status,
            graceUntil,
            lastValidatedAt: now,
        },
    });
}
//# sourceMappingURL=licensing.service.js.map