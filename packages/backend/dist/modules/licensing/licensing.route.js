"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.licensingRoutes = licensingRoutes;
const zod_1 = require("zod");
const config_1 = require("../../config");
const licensing_service_1 = require("./licensing.service");
const client_1 = require("../../db/client");
const ActivateLicenseSchema = zod_1.z.object({
    code: zod_1.z.string().min(8).max(64),
});
const GenerateLicenseSchema = zod_1.z.object({
    organisationId: zod_1.z.number().int().positive().optional(),
    label: zod_1.z.string().trim().max(120).optional(),
    validityDays: zod_1.z.number().int().min(1).max(365).default(config_1.config.licensing.defaultValidityDays),
    graceDays: zod_1.z.number().int().min(0).max(90).default(config_1.config.licensing.defaultGraceDays),
    notes: zod_1.z.string().trim().max(1000).optional(),
});
const RefreshLicenseSchema = zod_1.z.object({
    validityDays: zod_1.z.number().int().min(1).max(365).default(config_1.config.licensing.defaultValidityDays),
});
const UpdateLicenseStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']),
});
function assertAdmin(request) {
    if (request.user.role !== 'ADMIN') {
        throw Object.assign(new Error('Solo el ADMIN puede gestionar licencias'), { statusCode: 403 });
    }
}
function assertMasterKey(request) {
    const incomingKey = String(request.headers['x-license-master-key'] ?? '');
    if (!config_1.config.licensing.masterKey || incomingKey !== config_1.config.licensing.masterKey) {
        throw Object.assign(new Error('Clave maestra de licencias inválida'), { statusCode: 403 });
    }
}
async function licensingRoutes(fastify) {
    fastify.addHook('onRequest', fastify.authenticate);
    fastify.get('/status', async (request, reply) => {
        const status = await (0, licensing_service_1.getOrganisationLicenseStatus)(request.user.organisationId);
        await (0, licensing_service_1.touchOrganisationLicense)(request.user.organisationId);
        return reply.send({ data: status });
    });
    fastify.get('/current', async (request, reply) => {
        assertAdmin(request);
        const status = await (0, licensing_service_1.getOrganisationLicenseStatus)(request.user.organisationId);
        return reply.send({ data: status });
    });
    fastify.post('/activate', async (request, reply) => {
        assertAdmin(request);
        const body = ActivateLicenseSchema.parse(request.body);
        const license = await (0, licensing_service_1.activateLicenseForOrganisation)(body.code, request.user.organisationId);
        return reply.status(201).send({ data: (0, licensing_service_1.evaluateLicense)(license) });
    });
    fastify.get('/center/licenses', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const licenses = await client_1.prisma.license.findMany({
            where: {
                OR: [
                    { organisationId: request.user.organisationId },
                    { organisationId: null },
                ],
            },
            include: {
                organisation: {
                    select: { id: true, name: true, nif: true },
                },
            },
            orderBy: [{ createdAt: 'desc' }],
        });
        return reply.send({ data: licenses });
    });
    fastify.post('/center/licenses/generate', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const body = GenerateLicenseSchema.parse(request.body);
        const targetOrganisationId = body.organisationId ?? request.user.organisationId;
        const license = await (0, licensing_service_1.generateLicense)({
            organisationId: targetOrganisationId,
            label: body.label,
            validityDays: body.validityDays,
            graceDays: body.graceDays,
            notes: body.notes,
        });
        return reply.status(201).send({ data: license });
    });
    fastify.post('/center/licenses/:id/refresh', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const body = RefreshLicenseSchema.parse(request.body);
        const id = parseInt(request.params.id, 10);
        const license = await (0, licensing_service_1.refreshLicense)(id, body.validityDays);
        return reply.send({ data: license });
    });
    fastify.patch('/center/licenses/:id/status', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const body = UpdateLicenseStatusSchema.parse(request.body);
        const id = parseInt(request.params.id, 10);
        const license = await (0, licensing_service_1.updateLicenseStatus)(id, body.status);
        return reply.send({ data: license });
    });
}
//# sourceMappingURL=licensing.route.js.map