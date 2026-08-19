"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketsRoutes = ticketsRoutes;
const zod_1 = require("zod");
const client_1 = require("../../db/client");
const tickets_service_1 = require("./tickets.service");
const guards_1 = require("../auth/guards");
const CloseTicketSchema = zod_1.z.object({
    orderId: zod_1.z.number().int().positive(),
    venueId: zod_1.z.number().int().positive(),
    printerIp: zod_1.z.string().ip().optional(),
    printerPort: zod_1.z.number().int().optional(),
});
const ClosePartialTicketSchema = zod_1.z.object({
    originalOrderId: zod_1.z.number().int().positive(),
    venueId: zod_1.z.number().int().positive(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.number().int().positive(),
        quantity: zod_1.z.number().int().positive(),
        notes: zod_1.z.string().nullable().optional(),
        unitPrice: zod_1.z.number().nonnegative(),
        vatRate: zod_1.z.number().nonnegative(),
    })).min(1),
    splitMode: zod_1.z.enum(['QUANTITY', 'PRICE']).optional(),
    printerIp: zod_1.z.string().ip().optional(),
    printerPort: zod_1.z.number().int().optional(),
});
const CloseCashSchema = zod_1.z.object({
    venueId: zod_1.z.number().int().positive(),
    countedAmount: zod_1.z.coerce.number().min(0),
    notes: zod_1.z.string().trim().max(500).optional(),
});
const OpenCashSchema = zod_1.z.object({
    venueId: zod_1.z.number().int().positive(),
    openingAmount: zod_1.z.coerce.number().min(0),
    notes: zod_1.z.string().trim().max(500).optional(),
});
const CashMovementSchema = zod_1.z.object({
    venueId: zod_1.z.number().int().positive(),
    type: zod_1.z.enum(['CASH_IN', 'CASH_OUT']),
    amount: zod_1.z.coerce.number().positive(),
    description: zod_1.z.string().trim().min(2).max(500),
});
async function ticketsRoutes(fastify) {
    fastify.addHook('onRequest', fastify.authenticate);
    /** POST /api/tickets/close */
    fastify.post('/close', async (request, reply) => {
        const body = CloseTicketSchema.parse(request.body);
        const result = await (0, tickets_service_1.closeTicket)({ ...body, userId: request.user.userId });
        return reply.status(201).send({ data: result });
    });
    /** POST /api/tickets/close-partial */
    fastify.post('/close-partial', async (request, reply) => {
        const body = ClosePartialTicketSchema.parse(request.body);
        const result = await (0, tickets_service_1.closePartialTicket)({ ...body, userId: request.user.userId });
        return reply.status(201).send({ data: result });
    });
    /** GET /api/tickets/:id */
    fastify.get('/:id', async (request, reply) => {
        const ticket = await client_1.prisma.ticket.findUnique({
            where: { id: parseInt(request.params.id, 10) },
            include: { order: { include: { items: { include: { product: true } }, table: true } } },
        });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket no encontrado' });
        return reply.send({ data: ticket });
    });
    /** GET /api/tickets/cash/summary?venueId= */
    fastify.get('/cash/summary', async (request, reply) => {
        const venueId = parseInt(request.query.venueId ?? '0', 10);
        if (!venueId)
            return reply.status(400).send({ error: 'venueId requerido' });
        if (!(0, guards_1.canAccessVenue)(request, venueId))
            return reply.status(403).send({ error: 'Sin acceso a esta sede' });
        if (!(0, guards_1.requirePermission)(request, reply, 'VIEW_FINANCIALS'))
            return;
        const summary = await (0, tickets_service_1.getCashSummary)(venueId);
        return reply.send({ data: summary });
    });
    /** POST /api/tickets/cash/close */
    fastify.post('/cash/open', async (request, reply) => {
        const body = OpenCashSchema.parse(request.body);
        if (!(0, guards_1.canAccessVenue)(request, body.venueId))
            return reply.status(403).send({ error: 'Sin acceso a esta sede' });
        if (!(0, guards_1.requirePermission)(request, reply, 'CLOSE_CASH'))
            return;
        const session = await (0, tickets_service_1.openCashSession)({
            venueId: body.venueId,
            userId: request.user.userId,
            openingAmount: body.openingAmount,
            notes: body.notes,
        });
        return reply.status(201).send({ data: session });
    });
    fastify.post('/cash/movements', async (request, reply) => {
        const body = CashMovementSchema.parse(request.body);
        if (!(0, guards_1.canAccessVenue)(request, body.venueId))
            return reply.status(403).send({ error: 'Sin acceso a esta sede' });
        if (!(0, guards_1.requirePermission)(request, reply, 'CLOSE_CASH'))
            return;
        const movement = await (0, tickets_service_1.addCashMovement)({
            venueId: body.venueId,
            userId: request.user.userId,
            type: body.type,
            amount: body.amount,
            description: body.description,
        });
        return reply.status(201).send({ data: movement });
    });
    fastify.post('/cash/close', async (request, reply) => {
        const body = CloseCashSchema.parse(request.body);
        if (!(0, guards_1.canAccessVenue)(request, body.venueId))
            return reply.status(403).send({ error: 'Sin acceso a esta sede' });
        if (!(0, guards_1.requirePermission)(request, reply, 'CLOSE_CASH'))
            return;
        const closure = await (0, tickets_service_1.closeCashRegister)({
            venueId: body.venueId,
            userId: request.user.userId,
            countedAmount: body.countedAmount,
            notes: body.notes,
        });
        return reply.status(201).send({ data: closure });
    });
    /** GET /api/tickets/:id/preview */
    fastify.get('/:id/preview', async (request, reply) => {
        const data = await (0, tickets_service_1.getTicketPreview)(parseInt(request.params.id, 10));
        return reply.send({ data });
    });
    /** GET /api/tickets/:id/raw */
    fastify.get('/:id/raw', async (request, reply) => {
        const data = await (0, tickets_service_1.getTicketRaw)(parseInt(request.params.id, 10));
        return reply.send({ data });
    });
    /** POST /api/tickets/:id/reprint */
    fastify.post('/:id/reprint', async (request, reply) => {
        if (!(0, guards_1.requirePermission)(request, reply, 'REPRINT_TICKETS'))
            return;
        const data = await (0, tickets_service_1.reprintTicket)(parseInt(request.params.id, 10));
        return reply.send({ data });
    });
}
//# sourceMappingURL=tickets.route.js.map