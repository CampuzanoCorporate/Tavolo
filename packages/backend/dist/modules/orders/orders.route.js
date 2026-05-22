"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ordersRoutes = ordersRoutes;
const zod_1 = require("zod");
const client_1 = require("../../db/client");
const client_2 = require("@prisma/client");
const printer_service_1 = require("../printing/printer.service");
const menuSelection_1 = require("./menuSelection");
const CreateOrderSchema = zod_1.z.object({
    tableId: zod_1.z.number().int().positive(),
    venueId: zod_1.z.number().int().positive(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.number().int().positive(),
        quantity: zod_1.z.number().int().positive(),
        notes: zod_1.z.string().max(500).optional(),
    })).min(1),
});
const AddItemSchema = zod_1.z.object({
    productId: zod_1.z.number().int().positive(),
    quantity: zod_1.z.number().int().positive(),
    notes: zod_1.z.string().max(500).optional(),
});
const SendMenuCourseSchema = zod_1.z.object({
    course: zod_1.z.enum(['FIRST', 'SECOND', 'DESSERT', 'COFFEE']),
    productId: zod_1.z.number().int().positive().optional(),
});
const KitchenNoteSchema = zod_1.z.object({
    venueId: zod_1.z.number().int().positive(),
    tableId: zod_1.z.number().int().positive().optional(),
    reference: zod_1.z.string().trim().max(80).optional(),
    message: zod_1.z.string().trim().min(2).max(500),
});
async function ordersRoutes(fastify) {
    fastify.addHook('onRequest', fastify.authenticate);
    /** POST /api/orders — Crear pedido */
    fastify.post('/', async (request, reply) => {
        const body = CreateOrderSchema.parse(request.body);
        const userId = request.user.userId;
        const products = await client_1.prisma.product.findMany({
            where: { id: { in: body.items.map((i) => i.productId) }, venueId: body.venueId, isAvailable: true },
        });
        if (products.length !== body.items.length) {
            return reply.status(400).send({ error: 'Uno o más productos no están disponibles en esta sede' });
        }
        const order = await client_1.prisma.$transaction(async (tx) => {
            const newOrder = await tx.order.create({
                data: {
                    venueId: body.venueId,
                    tableId: body.tableId,
                    userId,
                    status: client_2.OrderStatus.OPEN,
                    items: {
                        create: body.items.map((item) => {
                            const product = products.find((p) => p.id === item.productId);
                            return { productId: item.productId, quantity: item.quantity, unitPrice: product.price, vatRate: product.vatRate, notes: item.notes };
                        }),
                    },
                },
                include: { items: { include: { product: true } }, table: true },
            });
            await tx.table.update({ where: { id: body.tableId }, data: { status: client_2.TableStatus.OCCUPIED } });
            return newOrder;
        });
        return reply.status(201).send({ data: order });
    });
    /** GET /api/orders/table/:tableId?venueId= — Pedido activo de una mesa */
    fastify.get('/table/:tableId', async (request, reply) => {
        const venueId = parseInt(request.query.venueId ?? '0', 10);
        const order = await client_1.prisma.order.findFirst({
            where: {
                tableId: parseInt(request.params.tableId, 10),
                venueId,
                status: { in: [client_2.OrderStatus.OPEN, client_2.OrderStatus.SENT_TO_KITCHEN, client_2.OrderStatus.READY] },
            },
            include: {
                items: { include: { product: { include: { category: true } } } },
                table: true,
                user: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return reply.send({ data: order ?? null });
    });
    /** POST /api/orders/:id/items */
    fastify.post('/:id/items', async (request, reply) => {
        const orderId = parseInt(request.params.id, 10);
        const body = AddItemSchema.parse(request.body);
        const order = await client_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            return reply.status(404).send({ error: 'Pedido no encontrado' });
        const product = await client_1.prisma.product.findUnique({ where: { id: body.productId } });
        if (!product || !product.isAvailable)
            return reply.status(400).send({ error: 'Producto no disponible' });
        const item = await client_1.prisma.orderItem.create({
            data: { orderId, productId: body.productId, quantity: body.quantity, unitPrice: product.price, vatRate: product.vatRate, notes: body.notes },
            include: { product: true },
        });
        return reply.status(201).send({ data: item });
    });
    /** POST /api/orders/kitchen-note — Imprime un aviso manual a cocina */
    fastify.post('/kitchen-note', async (request, reply) => {
        const body = KitchenNoteSchema.parse(request.body);
        const [waiter, kitchenPrinters, table] = await Promise.all([
            client_1.prisma.user.findUnique({ where: { id: request.user.userId }, select: { name: true } }),
            client_1.prisma.printer.findMany({ where: { venueId: body.venueId, type: 'KITCHEN', isActive: true } }),
            body.tableId
                ? client_1.prisma.table.findUnique({ where: { id: body.tableId }, select: { number: true, name: true } })
                : Promise.resolve(null),
        ]);
        if (kitchenPrinters.length === 0) {
            return reply.status(404).send({ error: 'No hay impresoras de cocina activas en esta sede' });
        }
        const reference = body.reference?.trim()
            || (table ? `Mesa ${table.number}${table.name ? ` · ${table.name}` : ''}` : undefined);
        const buf = (0, printer_service_1.buildKitchenMessageBuffer)({
            message: body.message,
            waiterName: waiter?.name ?? request.user.email,
            reference,
            createdAt: new Date(),
        });
        await Promise.all(kitchenPrinters.map((printer) => (0, printer_service_1.sendToPrinter)({ ipAddress: printer.ipAddress, port: printer.port }, buf)));
        return reply.send({ success: true });
    });
    /** DELETE /api/orders/:id/items/:itemId */
    fastify.delete('/:id/items/:itemId', async (request, reply) => {
        const orderId = parseInt(request.params.id, 10);
        const itemId = parseInt(request.params.itemId, 10);
        const order = await client_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order || order.status !== client_2.OrderStatus.OPEN) {
            return reply.status(400).send({ error: 'Solo se pueden modificar pedidos abiertos' });
        }
        await client_1.prisma.orderItem.delete({ where: { id: itemId, orderId } });
        return reply.send({ success: true });
    });
    /**
     * PATCH /api/orders/:id/send-kitchen
     * Marca el pedido como enviado a cocina y AUTO-IMPRIME en impresoras KITCHEN.
     */
    fastify.patch('/:id/send-kitchen', async (request, reply) => {
        const orderId = parseInt(request.params.id, 10);
        const order = await client_1.prisma.order.update({
            where: { id: orderId },
            data: { status: client_2.OrderStatus.SENT_TO_KITCHEN },
            include: {
                items: { include: { product: true } },
                table: true,
                user: true,
            },
        });
        // ── AUTO-IMPRESIÓN EN COCINA ──────────────────────────────────────────────
        // Se buscan las impresoras de tipo KITCHEN activas en la sede del pedido.
        // El envío es asíncrono y no bloquea la respuesta al frontend.
        client_1.prisma.printer
            .findMany({ where: { venueId: order.venueId, type: 'KITCHEN', isActive: true } })
            .then((kitchenPrinters) => {
            if (kitchenPrinters.length === 0)
                return;
            const printableItems = order.items.reduce((acc, item) => {
                const menuSelection = (0, menuSelection_1.decodeMenuSelection)(item.notes);
                if (menuSelection)
                    return acc;
                acc.push({
                    name: item.product.name,
                    quantity: item.quantity,
                    description: item.product.description ?? undefined,
                    notes: (0, menuSelection_1.getVisibleNotes)(item.notes),
                });
                return acc;
            }, []);
            if (printableItems.length === 0)
                return;
            const buf = (0, printer_service_1.buildCommandaBuffer)({
                tableNumber: order.table.number,
                waiterName: order.user.name,
                orderTime: new Date(),
                items: printableItems,
            });
            for (const printer of kitchenPrinters) {
                (0, printer_service_1.sendToPrinter)({ ipAddress: printer.ipAddress, port: printer.port }, buf)
                    .catch((e) => console.error(`[Kitchen] Error impresora ${printer.name} (${printer.ipAddress}):`, e));
            }
        })
            .catch((e) => console.error('[Kitchen] Error buscando impresoras:', e));
        return reply.send({ data: order });
    });
    /** POST /api/orders/:id/items/:itemId/send-menu-course — Manda un pase de menú concreto a cocina */
    fastify.post('/:id/items/:itemId/send-menu-course', async (request, reply) => {
        const orderId = parseInt(request.params.id, 10);
        const itemId = parseInt(request.params.itemId, 10);
        const body = SendMenuCourseSchema.parse(request.body);
        const order = await client_1.prisma.order.findUnique({
            where: { id: orderId },
            include: { table: true, user: true },
        });
        if (!order)
            return reply.status(404).send({ error: 'Pedido no encontrado' });
        if (order.status === client_2.OrderStatus.CLOSED || order.status === client_2.OrderStatus.CANCELLED) {
            return reply.status(400).send({ error: 'El pedido no admite más comandas' });
        }
        const orderItem = await client_1.prisma.orderItem.findUnique({
            where: { id: itemId, orderId },
            include: { product: true },
        });
        if (!orderItem)
            return reply.status(404).send({ error: 'Línea no encontrada' });
        const menuSelection = (0, menuSelection_1.decodeMenuSelection)(orderItem.notes);
        if (!menuSelection) {
            return reply.status(400).send({ error: 'Esta línea no es un menú por pases' });
        }
        const existingCourse = menuSelection.courses[body.course];
        if (existingCourse?.sent) {
            return reply.status(400).send({ error: 'Ese pase ya se ha enviado a cocina' });
        }
        const selectedProductId = body.productId ?? existingCourse?.productId;
        if (!selectedProductId) {
            return reply.status(400).send({ error: 'Debes elegir el producto antes de mandar este pase' });
        }
        const selectedProduct = await client_1.prisma.product.findUnique({
            where: { id: selectedProductId },
        });
        if (!selectedProduct || selectedProduct.venueId !== order.venueId) {
            return reply.status(400).send({ error: 'Producto de menú no válido para esta sede' });
        }
        const nextSelection = {
            ...menuSelection,
            courses: {
                ...menuSelection.courses,
                [body.course]: {
                    productId: selectedProduct.id,
                    name: selectedProduct.name,
                    sent: true,
                },
            },
        };
        await client_1.prisma.orderItem.update({
            where: { id: itemId },
            data: { notes: (0, menuSelection_1.encodeMenuSelection)(nextSelection) },
        });
        client_1.prisma.printer
            .findMany({ where: { venueId: order.venueId, type: 'KITCHEN', isActive: true } })
            .then((kitchenPrinters) => {
            if (kitchenPrinters.length === 0)
                return;
            const courseLabel = {
                FIRST: 'Primero',
                SECOND: 'Segundo',
                DESSERT: 'Postre',
                COFFEE: 'Cafe',
            };
            const buf = (0, printer_service_1.buildCommandaBuffer)({
                tableNumber: order.table.number,
                waiterName: order.user.name,
                orderTime: new Date(),
                items: [{
                        name: selectedProduct.name,
                        quantity: orderItem.quantity,
                        description: selectedProduct.description ?? undefined,
                        notes: `${orderItem.product.name} · ${courseLabel[body.course]}`,
                    }],
            });
            for (const printer of kitchenPrinters) {
                (0, printer_service_1.sendToPrinter)({ ipAddress: printer.ipAddress, port: printer.port }, buf)
                    .catch((e) => console.error(`[Kitchen] Error impresora ${printer.name} (${printer.ipAddress}):`, e));
            }
        })
            .catch((e) => console.error('[Kitchen] Error buscando impresoras:', e));
        return reply.send({
            success: true,
            summary: (0, menuSelection_1.buildMenuSummary)(nextSelection),
        });
    });
    /** POST /api/orders/:id/items/:itemId/cancel — Cancelar/Reducir item enviado */
    fastify.post('/:id/items/:itemId/cancel', async (request, reply) => {
        const orderId = parseInt(request.params.id, 10);
        const itemId = parseInt(request.params.itemId, 10);
        const body = zod_1.z.object({ quantity: zod_1.z.number().int().positive() }).parse(request.body);
        const order = await client_1.prisma.order.findUnique({
            where: { id: orderId },
            include: { table: true, user: true },
        });
        if (!order)
            return reply.status(404).send({ error: 'Pedido no encontrado' });
        if (order.status === client_2.OrderStatus.CLOSED || order.status === client_2.OrderStatus.CANCELLED) {
            return reply.status(400).send({ error: 'No se pueden cancelar artículos de un pedido cerrado o cancelado' });
        }
        const orderItem = await client_1.prisma.orderItem.findUnique({
            where: { id: itemId, orderId },
            include: { product: true },
        });
        if (!orderItem)
            return reply.status(404).send({ error: 'Artículo no encontrado' });
        if (body.quantity > orderItem.quantity) {
            return reply.status(400).send({ error: 'La cantidad a cancelar supera la existente' });
        }
        const newQty = orderItem.quantity - body.quantity;
        await client_1.prisma.$transaction(async (tx) => {
            if (newQty <= 0) {
                await tx.orderItem.delete({ where: { id: itemId } });
            }
            else {
                await tx.orderItem.update({
                    where: { id: itemId },
                    data: { quantity: newQty },
                });
            }
            const remainingCount = await tx.orderItem.count({ where: { orderId } });
            if (remainingCount === 0) {
                await tx.order.update({
                    where: { id: orderId },
                    data: { status: client_2.OrderStatus.CANCELLED },
                });
                await tx.table.update({
                    where: { id: order.tableId },
                    data: { status: client_2.TableStatus.FREE },
                });
            }
        });
        // ── AUTO-IMPRESIÓN EN COCINA ──────────────────────────────────────────────
        client_1.prisma.printer
            .findMany({ where: { venueId: order.venueId, type: 'KITCHEN', isActive: true } })
            .then((kitchenPrinters) => {
            if (kitchenPrinters.length === 0)
                return;
            const buf = (0, printer_service_1.buildCommandaBuffer)({
                tableNumber: order.table.number,
                waiterName: order.user.name,
                orderTime: new Date(),
                items: [{
                        name: orderItem.product.name,
                        quantity: -body.quantity, // Cantidad negativa para indicar cancelación
                        description: orderItem.product.description ?? undefined,
                        notes: (0, menuSelection_1.getVisibleNotes)(orderItem.notes),
                    }],
                isCancellation: true,
            });
            for (const printer of kitchenPrinters) {
                (0, printer_service_1.sendToPrinter)({ ipAddress: printer.ipAddress, port: printer.port }, buf)
                    .catch((e) => console.error(`[Kitchen] Error impresora ${printer.name} (${printer.ipAddress}):`, e));
            }
        })
            .catch((e) => console.error('[Kitchen] Error buscando impresoras:', e));
        return reply.send({ success: true });
    });
    /** PATCH /api/orders/:id/cancel-and-free — Cancelar pedido completo y liberar mesa sin mandar comanda de cancelación */
    fastify.patch('/:id/cancel-and-free', async (request, reply) => {
        const orderId = parseInt(request.params.id, 10);
        const order = await client_1.prisma.order.findUnique({
            where: { id: orderId },
            include: { table: true },
        });
        if (!order)
            return reply.status(404).send({ error: 'Pedido no encontrado' });
        if (order.status === client_2.OrderStatus.CLOSED || order.status === client_2.OrderStatus.CANCELLED) {
            return reply.status(400).send({ error: 'El pedido ya está cerrado o cancelado' });
        }
        const updatedOrder = await client_1.prisma.$transaction(async (tx) => {
            const uOrder = await tx.order.update({
                where: { id: orderId },
                data: { status: client_2.OrderStatus.CANCELLED },
            });
            await tx.table.update({
                where: { id: order.tableId },
                data: { status: client_2.TableStatus.FREE },
            });
            return uOrder;
        });
        return reply.send({ data: updatedOrder });
    });
}
//# sourceMappingURL=orders.route.js.map