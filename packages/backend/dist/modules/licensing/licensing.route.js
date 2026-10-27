"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.licensingRoutes = licensingRoutes;
const zod_1 = require("zod");
const config_1 = require("../../config");
const licensing_service_1 = require("./licensing.service");
const client_1 = require("../../db/client");
const aeat_service_1 = require("../verifactu/aeat.service");
const ActivateLicenseSchema = zod_1.z.object({
    code: zod_1.z.string().min(8).max(64),
});
const GenerateLicenseSchema = zod_1.z.object({
    organisationId: zod_1.z.number().int().positive().optional(),
    label: zod_1.z.string().trim().max(120).optional(),
    planType: zod_1.z.enum(['BASIC', 'PRO', 'ENTERPRISE', 'CUSTOM']).optional(),
    maxScreens: zod_1.z.number().int().min(1).max(999).optional(),
    hasKitchenDisplay: zod_1.z.boolean().optional(),
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
const CentreOrganisationSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(200),
    nif: zod_1.z.string().trim().min(4).max(20),
    address: zod_1.z.string().trim().max(500).nullable().optional(),
    phone: zod_1.z.string().trim().max(20).nullable().optional(),
    email: zod_1.z.string().email().nullable().optional(),
});
const CentreVenueSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(200),
    slug: zod_1.z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/),
    address: zod_1.z.string().trim().max(500).nullable().optional(),
    phone: zod_1.z.string().trim().max(20).nullable().optional(),
    timezone: zod_1.z.string().trim().max(50).optional(),
    invoiceSeries: zod_1.z.string().trim().min(1).max(20).optional(),
    kitchenEnabled: zod_1.z.boolean().optional(),
    isActive: zod_1.z.boolean().optional(),
});
const CentreUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(100),
    email: zod_1.z.string().email(),
    role: zod_1.z.enum(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']),
    venueIds: zod_1.z.array(zod_1.z.number().int().positive()).default([]),
    isActive: zod_1.z.boolean().optional(),
});
function assertAdmin(request) {
    if (request.user && request.user.role !== 'ADMIN') {
        throw Object.assign(new Error('Solo el ADMIN puede gestionar licencias'), { statusCode: 403 });
    }
}
function assertMasterKey(request) {
    const incomingKey = String(request.headers['x-license-master-key'] ?? '');
    const effectiveMasterKey = config_1.config.licensing.masterKey || 'tavolo-master-license-key-change-in-prod';
    if (incomingKey !== effectiveMasterKey) {
        throw Object.assign(new Error('Clave maestra de licencias inválida'), { statusCode: 403 });
    }
}
async function licensingRoutes(fastify) {
    fastify.addHook('onRequest', async (request, reply) => {
        const isCenterRoute = request.url.includes('/center/');
        if (isCenterRoute) {
            const incomingKey = String(request.headers['x-license-master-key'] ?? '');
            const effectiveMasterKey = config_1.config.licensing.masterKey || 'tavolo-master-license-key-change-in-prod';
            if (incomingKey === effectiveMasterKey) {
                return;
            }
        }
        await fastify.authenticate(request, reply);
    });
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
        const orgId = request.user?.organisationId;
        const licenses = await client_1.prisma.license.findMany({
            where: orgId ? {
                OR: [
                    { organisationId: orgId },
                    { organisationId: null },
                ],
            } : undefined,
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
        const targetOrganisationId = body.organisationId ?? request.user?.organisationId;
        const license = await (0, licensing_service_1.generateLicense)({
            organisationId: targetOrganisationId,
            label: body.label,
            planType: body.planType,
            maxScreens: body.maxScreens,
            hasKitchenDisplay: body.hasKitchenDisplay,
            validityDays: body.validityDays,
            graceDays: body.graceDays,
            notes: body.notes,
        });
        return reply.status(201).send({ data: license });
    });
    fastify.post('/center/licenses/:id/refresh', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const id = parseInt(request.params.id, 10);
        const body = RefreshLicenseSchema.parse(request.body ?? {});
        const updated = await (0, licensing_service_1.refreshLicense)(id, body.validityDays);
        return reply.send({ data: updated });
    });
    fastify.patch('/center/licenses/:id/status', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const id = parseInt(request.params.id, 10);
        const body = UpdateLicenseStatusSchema.parse(request.body);
        const updated = await (0, licensing_service_1.updateLicenseStatus)(id, body.status);
        return reply.send({ data: updated });
    });
    fastify.post('/center/organisations/provision', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2).max(100),
            nif: zod_1.z.string().min(4).max(20),
            email: zod_1.z.string().email(),
            provisionalPassword: zod_1.z.string().min(6),
            venueName: zod_1.z.string().min(2).default('Sede Central'),
            planType: zod_1.z.enum(['BASIC', 'PRO', 'ENTERPRISE', 'CUSTOM']).default('PRO'),
            maxScreens: zod_1.z.number().int().min(1).default(5),
            hasKitchenDisplay: zod_1.z.boolean().default(true),
        });
        const body = schema.parse(request.body);
        const { hashPassword } = await Promise.resolve().then(() => __importStar(require('../auth/auth.service')));
        // 1. Crear Organización
        const org = await client_1.prisma.organisation.create({
            data: {
                name: body.name.trim(),
                nif: body.nif.trim().toUpperCase(),
                email: body.email.trim().toLowerCase(),
                isActive: true,
            },
        });
        // 2. Crear Sede inicial
        const slug = body.venueName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'sede-1';
        const venue = await client_1.prisma.venue.create({
            data: {
                organisationId: org.id,
                name: body.venueName.trim(),
                slug: `${slug}-${org.id}`,
                isActive: true,
                invoiceSeries: 'F2026',
            },
        });
        // 3. Crear Usuario Administrador de Cliente con contraseña provisional
        const hashedPassword = await hashPassword(body.provisionalPassword);
        const user = await client_1.prisma.user.create({
            data: {
                name: `Admin ${body.name}`,
                email: body.email.trim().toLowerCase(),
                password: hashedPassword,
                role: 'ADMIN',
                organisationId: org.id,
                mustChangePassword: true,
                isActive: true,
            },
        });
        await client_1.prisma.venueUser.create({
            data: {
                userId: user.id,
                venueId: venue.id,
            },
        });
        // 4. Generar Licencia activa
        const license = await (0, licensing_service_1.generateLicense)({
            organisationId: org.id,
            label: `Licencia Inicial ${body.planType}`,
            planType: body.planType,
            maxScreens: body.maxScreens,
            hasKitchenDisplay: body.hasKitchenDisplay,
            validityDays: 30,
        });
        return reply.status(201).send({
            data: {
                organisation: org,
                venue,
                user: { id: user.id, email: user.email, mustChangePassword: true },
                license,
            },
        });
    });
    fastify.get('/center/organisations', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const orgs = await client_1.prisma.organisation.findMany({
            include: {
                fiscalConfig: true,
                fiscalCertificate: {
                    select: {
                        id: true,
                        label: true,
                        originalFilename: true,
                        fileSizeBytes: true,
                        uploadedAt: true,
                    },
                },
                licenses: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                venues: {
                    select: { id: true, name: true, slug: true, isActive: true },
                },
            },
            orderBy: { id: 'asc' },
        });
        const data = await Promise.all(orgs.map(async (org) => {
            const activeLicense = org.licenses[0] ?? null;
            const evaluation = (0, licensing_service_1.evaluateLicense)(activeLicense);
            const venueIds = org.venues.map((v) => v.id);
            let billingStats = {
                totalBilled: 0,
                totalTickets: 0,
                pendingAeatCount: 0,
                errorAeatCount: 0,
            };
            let issueTickets = [];
            if (venueIds.length > 0) {
                const aggregate = await client_1.prisma.ticket.aggregate({
                    where: { venueId: { in: venueIds } },
                    _sum: { total: true },
                    _count: { id: true },
                });
                const pendingCount = await client_1.prisma.ticket.count({
                    where: { venueId: { in: venueIds }, aeatStatus: 'PENDING' },
                });
                const errorCount = await client_1.prisma.ticket.count({
                    where: { venueId: { in: venueIds }, aeatStatus: { in: ['ERROR', 'REJECTED'] } },
                });
                billingStats = {
                    totalBilled: Number(aggregate._sum.total ?? 0),
                    totalTickets: aggregate._count.id,
                    pendingAeatCount: pendingCount,
                    errorAeatCount: errorCount,
                };
                const problematicTickets = await client_1.prisma.ticket.findMany({
                    where: {
                        venueId: { in: venueIds },
                        aeatStatus: { in: ['PENDING', 'ERROR', 'REJECTED'] },
                    },
                    include: { venue: { select: { name: true } } },
                    orderBy: { issuedAt: 'desc' },
                    take: 20,
                });
                issueTickets = problematicTickets.map((t) => ({
                    id: t.id,
                    invoiceCode: t.invoiceCode,
                    total: Number(t.total),
                    aeatStatus: t.aeatStatus,
                    aeatResponseMsg: t.aeatResponseMsg,
                    issuedAt: t.issuedAt.toISOString(),
                    venueName: t.venue.name,
                }));
            }
            return {
                id: org.id,
                name: org.name,
                nif: org.nif,
                address: org.address,
                phone: org.phone,
                email: org.email,
                isActive: org.isActive,
                venues: org.venues,
                fiscalConfig: org.fiscalConfig,
                hasCertificate: Boolean(org.fiscalCertificate),
                certificateSummary: org.fiscalCertificate,
                activeLicense: activeLicense ? { ...activeLicense, evaluation } : null,
                billingStats,
                issueTickets,
            };
        }));
        return reply.send({ data });
    });
    /** Gestión de la ficha comercial y fiscal de cualquier cliente. */
    fastify.put('/center/organisations/:id', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const organisationId = parseInt(request.params.id, 10);
        const body = CentreOrganisationSchema.parse(request.body);
        const organisation = await client_1.prisma.organisation.update({
            where: { id: organisationId },
            data: { ...body, nif: body.nif.toUpperCase(), email: body.email?.toLowerCase() },
        });
        return reply.send({ data: organisation });
    });
    fastify.post('/center/organisations/:id/venues', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const organisationId = parseInt(request.params.id, 10);
        const body = CentreVenueSchema.parse(request.body);
        const venue = await client_1.prisma.venue.create({ data: { ...body, organisationId } });
        return reply.status(201).send({ data: venue });
    });
    fastify.put('/center/venues/:id', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const venueId = parseInt(request.params.id, 10);
        const body = CentreVenueSchema.partial().parse(request.body);
        const venue = await client_1.prisma.venue.update({ where: { id: venueId }, data: body });
        return reply.send({ data: venue });
    });
    fastify.get('/center/organisations/:id/users', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const organisationId = parseInt(request.params.id, 10);
        const users = await client_1.prisma.user.findMany({
            where: { organisationId },
            select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, venueUsers: { select: { venueId: true } } },
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
        });
        return reply.send({ data: users });
    });
    fastify.post('/center/organisations/:id/users', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const organisationId = parseInt(request.params.id, 10);
        const body = CentreUserSchema.extend({ password: zod_1.z.string().min(8).max(100) }).parse(request.body);
        const allowedVenues = await client_1.prisma.venue.count({ where: { id: { in: body.venueIds }, organisationId } });
        if (allowedVenues !== body.venueIds.length)
            return reply.status(400).send({ error: 'Una o más sedes no pertenecen al cliente' });
        const { hashPassword } = await Promise.resolve().then(() => __importStar(require('../auth/auth.service')));
        const user = await client_1.prisma.user.create({
            data: {
                name: body.name,
                email: body.email.toLowerCase(),
                role: body.role,
                password: await hashPassword(body.password),
                organisationId,
                isActive: body.isActive ?? true,
                mustChangePassword: true,
                venueUsers: { create: body.venueIds.map((venueId) => ({ venueId })) },
            },
        });
        return reply.status(201).send({ data: user });
    });
    fastify.put('/center/users/:id', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const userId = parseInt(request.params.id, 10);
        const body = CentreUserSchema.partial().parse(request.body);
        const current = await client_1.prisma.user.findUnique({ where: { id: userId } });
        if (!current)
            return reply.status(404).send({ error: 'Usuario no encontrado' });
        if (body.venueIds) {
            const allowedVenues = await client_1.prisma.venue.count({ where: { id: { in: body.venueIds }, organisationId: current.organisationId } });
            if (allowedVenues !== body.venueIds.length)
                return reply.status(400).send({ error: 'Una o más sedes no pertenecen al cliente' });
        }
        const user = await client_1.prisma.$transaction(async (tx) => {
            if (body.venueIds) {
                await tx.venueUser.deleteMany({ where: { userId } });
                await tx.venueUser.createMany({ data: body.venueIds.map((venueId) => ({ userId, venueId })) });
            }
            return tx.user.update({
                where: { id: userId },
                data: { name: body.name, email: body.email?.toLowerCase(), role: body.role, isActive: body.isActive },
            });
        });
        return reply.send({ data: user });
    });
    fastify.post('/center/users/:id/reset-password', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const userId = parseInt(request.params.id, 10);
        const { password } = zod_1.z.object({ password: zod_1.z.string().min(8).max(100) }).parse(request.body);
        const { hashPassword } = await Promise.resolve().then(() => __importStar(require('../auth/auth.service')));
        const user = await client_1.prisma.user.update({ where: { id: userId }, data: { password: await hashPassword(password), mustChangePassword: true } });
        return reply.send({ data: user });
    });
    /**
     * PATCH /api/licensing/center/organisations/:id/status
     * Dar de baja (desactivar) o reactivar una organización cliente completa.
     */
    fastify.patch('/center/organisations/:id/status', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const organisationId = parseInt(request.params.id, 10);
        const schema = zod_1.z.object({
            isActive: zod_1.z.boolean(),
        });
        const { isActive } = schema.parse(request.body);
        const now = new Date();
        // 1. Actualizar estado de la organización
        const updatedOrg = await client_1.prisma.organisation.update({
            where: { id: organisationId },
            data: { isActive },
        });
        // 2. Actualizar estado de sus sedes
        await client_1.prisma.venue.updateMany({
            where: { organisationId },
            data: { isActive },
        });
        // 3. Actualizar estado de sus usuarios
        await client_1.prisma.user.updateMany({
            where: { organisationId },
            data: { isActive },
        });
        // 4. Si se da de baja, suspender sus licencias inmediatamente. Si se reactiva, activar licencia.
        if (!isActive) {
            await client_1.prisma.license.updateMany({
                where: { organisationId },
                data: {
                    status: 'SUSPENDED',
                    graceDays: 0,
                    graceUntil: now,
                    lastValidatedAt: now,
                },
            });
        }
        else {
            const activeLic = await client_1.prisma.license.findFirst({
                where: { organisationId },
                orderBy: { createdAt: 'desc' },
            });
            if (activeLic) {
                await client_1.prisma.license.update({
                    where: { id: activeLic.id },
                    data: {
                        status: 'ACTIVE',
                        graceDays: config_1.config.licensing.defaultGraceDays,
                        validUntil: activeLic.validUntil < now ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : activeLic.validUntil,
                        graceUntil: new Date(now.getTime() + 37 * 24 * 60 * 60 * 1000),
                        lastValidatedAt: now,
                    },
                });
            }
        }
        return reply.send({
            message: isActive ? 'Cliente reactivado con éxito' : 'Cliente dado de baja correctamente',
            data: updatedOrg,
        });
    });
    fastify.put('/center/organisations/:id/fiscal', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const organisationId = parseInt(request.params.id, 10);
        const FiscalConfigSchema = zod_1.z.object({
            environment: zod_1.z.enum(['TEST', 'PRODUCTION']).default('TEST'),
            customEndpointUrl: zod_1.z
                .union([zod_1.z.string().url(), zod_1.z.literal('')])
                .nullable()
                .optional()
                .transform((val) => (val === '' || !val ? null : val)),
            developerName: zod_1.z.string().min(2).max(120).default('Tavolo POS'),
            developerNif: zod_1.z
                .union([zod_1.z.string().max(20), zod_1.z.literal('')])
                .nullable()
                .optional()
                .transform((val) => (val === '' || !val ? null : val)),
            softwareName: zod_1.z.string().min(1).max(30).default('TAVOLOPOS'),
            softwareId: zod_1.z.string().min(1).max(2).default('01'),
            softwareVersion: zod_1.z.string().min(1).max(50).default('1.0.0'),
            installationId: zod_1.z.string().min(1).max(100).default('default'),
            onlyVerifactu: zod_1.z.boolean().default(true),
        });
        const body = FiscalConfigSchema.parse(request.body);
        const cfg = await client_1.prisma.fiscalConfig.upsert({
            where: { organisationId },
            create: { ...body, organisationId },
            update: body,
        });
        return reply.send({ data: cfg });
    });
    fastify.post('/center/organisations/:id/test-aeat', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const organisationId = parseInt(request.params.id, 10);
        const result = await (0, aeat_service_1.testAeatConnection)(organisationId);
        return reply.send({ data: result });
    });
    fastify.get('/center/venues/:id/tickets', async (request, reply) => {
        assertAdmin(request);
        assertMasterKey(request);
        const venueId = parseInt(request.params.id, 10);
        const venue = await client_1.prisma.venue.findUnique({
            where: { id: venueId },
            include: { organisation: { select: { id: true, name: true, nif: true } } },
        });
        if (!venue) {
            return reply.status(404).send({ error: 'Sede no encontrada' });
        }
        const aggregate = await client_1.prisma.ticket.aggregate({
            where: { venueId },
            _sum: { total: true },
            _count: { id: true },
        });
        const pendingCount = await client_1.prisma.ticket.count({
            where: { venueId, aeatStatus: 'PENDING' },
        });
        const acceptedCount = await client_1.prisma.ticket.count({
            where: { venueId, aeatStatus: 'ACCEPTED' },
        });
        const errorCount = await client_1.prisma.ticket.count({
            where: { venueId, aeatStatus: { in: ['ERROR', 'REJECTED'] } },
        });
        const tickets = await client_1.prisma.ticket.findMany({
            where: { venueId },
            orderBy: { issuedAt: 'desc' },
            take: 100,
        });
        return reply.send({
            data: {
                venue: {
                    id: venue.id,
                    name: venue.name,
                    slug: venue.slug,
                    invoiceSeries: venue.invoiceSeries,
                    organisationName: venue.organisation.name,
                    organisationNif: venue.organisation.nif,
                },
                stats: {
                    totalBilled: Number(aggregate._sum.total ?? 0),
                    totalTickets: aggregate._count.id,
                    acceptedCount,
                    pendingCount,
                    errorCount,
                },
                tickets: tickets.map((t) => ({
                    id: t.id,
                    invoiceCode: t.invoiceCode,
                    invoiceSeries: t.invoiceSeries,
                    invoiceNumber: t.invoiceNumber,
                    subtotal: Number(t.subtotal),
                    vatAmount: Number(t.vatAmount),
                    total: Number(t.total),
                    paymentMethod: t.paymentMethod,
                    aeatStatus: t.aeatStatus,
                    aeatResponseMsg: t.aeatResponseMsg,
                    hashSelf: t.hashSelf,
                    issuedAt: t.issuedAt.toISOString(),
                    isRectified: t.isRectified,
                })),
            },
        });
    });
}
//# sourceMappingURL=licensing.route.js.map