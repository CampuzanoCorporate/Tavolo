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
            daysRemaining: 0,
            license: null,
        };
    }
    if (license.status === 'SUSPENDED') {
        return {
            effectiveState: 'BLOCKED',
            canWrite: false,
            reason: 'Licencia suspendida por administración. El período de gracia se ha anulado y la aplicación se encuentra bloqueada.',
            daysRemaining: 0,
            license,
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
                daysRemaining: Math.max(0, Math.ceil((validUntilMs - nowMs) / (1000 * 60 * 60 * 24))),
                license,
            };
        }
        if (nowMs <= graceUntilMs) {
            return {
                effectiveState: 'GRACE',
                canWrite: true,
                reason: 'La licencia ha entrado en período de gracia. La sede puede seguir operando temporalmente.',
                daysRemaining: Math.max(0, Math.ceil((graceUntilMs - nowMs) / (1000 * 60 * 60 * 24))),
                license,
            };
        }
    }
    if (license.status === 'CANCELLED' && nowMs <= graceUntilMs) {
        return {
            effectiveState: 'GRACE',
            canWrite: true,
            reason: 'La licencia está cancelada, pero aún se encuentra dentro del período de gracia.',
            daysRemaining: Math.max(0, Math.ceil((graceUntilMs - nowMs) / (1000 * 60 * 60 * 24))),
            license,
        };
    }
    return {
        effectiveState: 'BLOCKED',
        canWrite: false,
        reason: license.status === 'CANCELLED'
            ? 'La licencia está cancelada y ha agotado el período de gracia.'
            : 'La licencia ha agotado el período de gracia y la sede queda en modo solo consulta.',
        daysRemaining: 0,
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
                daysRemaining: 999,
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
                daysRemaining: 999,
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
    const planType = params.planType || 'PRO';
    const maxScreens = params.maxScreens ?? (planType === 'BASIC' ? 2 : planType === 'PRO' ? 5 : 99);
    const hasKitchenDisplay = params.hasKitchenDisplay ?? (planType !== 'BASIC');
    return client_2.prisma.license.create({
        data: {
            organisationId: params.organisationId,
            code: generateLicenseCode(),
            label: params.label?.trim() || null,
            planType,
            maxScreens,
            hasKitchenDisplay,
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
    if (status === 'SUSPENDED') {
        return client_2.prisma.license.update({
            where: { id },
            data: {
                status: 'SUSPENDED',
                graceDays: 0,
                graceUntil: now,
                lastValidatedAt: now,
            },
        });
    }
    if (status === 'ACTIVE') {
        const graceDays = existing.graceDays > 0 ? existing.graceDays : config_1.config.licensing.defaultGraceDays;
        const validUntil = existing.validUntil < now ? addDays(now, config_1.config.licensing.defaultValidityDays) : existing.validUntil;
        const graceUntil = addDays(validUntil, graceDays);
        return client_2.prisma.license.update({
            where: { id },
            data: {
                status: 'ACTIVE',
                validUntil,
                graceDays,
                graceUntil,
                lastValidatedAt: now,
            },
        });
    }
    return client_2.prisma.license.update({
        where: { id },
        data: {
            status,
            lastValidatedAt: now,
        },
    });
}
//# sourceMappingURL=licensing.service.js.map