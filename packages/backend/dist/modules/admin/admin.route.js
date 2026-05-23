"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = adminRoutes;
const zod_1 = require("zod");
const client_1 = require("../../db/client");
const client_2 = require("@prisma/client");
const auth_service_1 = require("../auth/auth.service");
// ─── SCHEMAS DE VALIDACIÓN ────────────────────────────────────────────────────
const VenueCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    slug: zod_1.z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
    address: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    timezone: zod_1.z.string().default('Europe/Madrid'),
    useOrgNif: zod_1.z.boolean().default(true),
    nifOverride: zod_1.z.string().optional(),
    nameOverride: zod_1.z.string().optional(),
    invoiceSeries: zod_1.z.string().min(1).max(20).default('T'),
});
const OrgUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200).optional(),
    nif: zod_1.z.string().min(8).max(20).optional(),
    address: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
});
const CategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    color: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    icon: zod_1.z.string().max(50).optional().nullable(),
    sortOrder: zod_1.z.number().int().optional(),
    isActive: zod_1.z.boolean().optional(),
    preparationStationId: zod_1.z.number().int().positive().nullable().optional(),
    modifierGroups: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.number().int().positive().optional(),
        name: zod_1.z.string().min(1).max(100),
        minSelections: zod_1.z.number().int().min(0).default(1),
        maxSelections: zod_1.z.number().int().min(1).default(1),
        sortOrder: zod_1.z.number().int().default(0),
        isActive: zod_1.z.boolean().default(true),
        options: zod_1.z.array(zod_1.z.object({
            id: zod_1.z.number().int().positive().optional(),
            name: zod_1.z.string().min(1).max(100),
            priceDelta: zod_1.z.number().min(0).default(0),
            sortOrder: zod_1.z.number().int().default(0),
            isActive: zod_1.z.boolean().default(true),
        })).default([]),
    }).superRefine((group, ctx) => {
        if (group.maxSelections < group.minSelections) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'maxSelections debe ser mayor o igual que minSelections',
                path: ['maxSelections'],
            });
        }
    })).optional().default([]),
});
const ProductBaseSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().nullable().optional().transform((value) => value ?? undefined),
    price: zod_1.z.number().positive(),
    vatRate: zod_1.z.number().min(0).max(100).default(10),
    categoryId: zod_1.z.number().int().positive(),
    productType: zod_1.z.enum(['NORMAL', 'MENU']).default('NORMAL'),
    menuCourseTags: zod_1.z.array(zod_1.z.enum(['FIRST', 'SECOND', 'DESSERT', 'COFFEE'])).default([]),
    menuConfig: zod_1.z.object({
        includeFirst: zod_1.z.boolean().default(false),
        includeSecond: zod_1.z.boolean().default(false),
        finalMode: zod_1.z.enum(['DESSERT_ONLY', 'DESSERT_OR_COFFEE', 'DESSERT_AND_COFFEE']).default('DESSERT_ONLY'),
    }).nullable().optional(),
    preparationStationId: zod_1.z.number().int().positive().nullable().optional(),
    isAvailable: zod_1.z.boolean().default(true),
    sortOrder: zod_1.z.number().int().optional(),
});
const ProductSchema = ProductBaseSchema.superRefine((product, ctx) => {
    if (product.productType === 'MENU' && !product.menuConfig) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Los productos de tipo menú necesitan configuración',
            path: ['menuConfig'],
        });
    }
});
const ProductUpdateSchema = ProductBaseSchema.partial().superRefine((product, ctx) => {
    if (product.productType === 'MENU' && !product.menuConfig) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Los productos de tipo menú necesitan configuración',
            path: ['menuConfig'],
        });
    }
});
const TableAdminSchema = zod_1.z.object({
    number: zod_1.z.number().int().positive(),
    name: zod_1.z.string().max(50).optional().nullable(),
    seats: zod_1.z.number().int().nonnegative().default(4),
    zone: zod_1.z.string().max(50).optional().nullable(),
    posX: zod_1.z.number().int().min(0).max(5000).optional(),
    posY: zod_1.z.number().int().min(0).max(5000).optional(),
    objectType: zod_1.z.string().max(20).optional().default('TABLE'),
    width: zod_1.z.number().int().nonnegative().optional().default(0),
    height: zod_1.z.number().int().nonnegative().optional().default(0),
});
const PrinterSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    ipAddress: zod_1.z.string().ip(),
    port: zod_1.z.number().int().min(1).max(65535).default(9100),
    type: zod_1.z.enum(['RECEIPT', 'KITCHEN', 'BAR']).default('RECEIPT'),
    isActive: zod_1.z.boolean().default(true),
});
const ProductionStationSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    code: zod_1.z.string().max(40).optional().nullable(),
    printerId: zod_1.z.number().int().positive().nullable().optional(),
    isActive: zod_1.z.boolean().default(true),
    sortOrder: zod_1.z.number().int().default(0),
});
const UserCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']),
    venueIds: zod_1.z.array(zod_1.z.number().int().positive()).optional().default([]),
});
const UserUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100).optional(),
    role: zod_1.z.enum(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']).optional(),
    isActive: zod_1.z.boolean().optional(),
    password: zod_1.z.string().min(6).optional(),
    venueIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
});
// ─── HELPER: Validar acceso de sede ──────────────────────────────────────────
function assertVenueAccess(venueId, userVenueIds, role) {
    if (role !== 'ADMIN' && !userVenueIds.includes(venueId)) {
        throw Object.assign(new Error('Sin acceso a esta sede'), { statusCode: 403 });
    }
}
function mapProductPayload(body, venueId) {
    return {
        venueId,
        name: body.name,
        description: body.description,
        price: body.price,
        vatRate: body.vatRate,
        categoryId: body.categoryId,
        productType: body.productType,
        menuCourseTags: body.menuCourseTags,
        menuConfig: body.menuConfig === null ? client_2.Prisma.JsonNull : body.menuConfig,
        preparationStationId: body.preparationStationId,
        isAvailable: body.isAvailable,
        sortOrder: body.sortOrder,
    };
}
function mapProductUpdatePayload(body) {
    const data = {};
    if (body.name !== undefined)
        data.name = body.name;
    if (body.description !== undefined)
        data.description = body.description;
    if (body.price !== undefined)
        data.price = body.price;
    if (body.vatRate !== undefined)
        data.vatRate = body.vatRate;
    if (body.categoryId !== undefined)
        data.categoryId = body.categoryId;
    if (body.productType !== undefined)
        data.productType = body.productType;
    if (body.menuCourseTags !== undefined)
        data.menuCourseTags = body.menuCourseTags;
    if (body.menuConfig !== undefined)
        data.menuConfig = body.menuConfig === null ? client_2.Prisma.JsonNull : body.menuConfig;
    if (body.preparationStationId !== undefined)
        data.preparationStationId = body.preparationStationId;
    if (body.isAvailable !== undefined)
        data.isAvailable = body.isAvailable;
    if (body.sortOrder !== undefined)
        data.sortOrder = body.sortOrder;
    return data;
}
// ─── RUTAS ADMIN ─────────────────────────────────────────────────────────────
async function adminRoutes(fastify) {
    // Todas las rutas admin requieren autenticación
    fastify.addHook('onRequest', fastify.authenticate);
    // ── Organización ───────────────────────────────────────────────────────────
    /** GET /api/admin/organisation — Datos de la organización */
    fastify.get('/organisation', async (request, reply) => {
        const org = await client_1.prisma.organisation.findUnique({
            where: { id: request.user.organisationId },
            include: { venues: { where: { isActive: true }, orderBy: { name: 'asc' } } },
        });
        return reply.send({ data: org });
    });
    /** PUT /api/admin/organisation — Actualizar datos fiscales/contacto */
    fastify.put('/organisation', async (request, reply) => {
        if (request.user.role !== 'ADMIN') {
            return reply.status(403).send({ error: 'Solo el ADMIN puede modificar la organización' });
        }
        const body = OrgUpdateSchema.parse(request.body);
        const org = await client_1.prisma.organisation.update({
            where: { id: request.user.organisationId },
            data: body,
        });
        return reply.send({ data: org });
    });
    // ── Sedes ──────────────────────────────────────────────────────────────────
    /** GET /api/admin/venues — Lista todas las sedes de la organización */
    fastify.get('/venues', async (request, reply) => {
        const venues = await client_1.prisma.venue.findMany({
            where: {
                organisationId: request.user.organisationId,
                // MANAGER solo ve sus sedes
                ...(request.user.role !== 'ADMIN' && {
                    id: { in: request.user.venueIds },
                }),
            },
            include: {
                _count: { select: { tables: true, orders: true } },
            },
            orderBy: { name: 'asc' },
        });
        return reply.send({ data: venues });
    });
    /** GET /api/admin/venues/:id — Detalle de una sede */
    fastify.get('/venues/:id', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const venue = await client_1.prisma.venue.findFirst({
            where: { id: venueId, organisationId: request.user.organisationId },
            include: {
                printers: { orderBy: { name: 'asc' } },
                _count: { select: { tables: true, categories: true, products: true } },
            },
        });
        if (!venue)
            return reply.status(404).send({ error: 'Sede no encontrada' });
        return reply.send({ data: venue });
    });
    /** POST /api/admin/venues — Crear nueva sede */
    fastify.post('/venues', async (request, reply) => {
        if (request.user.role !== 'ADMIN') {
            return reply.status(403).send({ error: 'Solo el ADMIN puede crear sedes' });
        }
        const body = VenueCreateSchema.parse(request.body);
        const venue = await client_1.prisma.venue.create({
            data: { ...body, organisationId: request.user.organisationId },
        });
        return reply.status(201).send({ data: venue });
    });
    /** PUT /api/admin/venues/:id — Editar sede */
    fastify.put('/venues/:id', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const body = VenueCreateSchema.partial().parse(request.body);
        const venue = await client_1.prisma.venue.update({ where: { id: venueId }, data: body });
        return reply.send({ data: venue });
    });
    /** DELETE /api/admin/venues/:id — Desactivar sede (soft delete) */
    fastify.delete('/venues/:id', async (request, reply) => {
        if (request.user.role !== 'ADMIN') {
            return reply.status(403).send({ error: 'Solo el ADMIN puede desactivar sedes' });
        }
        const venueId = parseInt(request.params.id, 10);
        await client_1.prisma.venue.update({ where: { id: venueId }, data: { isActive: false } });
        return reply.send({ success: true });
    });
    // ── Categorías ─────────────────────────────────────────────────────────────
    /** GET /api/admin/venues/:id/categories */
    fastify.get('/venues/:id/categories', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const categories = await client_1.prisma.category.findMany({
            where: { venueId },
            include: {
                _count: { select: { products: true } },
                modifierGroups: {
                    include: {
                        options: {
                            orderBy: { sortOrder: 'asc' },
                        },
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });
        return reply.send({ data: categories });
    });
    /** POST /api/admin/venues/:id/categories */
    fastify.post('/venues/:id/categories', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const body = CategorySchema.parse(request.body);
        const { modifierGroups, ...categoryData } = body;
        const category = await client_1.prisma.category.create({
            data: {
                ...categoryData,
                venueId,
                preparationStationId: categoryData.preparationStationId,
                modifierGroups: modifierGroups.length > 0 ? {
                    create: modifierGroups.map((group) => ({
                        name: group.name,
                        minSelections: group.minSelections,
                        maxSelections: group.maxSelections,
                        sortOrder: group.sortOrder,
                        isActive: group.isActive,
                        options: group.options.length > 0 ? {
                            create: group.options.map((option) => ({
                                name: option.name,
                                priceDelta: option.priceDelta,
                                sortOrder: option.sortOrder,
                                isActive: option.isActive,
                            })),
                        } : undefined,
                    })),
                } : undefined,
            },
            include: {
                modifierGroups: {
                    include: { options: true },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
        return reply.status(201).send({ data: category });
    });
    /** PUT /api/admin/categories/:id */
    fastify.put('/categories/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const cat = await client_1.prisma.category.findUnique({ where: { id } });
        if (!cat)
            return reply.status(404).send({ error: 'Categoría no encontrada' });
        assertVenueAccess(cat.venueId, request.user.venueIds, request.user.role);
        const body = CategorySchema.partial().parse(request.body);
        const { modifierGroups, ...categoryData } = body;
        const updated = await client_1.prisma.$transaction(async (tx) => {
            if (modifierGroups) {
                const existingGroups = await tx.modifierGroup.findMany({
                    where: { categoryId: id },
                    include: { options: true },
                });
                const incomingGroupIds = modifierGroups
                    .map((group) => group.id)
                    .filter((groupId) => typeof groupId === 'number');
                const groupsToDelete = existingGroups.filter((group) => !incomingGroupIds.includes(group.id));
                if (groupsToDelete.length > 0) {
                    await tx.modifierGroup.deleteMany({
                        where: { id: { in: groupsToDelete.map((group) => group.id) } },
                    });
                }
                for (const group of modifierGroups) {
                    const groupRecord = group.id
                        ? await tx.modifierGroup.update({
                            where: { id: group.id },
                            data: {
                                name: group.name,
                                minSelections: group.minSelections,
                                maxSelections: group.maxSelections,
                                sortOrder: group.sortOrder,
                                isActive: group.isActive,
                            },
                        })
                        : await tx.modifierGroup.create({
                            data: {
                                categoryId: id,
                                name: group.name,
                                minSelections: group.minSelections,
                                maxSelections: group.maxSelections,
                                sortOrder: group.sortOrder,
                                isActive: group.isActive,
                            },
                        });
                    const existingOptions = existingGroups.find((existingGroup) => existingGroup.id === groupRecord.id)?.options ?? [];
                    const incomingOptionIds = group.options
                        .map((option) => option.id)
                        .filter((optionId) => typeof optionId === 'number');
                    const optionsToDelete = existingOptions.filter((option) => !incomingOptionIds.includes(option.id));
                    if (optionsToDelete.length > 0) {
                        await tx.modifierOption.deleteMany({
                            where: { id: { in: optionsToDelete.map((option) => option.id) } },
                        });
                    }
                    for (const option of group.options) {
                        if (option.id) {
                            await tx.modifierOption.update({
                                where: { id: option.id },
                                data: {
                                    name: option.name,
                                    priceDelta: option.priceDelta,
                                    sortOrder: option.sortOrder,
                                    isActive: option.isActive,
                                },
                            });
                        }
                        else {
                            await tx.modifierOption.create({
                                data: {
                                    groupId: groupRecord.id,
                                    name: option.name,
                                    priceDelta: option.priceDelta,
                                    sortOrder: option.sortOrder,
                                    isActive: option.isActive,
                                },
                            });
                        }
                    }
                }
            }
            return tx.category.update({
                where: { id },
                data: categoryData,
                include: {
                    modifierGroups: {
                        include: { options: { orderBy: { sortOrder: 'asc' } } },
                        orderBy: { sortOrder: 'asc' },
                    },
                },
            });
        });
        return reply.send({ data: updated });
    });
    /** DELETE /api/admin/categories/:id */
    fastify.delete('/categories/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const cat = await client_1.prisma.category.findUnique({ where: { id } });
        if (!cat)
            return reply.status(404).send({ error: 'Categoría no encontrada' });
        assertVenueAccess(cat.venueId, request.user.venueIds, request.user.role);
        await client_1.prisma.category.update({ where: { id }, data: { isActive: false } });
        return reply.send({ success: true });
    });
    // ── Productos ──────────────────────────────────────────────────────────────
    /** GET /api/admin/venues/:id/products */
    fastify.get('/venues/:id/products', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const products = await client_1.prisma.product.findMany({
            where: { venueId },
            include: { category: true },
            orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
        });
        return reply.send({ data: products });
    });
    /** POST /api/admin/venues/:id/products */
    fastify.post('/venues/:id/products', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const body = ProductSchema.parse(request.body);
        const product = await client_1.prisma.product.create({ data: mapProductPayload(body, venueId) });
        return reply.status(201).send({ data: product });
    });
    /** PUT /api/admin/products/:id */
    fastify.put('/products/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const prod = await client_1.prisma.product.findUnique({ where: { id } });
        if (!prod)
            return reply.status(404).send({ error: 'Producto no encontrado' });
        assertVenueAccess(prod.venueId, request.user.venueIds, request.user.role);
        const body = ProductUpdateSchema.parse(request.body);
        const updated = await client_1.prisma.product.update({ where: { id }, data: mapProductUpdatePayload(body) });
        return reply.send({ data: updated });
    });
    /** DELETE /api/admin/products/:id */
    fastify.delete('/products/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const prod = await client_1.prisma.product.findUnique({ where: { id } });
        if (!prod)
            return reply.status(404).send({ error: 'Producto no encontrado' });
        assertVenueAccess(prod.venueId, request.user.venueIds, request.user.role);
        await client_1.prisma.product.update({ where: { id }, data: { isAvailable: false } });
        return reply.send({ success: true });
    });
    // ── Mesas ──────────────────────────────────────────────────────────────────
    /** GET /api/admin/venues/:id/tables */
    fastify.get('/venues/:id/tables', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const tables = await client_1.prisma.table.findMany({
            where: { venueId },
            orderBy: { number: 'asc' },
        });
        return reply.send({ data: tables });
    });
    /** POST /api/admin/venues/:id/tables */
    fastify.post('/venues/:id/tables', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const body = TableAdminSchema.parse(request.body);
        const table = await client_1.prisma.table.create({ data: { ...body, venueId } });
        return reply.status(201).send({ data: table });
    });
    /** PUT /api/admin/tables/:id */
    fastify.put('/tables/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const table = await client_1.prisma.table.findUnique({ where: { id } });
        if (!table)
            return reply.status(404).send({ error: 'Mesa no encontrada' });
        assertVenueAccess(table.venueId, request.user.venueIds, request.user.role);
        const body = TableAdminSchema.partial().parse(request.body);
        const updated = await client_1.prisma.table.update({ where: { id }, data: body });
        return reply.send({ data: updated });
    });
    /** DELETE /api/admin/tables/:id */
    fastify.delete('/tables/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const table = await client_1.prisma.table.findUnique({ where: { id } });
        if (!table)
            return reply.status(404).send({ error: 'Mesa no encontrada' });
        assertVenueAccess(table.venueId, request.user.venueIds, request.user.role);
        await client_1.prisma.table.delete({ where: { id } });
        return reply.send({ success: true });
    });
    // ── Secciones de producción ───────────────────────────────────────────────
    /** GET /api/admin/venues/:id/production-stations */
    fastify.get('/venues/:id/production-stations', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const stations = await client_1.prisma.productionStation.findMany({
            where: { venueId },
            include: {
                printer: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        return reply.send({ data: stations });
    });
    /** POST /api/admin/venues/:id/production-stations */
    fastify.post('/venues/:id/production-stations', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const body = ProductionStationSchema.parse(request.body);
        const station = await client_1.prisma.productionStation.create({
            data: { ...body, venueId },
            include: { printer: true },
        });
        return reply.status(201).send({ data: station });
    });
    /** PUT /api/admin/production-stations/:id */
    fastify.put('/production-stations/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const station = await client_1.prisma.productionStation.findUnique({ where: { id } });
        if (!station)
            return reply.status(404).send({ error: 'Sección no encontrada' });
        assertVenueAccess(station.venueId, request.user.venueIds, request.user.role);
        const body = ProductionStationSchema.partial().parse(request.body);
        const updated = await client_1.prisma.productionStation.update({
            where: { id },
            data: body,
            include: { printer: true },
        });
        return reply.send({ data: updated });
    });
    /** DELETE /api/admin/production-stations/:id */
    fastify.delete('/production-stations/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const station = await client_1.prisma.productionStation.findUnique({ where: { id } });
        if (!station)
            return reply.status(404).send({ error: 'Sección no encontrada' });
        assertVenueAccess(station.venueId, request.user.venueIds, request.user.role);
        await client_1.prisma.productionStation.update({ where: { id }, data: { isActive: false } });
        return reply.send({ success: true });
    });
    // ── Impresoras ─────────────────────────────────────────────────────────────
    /** GET /api/admin/venues/:id/printers */
    fastify.get('/venues/:id/printers', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const printers = await client_1.prisma.printer.findMany({ where: { venueId }, orderBy: { name: 'asc' } });
        return reply.send({ data: printers });
    });
    /** POST /api/admin/venues/:id/printers */
    fastify.post('/venues/:id/printers', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const body = PrinterSchema.parse(request.body);
        const printer = await client_1.prisma.printer.create({ data: { ...body, venueId } });
        return reply.status(201).send({ data: printer });
    });
    /** PUT /api/admin/printers/:id */
    fastify.put('/printers/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const p = await client_1.prisma.printer.findUnique({ where: { id } });
        if (!p)
            return reply.status(404).send({ error: 'Impresora no encontrada' });
        assertVenueAccess(p.venueId, request.user.venueIds, request.user.role);
        const body = PrinterSchema.partial().parse(request.body);
        const updated = await client_1.prisma.printer.update({ where: { id }, data: body });
        return reply.send({ data: updated });
    });
    /** DELETE /api/admin/printers/:id */
    fastify.delete('/printers/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const p = await client_1.prisma.printer.findUnique({ where: { id } });
        if (!p)
            return reply.status(404).send({ error: 'Impresora no encontrada' });
        assertVenueAccess(p.venueId, request.user.venueIds, request.user.role);
        await client_1.prisma.printer.update({ where: { id }, data: { isActive: false } });
        return reply.send({ success: true });
    });
    // ── Usuarios ───────────────────────────────────────────────────────────────
    /** GET /api/admin/users */
    fastify.get('/users', async (request, reply) => {
        if (request.user.role !== 'ADMIN' && request.user.role !== 'MANAGER') {
            return reply.status(403).send({ error: 'Sin permisos' });
        }
        const users = await client_1.prisma.user.findMany({
            where: { organisationId: request.user.organisationId },
            select: {
                id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
                venueUsers: { include: { venue: { select: { id: true, name: true } } } },
            },
            orderBy: { name: 'asc' },
        });
        return reply.send({ data: users });
    });
    /** POST /api/admin/users — Crear usuario */
    fastify.post('/users', async (request, reply) => {
        if (request.user.role !== 'ADMIN') {
            return reply.status(403).send({ error: 'Solo el ADMIN puede crear usuarios' });
        }
        const body = UserCreateSchema.parse(request.body);
        const hashedPassword = await (0, auth_service_1.hashPassword)(body.password);
        const user = await client_1.prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    name: body.name,
                    email: body.email.toLowerCase(),
                    password: hashedPassword,
                    role: body.role,
                    organisationId: request.user.organisationId,
                },
            });
            if (body.venueIds && body.venueIds.length > 0) {
                await tx.venueUser.createMany({
                    data: body.venueIds.map((venueId) => ({ userId: newUser.id, venueId })),
                });
            }
            return newUser;
        });
        return reply.status(201).send({
            data: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    });
    /** PUT /api/admin/users/:id — Actualizar usuario */
    fastify.put('/users/:id', async (request, reply) => {
        if (request.user.role !== 'ADMIN') {
            return reply.status(403).send({ error: 'Solo el ADMIN puede modificar usuarios' });
        }
        const userId = parseInt(request.params.id, 10);
        const body = UserUpdateSchema.parse(request.body);
        const updateData = {};
        if (body.name)
            updateData.name = body.name;
        if (body.role)
            updateData.role = body.role;
        if (body.isActive !== undefined)
            updateData.isActive = body.isActive;
        if (body.password)
            updateData.password = await (0, auth_service_1.hashPassword)(body.password);
        await client_1.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: userId }, data: updateData });
            if (body.venueIds !== undefined) {
                await tx.venueUser.deleteMany({ where: { userId } });
                if (body.venueIds.length > 0) {
                    await tx.venueUser.createMany({
                        data: body.venueIds.map((venueId) => ({ userId, venueId })),
                    });
                }
            }
        });
        return reply.send({ success: true });
    });
    // ── Tickets (log fiscal) ───────────────────────────────────────────────────
    /** GET /api/admin/venues/:id/tickets — Log de facturas */
    fastify.get('/venues/:id/tickets', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        const { limit = '50', offset = '0', aeatStatus } = request.query;
        const tickets = await client_1.prisma.ticket.findMany({
            where: {
                venueId,
                ...(aeatStatus && { aeatStatus: aeatStatus }),
            },
            orderBy: { invoiceNumber: 'desc' },
            take: parseInt(limit, 10),
            skip: parseInt(offset, 10),
        });
        const [total, aggregate] = await Promise.all([
            client_1.prisma.ticket.count({ where: { venueId } }),
            client_1.prisma.ticket.aggregate({
                where: {
                    venueId,
                    ...(aeatStatus && { aeatStatus: aeatStatus }),
                },
                _sum: { total: true },
            }),
        ]);
        return reply.send({ data: tickets, total, billedTotal: Number(aggregate._sum.total ?? 0) });
    });
    /** GET /api/admin/venues/:id/cash-closures — Histórico de cierres de caja */
    fastify.get('/venues/:id/cash-closures', async (request, reply) => {
        const venueId = parseInt(request.params.id, 10);
        assertVenueAccess(venueId, request.user.venueIds, request.user.role);
        try {
            const [closures, aggregate] = await Promise.all([
                client_1.prisma.cashClosure.findMany({
                    where: { venueId },
                    include: {
                        user: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: { periodEnd: 'desc' },
                }),
                client_1.prisma.cashClosure.aggregate({
                    where: { venueId },
                    _sum: { billedTotal: true, ticketCount: true },
                }),
            ]);
            return reply.send({
                data: closures,
                totals: {
                    billedTotal: Number(aggregate._sum.billedTotal ?? 0),
                    ticketCount: Number(aggregate._sum.ticketCount ?? 0),
                },
            });
        }
        catch (error) {
            if (error instanceof client_2.Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
                return reply.send({
                    data: [],
                    totals: {
                        billedTotal: 0,
                        ticketCount: 0,
                    },
                });
            }
            throw error;
        }
    });
}
//# sourceMappingURL=admin.route.js.map