/**
 * Rutas de Mesas — v2 (filtrado por venueId)
 */
import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/client';
import { OrderStatus, TableStatus } from '@prisma/client';
import { z } from 'zod';
import { requirePermission } from '../auth/guards';

const MergeTablesSchema = z.object({
  venueId: z.number().int().positive(),
  targetTableId: z.number().int().positive(),
  sourceTableIds: z.array(z.number().int().positive()).min(1),
});

export async function tablesRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  /** GET /api/tables?venueId= */
  fastify.get<{ Querystring: { venueId?: string } }>('/', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!venueId) return reply.status(400).send({ error: 'venueId requerido' });

    const [tables, activeOrders] = await Promise.all([
      prisma.table.findMany({
        where: { venueId },
        orderBy: [{ zone: 'asc' }, { number: 'asc' }],
      }),
      prisma.order.findMany({
        where: {
          venueId,
          status: { in: [OrderStatus.OPEN, OrderStatus.SENT_TO_KITCHEN, OrderStatus.READY] },
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
        kitchenReady: activeOrder?.status === OrderStatus.READY,
      };
    });

    return reply.send({ data: enrichedTables });
  });

  /** POST /api/tables/merge — Unir mesas activas en una mesa destino */
  fastify.post('/merge', async (request, reply) => {
    if (!requirePermission(request, reply, 'MERGE_TABLES')) return;
    const body = MergeTablesSchema.parse(request.body);
    const sourceTableIds = Array.from(new Set(body.sourceTableIds.filter((id) => id !== body.targetTableId)));

    if (sourceTableIds.length === 0) {
      return reply.status(400).send({ error: 'Debes indicar al menos una mesa origen distinta de la destino' });
    }

    const involvedTableIds = [body.targetTableId, ...sourceTableIds];
    const [tables, orders] = await Promise.all([
      prisma.table.findMany({
        where: { id: { in: involvedTableIds }, venueId: body.venueId },
      }),
      prisma.order.findMany({
        where: {
          venueId: body.venueId,
          tableId: { in: involvedTableIds },
          status: { in: [OrderStatus.OPEN, OrderStatus.SENT_TO_KITCHEN, OrderStatus.READY] },
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

    const mergedOrder = await prisma.$transaction(async (tx) => {
      let destinationOrderId = targetOrder?.id ?? null;
      let destinationStatus = targetOrder?.status ?? OrderStatus.OPEN;

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
        } else {
          let sourceStatus: OrderStatus = OrderStatus.OPEN;
          if (sourceOrders.some((order) => order.status === OrderStatus.READY)) {
            sourceStatus = OrderStatus.READY;
          } else if (sourceOrders.some((order) => order.status === OrderStatus.SENT_TO_KITCHEN)) {
            sourceStatus = OrderStatus.SENT_TO_KITCHEN;
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
              orderId: destinationOrderId!,
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
          data: { status: OrderStatus.CANCELLED },
        });
      }

      await tx.table.update({
        where: { id: body.targetTableId },
        data: {
          status: destinationStatus === OrderStatus.READY
            ? TableStatus.ORDERING
            : destinationStatus === OrderStatus.SENT_TO_KITCHEN
              ? TableStatus.ORDERING
              : TableStatus.OCCUPIED,
        },
      });

      if (sourceTableIds.length > 0) {
        await tx.table.updateMany({
          where: { id: { in: sourceTableIds } },
          data: { status: TableStatus.FREE },
        });
      }

      return tx.order.findUnique({
        where: { id: destinationOrderId! },
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
  fastify.patch<{ Params: { id: string }; Body: { status: TableStatus } }>(
    '/:id/status', async (request, reply) => {
      const table = await prisma.table.update({
        where: { id: parseInt(request.params.id, 10) },
        data: { status: request.body.status },
      });
      return reply.send({ data: table });
    }
  );

  /** PATCH /api/tables/:id/request-bill */
  fastify.patch<{ Params: { id: string } }>('/:id/request-bill', async (request, reply) => {
    const table = await prisma.table.update({
      where: { id: parseInt(request.params.id, 10) },
      data: { status: TableStatus.BILL_REQUESTED },
    });
    return reply.send({ data: table });
  });

  /** GET /api/tables/:id */
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const table = await prisma.table.findUnique({
      where: { id: parseInt(request.params.id, 10) },
    });
    if (!table) return reply.status(404).send({ error: 'Mesa no encontrada' });
    return reply.send({ data: table });
  });
}
