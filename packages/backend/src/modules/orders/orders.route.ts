/**
 * Rutas de Pedidos — v2 (con venueId + auto-impresión cocina)
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { OrderStatus, TableStatus } from '@prisma/client';
import { buildCommandaBuffer, buildKitchenMessageBuffer, sendToPrinter } from '../printing/printer.service';
import { buildMenuSummary, decodeMenuSelection, encodeMenuSelection, getVisibleNotes, type MenuCourseTag } from './menuSelection';

const CreateOrderSchema = z.object({
  tableId: z.number().int().positive(),
  venueId: z.number().int().positive(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity:  z.number().int().positive(),
    notes:     z.string().max(500).optional(),
  })).min(1),
});

const AddItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity:  z.number().int().positive(),
  notes:     z.string().max(500).optional(),
});

const SendMenuCourseSchema = z.object({
  course: z.enum(['FIRST', 'SECOND', 'DESSERT', 'COFFEE']),
  productId: z.number().int().positive().optional(),
});

const KitchenNoteSchema = z.object({
  venueId: z.number().int().positive(),
  tableId: z.number().int().positive().optional(),
  reference: z.string().trim().max(80).optional(),
  message: z.string().trim().min(2).max(500),
});

export async function ordersRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  /** POST /api/orders — Crear pedido */
  fastify.post('/', async (request, reply) => {
    const body = CreateOrderSchema.parse(request.body);
    const userId = request.user.userId;

    const products = await prisma.product.findMany({
      where: { id: { in: body.items.map((i) => i.productId) }, venueId: body.venueId, isAvailable: true },
    });
    if (products.length !== body.items.length) {
      return reply.status(400).send({ error: 'Uno o más productos no están disponibles en esta sede' });
    }

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          venueId: body.venueId,
          tableId: body.tableId,
          userId,
          status: OrderStatus.OPEN,
          items: {
            create: body.items.map((item) => {
              const product = products.find((p) => p.id === item.productId)!;
              return { productId: item.productId, quantity: item.quantity, unitPrice: product.price, vatRate: product.vatRate, notes: item.notes };
            }),
          },
        },
        include: { items: { include: { product: true } }, table: true },
      });
      await tx.table.update({ where: { id: body.tableId }, data: { status: TableStatus.OCCUPIED } });
      return newOrder;
    });
    return reply.status(201).send({ data: order });
  });

  /** GET /api/orders/table/:tableId?venueId= — Pedido activo de una mesa */
  fastify.get<{ Params: { tableId: string }; Querystring: { venueId?: string } }>(
    '/table/:tableId', async (request, reply) => {
      const venueId = parseInt(request.query.venueId ?? '0', 10);
      const order = await prisma.order.findFirst({
        where: {
          tableId: parseInt(request.params.tableId, 10),
          venueId,
          status: { in: [OrderStatus.OPEN, OrderStatus.SENT_TO_KITCHEN, OrderStatus.READY] },
        },
        include: {
          items: { include: { product: { include: { category: true } } } },
          table: true,
          user: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ data: order ?? null });
    }
  );

  /** POST /api/orders/:id/items */
  fastify.post<{ Params: { id: string } }>('/:id/items', async (request, reply) => {
    const orderId = parseInt(request.params.id, 10);
    const body = AddItemSchema.parse(request.body);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' });
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || !product.isAvailable) return reply.status(400).send({ error: 'Producto no disponible' });
    const item = await prisma.orderItem.create({
      data: { orderId, productId: body.productId, quantity: body.quantity, unitPrice: product.price, vatRate: product.vatRate, notes: body.notes },
      include: { product: true },
    });
    return reply.status(201).send({ data: item });
  });

  /** POST /api/orders/kitchen-note — Imprime un aviso manual a cocina */
  fastify.post('/kitchen-note', async (request, reply) => {
    const body = KitchenNoteSchema.parse(request.body);

    const [waiter, kitchenPrinters, table] = await Promise.all([
      prisma.user.findUnique({ where: { id: request.user.userId }, select: { name: true } }),
      prisma.printer.findMany({ where: { venueId: body.venueId, type: 'KITCHEN', isActive: true } }),
      body.tableId
        ? prisma.table.findUnique({ where: { id: body.tableId }, select: { number: true, name: true } })
        : Promise.resolve(null),
    ]);

    if (kitchenPrinters.length === 0) {
      return reply.status(404).send({ error: 'No hay impresoras de cocina activas en esta sede' });
    }

    const reference = body.reference?.trim()
      || (table ? `Mesa ${table.number}${table.name ? ` · ${table.name}` : ''}` : undefined);

    const buf = buildKitchenMessageBuffer({
      message: body.message,
      waiterName: waiter?.name ?? request.user.email,
      reference,
      createdAt: new Date(),
    });

    await Promise.all(
      kitchenPrinters.map((printer) =>
        sendToPrinter({ ipAddress: printer.ipAddress, port: printer.port }, buf)
      )
    );

    return reply.send({ success: true });
  });

  /** DELETE /api/orders/:id/items/:itemId */
  fastify.delete<{ Params: { id: string; itemId: string } }>('/:id/items/:itemId', async (request, reply) => {
    const orderId = parseInt(request.params.id, 10);
    const itemId  = parseInt(request.params.itemId, 10);
    const order   = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== OrderStatus.OPEN) {
      return reply.status(400).send({ error: 'Solo se pueden modificar pedidos abiertos' });
    }
    await prisma.orderItem.delete({ where: { id: itemId, orderId } });
    return reply.send({ success: true });
  });

  /**
   * PATCH /api/orders/:id/send-kitchen
   * Marca el pedido como enviado a cocina y AUTO-IMPRIME en impresoras KITCHEN.
   */
  fastify.patch<{ Params: { id: string } }>('/:id/send-kitchen', async (request, reply) => {
    const orderId = parseInt(request.params.id, 10);

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.SENT_TO_KITCHEN },
      include: {
        items: { include: { product: true } },
        table: true,
        user: true,
      },
    });

    // ── AUTO-IMPRESIÓN EN COCINA ──────────────────────────────────────────────
    // Se buscan las impresoras de tipo KITCHEN activas en la sede del pedido.
    // El envío es asíncrono y no bloquea la respuesta al frontend.
    prisma.printer
      .findMany({ where: { venueId: order.venueId, type: 'KITCHEN', isActive: true } })
      .then((kitchenPrinters) => {
        if (kitchenPrinters.length === 0) return;
        const printableItems = order.items.reduce<Array<{ name: string; quantity: number; description?: string; notes?: string }>>((acc, item) => {
          const menuSelection = decodeMenuSelection(item.notes);
          if (menuSelection) return acc;

          acc.push({
            name: item.product.name,
            quantity: item.quantity,
            description: item.product.description ?? undefined,
            notes: getVisibleNotes(item.notes),
          });
          return acc;
        }, []);

        if (printableItems.length === 0) return;

        const buf = buildCommandaBuffer({
          tableNumber: order.table.number,
          waiterName:  order.user.name,
          orderTime:   new Date(),
          items: printableItems,
        });
        for (const printer of kitchenPrinters) {
          sendToPrinter({ ipAddress: printer.ipAddress, port: printer.port }, buf)
            .catch((e) => console.error(`[Kitchen] Error impresora ${printer.name} (${printer.ipAddress}):`, e));
        }
      })
      .catch((e) => console.error('[Kitchen] Error buscando impresoras:', e));

    return reply.send({ data: order });
  });

  /** POST /api/orders/:id/items/:itemId/send-menu-course — Manda un pase de menú concreto a cocina */
  fastify.post<{ Params: { id: string; itemId: string } }>(
    '/:id/items/:itemId/send-menu-course', async (request, reply) => {
      const orderId = parseInt(request.params.id, 10);
      const itemId = parseInt(request.params.itemId, 10);
      const body = SendMenuCourseSchema.parse(request.body);

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { table: true, user: true },
      });
      if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' });
      if (order.status === OrderStatus.CLOSED || order.status === OrderStatus.CANCELLED) {
        return reply.status(400).send({ error: 'El pedido no admite más comandas' });
      }

      const orderItem = await prisma.orderItem.findUnique({
        where: { id: itemId, orderId },
        include: { product: true },
      });
      if (!orderItem) return reply.status(404).send({ error: 'Línea no encontrada' });

      const menuSelection = decodeMenuSelection(orderItem.notes);
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

      const selectedProduct = await prisma.product.findUnique({
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

      await prisma.orderItem.update({
        where: { id: itemId },
        data: { notes: encodeMenuSelection(nextSelection) },
      });

      prisma.printer
        .findMany({ where: { venueId: order.venueId, type: 'KITCHEN', isActive: true } })
        .then((kitchenPrinters) => {
          if (kitchenPrinters.length === 0) return;
          const courseLabel: Record<MenuCourseTag, string> = {
            FIRST: 'Primero',
            SECOND: 'Segundo',
            DESSERT: 'Postre',
            COFFEE: 'Cafe',
          };
          const buf = buildCommandaBuffer({
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
            sendToPrinter({ ipAddress: printer.ipAddress, port: printer.port }, buf)
              .catch((e) => console.error(`[Kitchen] Error impresora ${printer.name} (${printer.ipAddress}):`, e));
          }
        })
        .catch((e) => console.error('[Kitchen] Error buscando impresoras:', e));

      return reply.send({
        success: true,
        summary: buildMenuSummary(nextSelection),
      });
    }
  );

  /** POST /api/orders/:id/items/:itemId/cancel — Cancelar/Reducir item enviado */
  fastify.post<{ Params: { id: string; itemId: string }; Body: { quantity: number } }>(
    '/:id/items/:itemId/cancel', async (request, reply) => {
      const orderId = parseInt(request.params.id, 10);
      const itemId  = parseInt(request.params.itemId, 10);
      const body    = z.object({ quantity: z.number().int().positive() }).parse(request.body);

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { table: true, user: true },
      });
      if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' });

      if (order.status === OrderStatus.CLOSED || order.status === OrderStatus.CANCELLED) {
        return reply.status(400).send({ error: 'No se pueden cancelar artículos de un pedido cerrado o cancelado' });
      }

      const orderItem = await prisma.orderItem.findUnique({
        where: { id: itemId, orderId },
        include: { product: true },
      });
      if (!orderItem) return reply.status(404).send({ error: 'Artículo no encontrado' });

      if (body.quantity > orderItem.quantity) {
        return reply.status(400).send({ error: 'La cantidad a cancelar supera la existente' });
      }

      const newQty = orderItem.quantity - body.quantity;

      await prisma.$transaction(async (tx) => {
        if (newQty <= 0) {
          await tx.orderItem.delete({ where: { id: itemId } });
        } else {
          await tx.orderItem.update({
            where: { id: itemId },
            data: { quantity: newQty },
          });
        }

        const remainingCount = await tx.orderItem.count({ where: { orderId } });
        if (remainingCount === 0) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.CANCELLED },
          });
          await tx.table.update({
            where: { id: order.tableId },
            data: { status: TableStatus.FREE },
          });
        }
      });

      // ── AUTO-IMPRESIÓN EN COCINA ──────────────────────────────────────────────
      prisma.printer
        .findMany({ where: { venueId: order.venueId, type: 'KITCHEN', isActive: true } })
        .then((kitchenPrinters) => {
          if (kitchenPrinters.length === 0) return;
          const buf = buildCommandaBuffer({
            tableNumber: order.table.number,
            waiterName:  order.user.name,
            orderTime:   new Date(),
            items: [{
              name: orderItem.product.name,
              quantity: -body.quantity, // Cantidad negativa para indicar cancelación
              description: orderItem.product.description ?? undefined,
              notes: getVisibleNotes(orderItem.notes),
            }],
            isCancellation: true,
          });
          for (const printer of kitchenPrinters) {
            sendToPrinter({ ipAddress: printer.ipAddress, port: printer.port }, buf)
              .catch((e) => console.error(`[Kitchen] Error impresora ${printer.name} (${printer.ipAddress}):`, e));
          }
        })
        .catch((e) => console.error('[Kitchen] Error buscando impresoras:', e));

      return reply.send({ success: true });
    }
  );

  /** PATCH /api/orders/:id/cancel-and-free — Cancelar pedido completo y liberar mesa sin mandar comanda de cancelación */
  fastify.patch<{ Params: { id: string } }>('/:id/cancel-and-free', async (request, reply) => {
    const orderId = parseInt(request.params.id, 10);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true },
    });
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' });

    if (order.status === OrderStatus.CLOSED || order.status === OrderStatus.CANCELLED) {
      return reply.status(400).send({ error: 'El pedido ya está cerrado o cancelado' });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const uOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      await tx.table.update({
        where: { id: order.tableId },
        data: { status: TableStatus.FREE },
      });
      return uOrder;
    });

    return reply.send({ data: updatedOrder });
  });
}
