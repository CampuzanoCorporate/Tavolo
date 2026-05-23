/**
 * Rutas de Pedidos — v2 (con venueId + auto-impresión cocina)
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { OrderStatus, Prisma, ProductionItemStatus, ProductionSourceType, TableStatus } from '@prisma/client';
import { buildCommandaBuffer, buildKitchenMessageBuffer, sendToPrinter } from '../printing/printer.service';
import { buildMenuSummary, decodeMenuSelection, encodeMenuSelection, getVisibleNotes, type MenuCourseTag } from './menuSelection';
import { requirePermission } from '../auth/guards';

const CreateOrderSchema = z.object({
  tableId: z.number().int().positive(),
  venueId: z.number().int().positive(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity:  z.number().int().positive(),
    unitPrice: z.coerce.number().nonnegative().optional(),
    notes:     z.string().max(500).nullable().optional(),
  })).min(1),
});

const AddItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity:  z.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  notes:     z.string().max(500).nullable().optional(),
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

const UpdateProductionItemSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'READY']),
});

const MarkKitchenReadySchema = z.object({
  stationId: z.number().int().positive().optional(),
});

function getCourseLabel(course: MenuCourseTag) {
  const labels: Record<MenuCourseTag, string> = {
    FIRST: 'Primero',
    SECOND: 'Segundo',
    DESSERT: 'Postre',
    COFFEE: 'Cafe',
  };

  return labels[course];
}

type ProductionPrintEntry = {
  sourceKey: string;
  orderId: number;
  orderItemId?: number;
  stationId?: number | null;
  productName: string;
  quantity: number;
  description?: string;
  notes?: string;
  courseTag?: string;
  sourceMenuName?: string;
};

function resolvePreparationStationId(product: { preparationStationId: number | null; category?: { preparationStationId: number | null } | null }) {
  return product.preparationStationId ?? product.category?.preparationStationId ?? null;
}

async function syncOrderProductionStatus(
  tx: Prisma.TransactionClient,
  orderId: number,
  tableId: number,
) {
  const pendingCount = await tx.productionItem.count({
    where: {
      orderId,
      status: { in: [ProductionItemStatus.PENDING, ProductionItemStatus.IN_PROGRESS] },
    },
  });

  if (pendingCount === 0) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.READY },
    });
    await tx.table.update({
      where: { id: tableId },
      data: { status: TableStatus.ORDERING },
    });
    return;
  }

  await tx.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.SENT_TO_KITCHEN },
  });
  await tx.table.update({
    where: { id: tableId },
    data: { status: TableStatus.ORDERING },
  });
}

async function printProductionEntries(params: {
  venueId: number;
  tableNumber: number;
  waiterName: string;
  items: ProductionPrintEntry[];
  isCancellation?: boolean;
}) {
  const { venueId, tableNumber, waiterName, items, isCancellation = false } = params;
  if (items.length === 0) return;

  const [stations, fallbackPrinter] = await Promise.all([
    prisma.productionStation.findMany({
      where: {
        venueId,
        id: { in: Array.from(new Set(items.map((item) => item.stationId).filter((value): value is number => typeof value === 'number'))) },
      },
      include: { printer: true },
    }),
    prisma.printer.findFirst({
      where: {
        venueId,
        type: 'KITCHEN',
        isActive: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const stationMap = new Map<number, (typeof stations)[number]>(stations.map((station) => [station.id, station]));
  const printableGroups = new Map<string, {
    printer: { name: string; ipAddress: string; port: number };
    entries: ProductionPrintEntry[];
  }>();

  for (const item of items) {
    const station = typeof item.stationId === 'number' ? stationMap.get(item.stationId) : undefined;
    const printer = station?.printer && station.printer.isActive
      ? station.printer
      : fallbackPrinter;

    if (!printer) continue;

    const key = `${printer.id}`;
    const current = printableGroups.get(key);
    if (current) {
      current.entries.push(item);
    } else {
      printableGroups.set(key, {
        printer,
        entries: [item],
      });
    }
  }

  await Promise.all(
    Array.from(printableGroups.values()).map(async ({ printer, entries }) => {
      const buf = buildCommandaBuffer({
        tableNumber,
        waiterName,
        orderTime: new Date(),
        isCancellation,
        items: entries.map((entry) => ({
          name: entry.productName,
          quantity: isCancellation ? -Math.abs(entry.quantity) : entry.quantity,
          description: entry.description,
          notes: entry.notes,
        })),
      });
      await sendToPrinter({ ipAddress: printer.ipAddress, port: printer.port }, buf);
    }),
  );
}

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
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice ?? product.price,
                vatRate: product.vatRate,
                notes: item.notes,
              };
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

  /** GET /api/orders/production-stations?venueId= — Secciones operativas para cocina/freidoras */
  fastify.get<{ Querystring: { venueId?: string } }>('/production-stations', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!Number.isFinite(venueId) || venueId <= 0) {
      return reply.status(400).send({ error: 'venueId es obligatorio' });
    }

    const stations = await prisma.productionStation.findMany({
      where: { venueId, isActive: true },
      include: { printer: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return reply.send({ data: stations });
  });

  /** GET /api/orders/kitchen/queue?venueId= — Cola viva para pantalla de cocina */
  fastify.get<{ Querystring: { venueId?: string; stationId?: string } }>('/kitchen/queue', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!Number.isFinite(venueId) || venueId <= 0) {
      return reply.status(400).send({ error: 'venueId es obligatorio' });
    }
    const stationId = parseInt(request.query.stationId ?? '0', 10);

    const productionItems = await prisma.productionItem.findMany({
      where: {
        order: {
          venueId,
          status: { in: [OrderStatus.OPEN, OrderStatus.SENT_TO_KITCHEN, OrderStatus.READY] },
        },
        status: { in: [ProductionItemStatus.PENDING, ProductionItemStatus.IN_PROGRESS] },
        ...(stationId > 0 ? { stationId } : {}),
      },
      include: {
        order: {
          include: {
            table: true,
            user: true,
          },
        },
        station: true,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    const items: Array<{
      id: string;
      productionItemId: number;
      orderId: number;
      orderItemId: number;
      tableId: number;
      tableNumber: number;
      tableName?: string;
      waiterName: string;
      stationId?: number | null;
      stationName?: string;
      productName: string;
      quantity: number;
      description?: string;
      notes?: string;
      courseLabel?: string;
      sourceMenuName?: string;
      status: 'PENDING' | 'IN_PROGRESS' | 'READY';
      createdAt: string;
    }> = [];

    for (const item of productionItems) {
      items.push({
        id: item.sourceKey,
        productionItemId: item.id,
        orderId: item.orderId,
        orderItemId: item.orderItemId ?? 0,
        tableId: item.order.tableId,
        tableNumber: item.order.table.number,
        tableName: item.order.table.name ?? undefined,
        waiterName: item.order.user.name,
        stationId: item.stationId,
        stationName: item.station?.name ?? undefined,
        productName: item.productName,
        quantity: item.quantity,
        description: item.description ?? undefined,
        notes: item.notes ?? undefined,
        courseLabel: item.courseTag ? getCourseLabel(item.courseTag as MenuCourseTag) : undefined,
        sourceMenuName: item.sourceMenuName ?? undefined,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      });
    }

    const summaryMap = new Map<string, { productName: string; totalQuantity: number; tables: Map<number, { tableNumber: number; quantity: number }> }>();
    for (const item of items) {
      const current = summaryMap.get(item.productName) ?? {
        productName: item.productName,
        totalQuantity: 0,
        tables: new Map<number, { tableNumber: number; quantity: number }>(),
      };

      current.totalQuantity += item.quantity;
      const tableLine = current.tables.get(item.tableNumber) ?? { tableNumber: item.tableNumber, quantity: 0 };
      tableLine.quantity += item.quantity;
      current.tables.set(item.tableNumber, tableLine);
      summaryMap.set(item.productName, current);
    }

    const summary = Array.from(summaryMap.values())
      .map((entry) => ({
        productName: entry.productName,
        totalQuantity: entry.totalQuantity,
        tables: Array.from(entry.tables.values()).sort((a, b) => a.tableNumber - b.tableNumber),
      }))
      .sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) return b.totalQuantity - a.totalQuantity;
        return a.productName.localeCompare(b.productName, 'es');
      });

    return reply.send({
      data: {
        items: items.sort((a, b) => a.tableNumber - b.tableNumber || a.productName.localeCompare(b.productName, 'es')),
        summary,
      },
    });
  });

  /** GET /api/orders/kitchen/history?venueId= — Historial de platos listos de mesas activas */
  fastify.get<{ Querystring: { venueId?: string; stationId?: string } }>('/kitchen/history', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!Number.isFinite(venueId) || venueId <= 0) {
      return reply.status(400).send({ error: 'venueId es obligatorio' });
    }
    const stationId = parseInt(request.query.stationId ?? '0', 10);

    const productionItems = await prisma.productionItem.findMany({
      where: {
        order: {
          venueId,
          status: { in: [OrderStatus.OPEN, OrderStatus.SENT_TO_KITCHEN, OrderStatus.READY] },
        },
        status: ProductionItemStatus.READY,
        ...(stationId > 0 ? { stationId } : {}),
      },
      include: {
        order: {
          include: {
            table: true,
            user: true,
          },
        },
        station: true,
      },
      orderBy: [
        { readyAt: 'desc' },
        { id: 'desc' },
      ],
      take: 50,
    });

    const items = productionItems.map((item) => ({
      id: item.sourceKey,
      productionItemId: item.id,
      orderId: item.orderId,
      orderItemId: item.orderItemId ?? 0,
      tableId: item.order.tableId,
      tableNumber: item.order.table.number,
      tableName: item.order.table.name ?? undefined,
      waiterName: item.order.user.name,
      stationId: item.stationId,
      stationName: item.station?.name ?? undefined,
      productName: item.productName,
      quantity: item.quantity,
      description: item.description ?? undefined,
      notes: item.notes ?? undefined,
      courseLabel: item.courseTag ?? undefined,
      sourceMenuName: item.sourceMenuName ?? undefined,
      status: 'READY' as const,
      createdAt: item.createdAt.toISOString(),
      readyAt: item.readyAt ? item.readyAt.toISOString() : undefined,
    }));

    return reply.send({ data: items });
  });

  /** GET /api/orders/kitchen/order/:orderId — Comanda completa con preparaciones (pendientes y listas) */
  fastify.get<{ Params: { orderId: string } }>('/kitchen/order/:orderId', async (request, reply) => {
    const orderId = parseInt(request.params.orderId, 10);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return reply.status(400).send({ error: 'orderId es obligatorio' });
    }

    const productionItems = await prisma.productionItem.findMany({
      where: { orderId },
      include: {
        order: {
          include: {
            table: true,
            user: true,
          },
        },
        station: true,
      },
      orderBy: [
        { status: 'asc' }, // Pending / In progress first, then Ready
        { id: 'asc' },
      ],
    });

    const items = productionItems.map((item) => ({
      id: item.sourceKey,
      productionItemId: item.id,
      orderId: item.orderId,
      orderItemId: item.orderItemId ?? 0,
      tableId: item.order.tableId,
      tableNumber: item.order.table.number,
      tableName: item.order.table.name ?? undefined,
      waiterName: item.order.user.name,
      stationId: item.stationId,
      stationName: item.station?.name ?? undefined,
      productName: item.productName,
      quantity: item.quantity,
      description: item.description ?? undefined,
      notes: item.notes ?? undefined,
      courseLabel: item.courseTag ?? undefined,
      sourceMenuName: item.sourceMenuName ?? undefined,
      status: item.status, // PENDING, IN_PROGRESS, READY
      createdAt: item.createdAt.toISOString(),
      readyAt: item.readyAt ? item.readyAt.toISOString() : undefined,
    }));

    return reply.send({ data: items });
  });

  /** POST /api/orders/:id/items */
  fastify.post<{ Params: { id: string } }>('/:id/items', async (request, reply) => {
    const orderId = parseInt(request.params.id, 10);
    const body = AddItemSchema.parse(request.body);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' });
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || !product.isAvailable) return reply.status(400).send({ error: 'Producto no disponible' });
    const item = await prisma.orderItem.create({
      data: {
        orderId,
        productId: body.productId,
        quantity: body.quantity,
        unitPrice: body.unitPrice ?? product.price,
        vatRate: product.vatRate,
        notes: body.notes,
      },
      include: { product: true },
    });
    return reply.status(201).send({ data: item });
  });

  /** POST /api/orders/kitchen-note — Imprime un aviso manual a cocina */
  fastify.post('/kitchen-note', async (request, reply) => {
    if (!requirePermission(request, reply, 'SEND_KITCHEN_NOTE')) return;
    const body = KitchenNoteSchema.parse(request.body);

    const [waiter, kitchenPrinters, table, activeOrder] = await Promise.all([
      prisma.user.findUnique({ where: { id: request.user.userId }, select: { name: true } }),
      prisma.printer.findMany({ where: { venueId: body.venueId, type: 'KITCHEN', isActive: true } }),
      body.tableId
        ? prisma.table.findUnique({ where: { id: body.tableId }, select: { number: true, name: true } })
        : Promise.resolve(null),
      body.tableId
        ? prisma.order.findFirst({
            where: {
              tableId: body.tableId,
              status: { in: ['OPEN', 'SENT_TO_KITCHEN'] },
            },
            orderBy: { id: 'desc' },
          })
        : Promise.resolve(null),
    ]);

    // 1. Si hay un pedido activo, crear un aviso digital en la tabla de preparaciones
    if (activeOrder) {
      const firstStation = await prisma.productionStation.findFirst({
        where: { venueId: body.venueId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      await prisma.productionItem.create({
        data: {
          orderId: activeOrder.id,
          stationId: firstStation?.id ?? null,
          sourceType: 'ORDER_ITEM',
          sourceKey: `kitchen-note-${activeOrder.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productName: 'AVISO A COCINA ⚠️',
          quantity: 1,
          notes: body.message,
          status: 'PENDING',
        },
      });
    }

    // 2. Si hay impresoras físicas activas, realizar la impresión. Si no, tolerar el caso
    if (kitchenPrinters.length > 0) {
      const reference = body.reference?.trim()
        || (table ? `Mesa ${table.number}${table.name ? ` · ${table.name}` : ''}` : undefined);

      const buf = buildKitchenMessageBuffer({
        message: body.message,
        waiterName: waiter?.name ?? request.user.email,
        reference,
        createdAt: new Date(),
      });

      try {
        await Promise.all(
          kitchenPrinters.map((printer) =>
            sendToPrinter({ ipAddress: printer.ipAddress, port: printer.port }, buf)
          )
        );
      } catch (e) {
        console.warn('[Printers] Error al imprimir aviso a cocina:', e);
      }
    } else {
      console.info(`[KitchenNote] Sin impresoras de cocina activas en la sede ${body.venueId}. Se envió solo aviso digital.`);
    }

    return reply.send({ success: true });
  });

  /** DELETE /api/orders/:id/items/:itemId */
  fastify.delete<{ Params: { id: string; itemId: string } }>('/:id/items/:itemId', async (request, reply) => {
    if (!requirePermission(request, reply, 'EDIT_OPEN_ORDERS')) return;
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

    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.SENT_TO_KITCHEN },
        include: {
          items: { include: { product: { include: { category: { select: { preparationStationId: true } } } } } },
          table: true,
          user: true,
        },
      });

      await tx.table.update({
        where: { id: updatedOrder.tableId },
        data: { status: TableStatus.ORDERING },
      });

      const existingItems = await tx.productionItem.findMany({
        where: {
          orderId,
          sourceType: ProductionSourceType.ORDER_ITEM,
        },
        select: { sourceKey: true },
      });
      const existingSourceKeys = new Set(existingItems.map((item) => item.sourceKey));
      const entriesToCreate = updatedOrder.items.reduce<ProductionPrintEntry[]>((acc, item) => {
        const menuSelection = decodeMenuSelection(item.notes);
        if (menuSelection) return acc;

        const sourceKey = `order-item-${item.id}`;
        if (existingSourceKeys.has(sourceKey)) return acc;

        acc.push({
          sourceKey,
          orderId: updatedOrder.id,
          orderItemId: item.id,
          stationId: resolvePreparationStationId(item.product),
          productName: item.product.name,
          quantity: item.quantity,
          description: item.product.description ?? undefined,
          notes: getVisibleNotes(item.notes),
        });
        return acc;
      }, []);

      if (entriesToCreate.length > 0) {
        await tx.productionItem.createMany({
          data: entriesToCreate.map((entry) => ({
            orderId: entry.orderId,
            orderItemId: entry.orderItemId,
            stationId: entry.stationId ?? null,
            sourceType: ProductionSourceType.ORDER_ITEM,
            sourceKey: entry.sourceKey,
            productName: entry.productName,
            quantity: entry.quantity,
            description: entry.description,
            notes: entry.notes,
            courseTag: entry.courseTag,
            sourceMenuName: entry.sourceMenuName,
            status: ProductionItemStatus.PENDING,
          })),
        });
      }

      return {
        ...updatedOrder,
        createdProductionEntries: entriesToCreate,
      };
    });

    printProductionEntries({
      venueId: order.venueId,
      tableNumber: order.table.number,
      waiterName: order.user.name,
      items: order.createdProductionEntries,
    }).catch((e) => console.error('[Kitchen] Error enviando producción a impresoras:', e));

    return reply.send({ data: order });
  });

  /** PATCH /api/orders/production-items/:itemId/status — Marca artículo/pase como listo o en curso */
  fastify.patch<{ Params: { itemId: string } }>('/production-items/:itemId/status', async (request, reply) => {
    const itemId = parseInt(request.params.itemId, 10);
    const body = UpdateProductionItemSchema.parse(request.body);

    const item = await prisma.productionItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });
    if (!item) return reply.status(404).send({ error: 'Preparación no encontrada' });

    const updated = await prisma.$transaction(async (tx) => {
      const nextItem = await tx.productionItem.update({
        where: { id: itemId },
        data: {
          status: body.status,
          readyAt: body.status === 'READY' ? new Date() : null,
        },
      });

      await syncOrderProductionStatus(tx, item.orderId, item.order.tableId);
      return nextItem;
    });

    return reply.send({ data: updated });
  });

  /** PATCH /api/orders/:id/kitchen-ready — Cocina marca la comanda visible como lista */
  fastify.patch<{ Params: { id: string } }>('/:id/kitchen-ready', async (request, reply) => {
    const orderId = parseInt(request.params.id, 10);
    const body = MarkKitchenReadySchema.parse(request.body ?? {});
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' });
    if (order.status === OrderStatus.CLOSED || order.status === OrderStatus.CANCELLED) {
      return reply.status(400).send({ error: 'El pedido ya no está activo' });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.productionItem.updateMany({
        where: {
          orderId,
          status: { in: [ProductionItemStatus.PENDING, ProductionItemStatus.IN_PROGRESS] },
          ...(body.stationId ? { stationId: body.stationId } : {}),
        },
        data: {
          status: ProductionItemStatus.READY,
          readyAt: new Date(),
        },
      });

      await syncOrderProductionStatus(tx, orderId, order.tableId);
      return tx.order.findUnique({ where: { id: orderId } });
    });

    return reply.send({ data: updatedOrder });
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

      const productionEntry: ProductionPrintEntry = {
        sourceKey: `menu-course-${orderItem.id}-${body.course}`,
        orderId,
        orderItemId: orderItem.id,
        stationId: resolvePreparationStationId({ ...selectedProduct, category: null }),
        productName: selectedProduct.name,
        quantity: orderItem.quantity,
        description: selectedProduct.description ?? undefined,
        notes: `${orderItem.product.name} · ${getCourseLabel(body.course)}`,
        courseTag: body.course,
        sourceMenuName: orderItem.product.name,
      };

      await prisma.$transaction(async (tx) => {
        await tx.orderItem.update({
          where: { id: itemId },
          data: { notes: encodeMenuSelection(nextSelection) },
        });

        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.SENT_TO_KITCHEN },
        });

        await tx.table.update({
          where: { id: order.tableId },
          data: { status: TableStatus.ORDERING },
        });

        const existingProductionItem = await tx.productionItem.findUnique({
          where: { sourceKey: productionEntry.sourceKey },
        });
        if (!existingProductionItem) {
          await tx.productionItem.create({
            data: {
              orderId,
              orderItemId: orderItem.id,
              stationId: productionEntry.stationId ?? null,
              sourceType: ProductionSourceType.MENU_COURSE,
              sourceKey: productionEntry.sourceKey,
              productName: productionEntry.productName,
              quantity: productionEntry.quantity,
              description: productionEntry.description,
              notes: productionEntry.notes,
              courseTag: productionEntry.courseTag,
              sourceMenuName: productionEntry.sourceMenuName,
              status: ProductionItemStatus.PENDING,
            },
          });
        }
      });

      printProductionEntries({
        venueId: order.venueId,
        tableNumber: order.table.number,
        waiterName: order.user.name,
        items: [productionEntry],
      }).catch((e) => console.error('[Kitchen] Error imprimiendo pase de menú:', e));

      return reply.send({
        success: true,
        summary: buildMenuSummary(nextSelection),
      });
    }
  );

  /** POST /api/orders/:id/items/:itemId/cancel — Cancelar/Reducir item enviado */
  fastify.post<{ Params: { id: string; itemId: string }; Body: { quantity: number } }>(
    '/:id/items/:itemId/cancel', async (request, reply) => {
      if (!requirePermission(request, reply, 'CANCEL_SENT_ITEMS')) return;
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
      const pendingProductionItems = await prisma.productionItem.findMany({
        where: {
          orderItemId: itemId,
          orderId,
          status: { in: [ProductionItemStatus.PENDING, ProductionItemStatus.IN_PROGRESS] },
        },
      });

      await prisma.$transaction(async (tx) => {
        if (newQty <= 0) {
          await tx.orderItem.delete({ where: { id: itemId } });
        } else {
          await tx.orderItem.update({
            where: { id: itemId },
            data: { quantity: newQty },
          });
        }

        for (const productionItem of pendingProductionItems) {
          if (newQty <= 0) {
            await tx.productionItem.delete({ where: { id: productionItem.id } });
          } else {
            await tx.productionItem.update({
              where: { id: productionItem.id },
              data: { quantity: newQty },
            });
          }
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
        } else {
          await syncOrderProductionStatus(tx, orderId, order.tableId);
        }
      });

      printProductionEntries({
        venueId: order.venueId,
        tableNumber: order.table.number,
        waiterName: order.user.name,
        isCancellation: true,
        items: (pendingProductionItems.length > 0 ? pendingProductionItems : [{
          id: 0,
          orderId,
          orderItemId: itemId,
          stationId: resolvePreparationStationId({ ...orderItem.product, category: null }),
          sourceType: ProductionSourceType.ORDER_ITEM,
          sourceKey: `order-item-${itemId}`,
          productName: orderItem.product.name,
          quantity: body.quantity,
          description: orderItem.product.description ?? undefined,
          notes: getVisibleNotes(orderItem.notes),
          courseTag: null,
          sourceMenuName: null,
          status: ProductionItemStatus.PENDING,
          sentAt: new Date(),
          readyAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]).map((productionItem) => ({
          sourceKey: productionItem.sourceKey,
          orderId,
          orderItemId: itemId,
          stationId: productionItem.stationId,
          productName: productionItem.productName,
          quantity: body.quantity,
          description: productionItem.description ?? undefined,
          notes: productionItem.notes ?? undefined,
          courseTag: productionItem.courseTag ?? undefined,
          sourceMenuName: productionItem.sourceMenuName ?? undefined,
        })),
      }).catch((e) => console.error('[Kitchen] Error enviando cancelación a producción:', e));

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
