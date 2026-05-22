"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketsRoutes = ticketsRoutes;
const zod_1 = require("zod");
const client_1 = require("../../db/client");
const tickets_service_1 = require("./tickets.service");
const CloseTicketSchema = zod_1.z.object({
    orderId: zod_1.z.number().int().positive(),
    venueId: zod_1.z.number().int().positive(),
    printerIp: zod_1.z.string().ip().optional(),
    printerPort: zod_1.z.number().int().optional(),
});
async function ticketsRoutes(fastify) {
    fastify.addHook('onRequest', fastify.authenticate);
    /** POST /api/tickets/close */
    fastify.post('/close', async (request, reply) => {
        const body = CloseTicketSchema.parse(request.body);
        const result = await (0, tickets_service_1.closeTicket)({ ...body, userId: request.user.userId });
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
}
//# sourceMappingURL=tickets.route.js.map