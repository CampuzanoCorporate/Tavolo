"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tablesRoutes = tablesRoutes;
const client_1 = require("../../db/client");
const client_2 = require("@prisma/client");
const zod_1 = require("zod");
const guards_1 = require("../auth/guards");
const MergeTablesSchema = zod_1.z.object({
    venueId: zod_1.z.number().int().positive(),
    targetTableId: zod_1.z.number().int().positive(),
    sourceTableIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1),
});
async function tablesRoutes(fastify) {
    fastify.addHook('onRequest', fastify.authenticate);
    /** GET /api/tables?venueId= */
    fastify.get('/', async (request, reply) => {
        const venueId = parseInt(request.query.venueId ?? '0', 10);
        if (!venueId)
            return reply.status(400).send({ error: 'venueId requerido' });
        const [tables, activeOrders] = await Promise.all([
            client_1.prisma.table.findMany({
                where: { venueId },
                orderBy: [{ zone: 'asc' }, { number: 'asc' }],
            }),
            client_1.prisma.order.findMany({
                where: {
                    venueId,
                    status: { in: [client_2.OrderStatus.OPEN, client_2.OrderStatus.SENT_TO_KITCHEN, client_2.OrderStatus.READY] },
                },
                select: {
                    id: true,
                    tableId: true,
                    status: true,
                },
            }),
        ]);
        const orderByTable = new Map(activeOrders.map((order) => [order.tableId, order]));
        const enrichedTables = tables.map((table) => {
            const activeOrder = orderByTable.get(table.id);
            return {
                ...table,
                activeOrderId: activeOrder?.id ?? null,
                activeOrderStatus: activeOrder?.status ?? null,
                kitchenReady: activeOrder?.status === client_2.OrderStatus.READY,
            };
        });
        return reply.send({ data: enrichedTables });
    });
    /** POST /api/tables/merge — Unir mesas activas en una mesa destino */
    fastify.post('/merge', async (request, reply) => {
        if (!(0, guards_1.requirePermission)(request, reply, 'MERGE_TABLES'))
            return;
        const body = MergeTablesSchema.parse(request.body);
        const sourceTableIds = Array.from(new Set(body.sourceTableIds.filter((id) => id !== body.targetTableId)));
        if (sourceTableIds.length === 0) {
            return reply.status(400).send({ error: 'Debes indicar al menos una mesa origen distinta de la destino' });
        }
        const involvedTableIds = [body.targetTableId, ...sourceTableIds];
        const [tables, orders] = await Promise.all([
            client_1.prisma.table.findMany({
                where: { id: { in: involvedTableIds }, venueId: body.venueId },
            }),
            client_1.prisma.order.findMany({
                where: {
                    venueId: body.venueId,
                    tableId: { in: involvedTableIds },
                    status: { in: [client_2.OrderStatus.OPEN, client_2.OrderStatus.SENT_TO_KITCHEN, client_2.OrderStatus.READY] },
                },
                include: {
                    items: true,
                },
            }),
        ]);
        if (tables.length !== involvedTableIds.length) {
            return reply.status(404).send({ error: 'Una o más mesas no existen en esta sede' });
        }
        const targetTable = tables.find((table) => table.id === body.targetTableId);
        if (!targetTable) {
            return reply.status(404).send({ error: 'Mesa destino no encontrada' });
        }
        const targetOrder = orders.find((order) => order.tableId === body.targetTableId) ?? null;
        const sourceOrders = orders.filter((order) => sourceTableIds.includes(order.tableId));
        if (sourceOrders.length === 0) {
            return reply.status(400).send({ error: 'No hay comandas activas en las mesas origen' });
        }
        const mergedOrder = await client_1.prisma.$transaction(async (tx) => {
            let destinationOrderId = targetOrder?.id ?? null;
            let destinationStatus = targetOrder?.status ?? client_2.OrderStatus.OPEN;
            if (!destinationOrderId) {
                if (sourceOrders.length === 1) {
                    const reassigned = await tx.order.update({
                        where: { id: sourceOrders[0].id },
                        data: {
                            tableId: body.targetTableId,
                        },
                    });
                    destinationOrderId = reassigned.id;
                    destinationStatus = reassigned.status;
                }
                else {
                    let sourceStatus = client_2.OrderStatus.OPEN;
                    if (sourceOrders.some((order) => order.status === client_2.OrderStatus.READY)) {
                        sourceStatus = client_2.OrderStatus.READY;
                    }
                    else if (sourceOrders.some((order) => order.status === client_2.OrderStatus.SENT_TO_KITCHEN)) {
                        sourceStatus = client_2.OrderStatus.SENT_TO_KITCHEN;
                    }
                    const created = await tx.order.create({
                        data: {
                            venueId: body.venueId,
                            tableId: body.targetTableId,
                            userId: request.user.userId,
                            status: sourceStatus,
                        },
                    });
                    destinationOrderId = created.id;
                    destinationStatus = created.status;
                }
            }
            const destinationSourceIds = targetOrder ? sourceTableIds : sourceOrders.filter((order) => order.id !== destinationOrderId).map((order) => order.tableId);
            const ordersToMerge = sourceOrders.filter((order) => destinationSourceIds.includes(order.tableId));
            for (const order of ordersToMerge) {
                if (targetOrder || order.id !== destinationOrderId) {
                    await tx.orderItem.createMany({
                        data: order.items.map((item) => ({
                            orderId: destinationOrderId,
                            productId: item.productId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            vatRate: item.vatRate,
                            notes: item.notes,
                        })),
                    });
                }
                await tx.order.update({
                    where: { id: order.id },
                    data: { status: client_2.OrderStatus.CANCELLED },
                });
            }
            await tx.table.update({
                where: { id: body.targetTableId },
                data: {
                    status: destinationStatus === client_2.OrderStatus.READY
                        ? client_2.TableStatus.ORDERING
                        : destinationStatus === client_2.OrderStatus.SENT_TO_KITCHEN
                            ? client_2.TableStatus.ORDERING
                            : client_2.TableStatus.OCCUPIED,
                },
            });
            if (sourceTableIds.length > 0) {
                await tx.table.updateMany({
                    where: { id: { in: sourceTableIds } },
                    data: { status: client_2.TableStatus.FREE },
                });
            }
            return tx.order.findUnique({
                where: { id: destinationOrderId },
                include: {
                    items: { include: { product: true } },
                    table: true,
                    user: true,
                },
            });
        });
        return reply.send({ data: mergedOrder });
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