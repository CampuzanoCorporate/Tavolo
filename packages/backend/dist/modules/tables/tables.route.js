"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tablesRoutes = tablesRoutes;
const client_1 = require("../../db/client");
const client_2 = require("@prisma/client");
async function tablesRoutes(fastify) {
    fastify.addHook('onRequest', fastify.authenticate);
    /** GET /api/tables?venueId= */
    fastify.get('/', async (request, reply) => {
        const venueId = parseInt(request.query.venueId ?? '0', 10);
        if (!venueId)
            return reply.status(400).send({ error: 'venueId requerido' });
        const tables = await client_1.prisma.table.findMany({
            where: { venueId },
            orderBy: [{ zone: 'asc' }, { number: 'asc' }],
        });
        return reply.send({ data: tables });
    });
    /** PATCH /api/tables/:id/status */
    fastify.patch('/:id/status', async (request, reply) => {
        const table = await client_1.prisma.table.update({
            where: { id: parseInt(request.params.id, 10) },
            data: { status: request.body.status },
        });
        return reply.send({ data: table });
    });
    /** PATCH /api/tables/:id/request-bill */
    fastify.patch('/:id/request-bill', async (request, reply) => {
        const table = await client_1.prisma.table.update({
            where: { id: parseInt(request.params.id, 10) },
            data: { status: client_2.TableStatus.BILL_REQUESTED },
        });
        return reply.send({ data: table });
    });
    /** GET /api/tables/:id */
    fastify.get('/:id', async (request, reply) => {
        const table = await client_1.prisma.table.findUnique({
            where: { id: parseInt(request.params.id, 10) },
        });
        if (!table)
            return reply.status(404).send({ error: 'Mesa no encontrada' });
        return reply.send({ data: table });
    });
}
//# sourceMappingURL=tables.route.js.map