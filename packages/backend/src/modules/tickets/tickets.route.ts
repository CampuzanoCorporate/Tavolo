/**
 * Rutas de Tickets — v2
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { addCashMovement, closeCashRegister, closePartialTicket, closeTicket, getCashClosurePreview, getCashClosureRaw, getCashSummary, getPreBillRaw, getTicketPreview, getTicketRaw, openCashSession, printPreBill, reprintCashClosure, reprintTicket } from './tickets.service';
import { canAccessVenue, requirePermission } from '../auth/guards';

const CloseTicketSchema = z.object({
  orderId:     z.number().int().positive(),
  venueId:     z.number().int().positive(),
  paymentMethod: z.enum(['CASH', 'CARD']),
  printerIp:   z.string().ip().optional(),
  printerPort: z.number().int().optional(),
});

const ClosePartialTicketSchema = z.object({
  originalOrderId: z.number().int().positive(),
  venueId:         z.number().int().positive(),
  paymentMethod:   z.enum(['CASH', 'CARD']),
  items: z.array(z.object({
    productId:   z.number().int().positive(),
    quantity:    z.number().int().positive(),
    notes:       z.string().nullable().optional(),
    unitPrice:   z.number().nonnegative(),
    vatRate:     z.number().nonnegative(),
  })).min(1),
  splitMode:   z.enum(['QUANTITY', 'PRICE']).optional(),
  printerIp:   z.string().ip().optional(),
  printerPort: z.number().int().optional(),
});

const CloseCashSchema = z.object({
  venueId: z.number().int().positive(),
  countedAmount: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional(),
  printerIp: z.string().ip().optional(),
  printerPort: z.number().int().optional(),
});

const OpenCashSchema = z.object({
  venueId: z.number().int().positive(),
  openingAmount: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional(),
});

const CashMovementSchema = z.object({
  venueId: z.number().int().positive(),
  type: z.enum(['CASH_IN', 'CASH_OUT']),
  amount: z.coerce.number().positive(),
  description: z.string().trim().min(2).max(500),
});

export async function ticketsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  /** POST /api/tickets/close */
  fastify.post('/close', async (request, reply) => {
    const body = CloseTicketSchema.parse(request.body);
    const result = await closeTicket({ ...body, userId: request.user.userId });
    return reply.status(201).send({ data: result });
  });

  /** POST /api/tickets/close-partial */
  fastify.post('/close-partial', async (request, reply) => {
    const body = ClosePartialTicketSchema.parse(request.body);
    const result = await closePartialTicket({ ...body, userId: request.user.userId });
    return reply.status(201).send({ data: result });
  });

  /** GET /api/tickets/:id */
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(request.params.id, 10) },
      include: { order: { include: { items: { include: { product: true } }, table: true } } },
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket no encontrado' });
    return reply.send({ data: ticket });
  });

  /** GET /api/tickets/cash/summary?venueId= */
  fastify.get<{ Querystring: { venueId?: string } }>('/cash/summary', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!venueId) return reply.status(400).send({ error: 'venueId requerido' });
    if (!canAccessVenue(request, venueId)) return reply.status(403).send({ error: 'Sin acceso a esta sede' });
    if (!requirePermission(request, reply, 'VIEW_FINANCIALS')) return;

    const summary = await getCashSummary(venueId);
    return reply.send({ data: summary });
  });

  /** POST /api/tickets/cash/close */
  fastify.post('/cash/open', async (request, reply) => {
    const body = OpenCashSchema.parse(request.body);
    if (!canAccessVenue(request, body.venueId)) return reply.status(403).send({ error: 'Sin acceso a esta sede' });
    if (!requirePermission(request, reply, 'CLOSE_CASH')) return;

    const session = await openCashSession({
      venueId: body.venueId,
      userId: request.user.userId,
      openingAmount: body.openingAmount,
      notes: body.notes,
    });
    return reply.status(201).send({ data: session });
  });

  fastify.post('/cash/movements', async (request, reply) => {
    const body = CashMovementSchema.parse(request.body);
    if (!canAccessVenue(request, body.venueId)) return reply.status(403).send({ error: 'Sin acceso a esta sede' });
    if (!requirePermission(request, reply, 'CLOSE_CASH')) return;

    const movement = await addCashMovement({
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
    if (!canAccessVenue(request, body.venueId)) return reply.status(403).send({ error: 'Sin acceso a esta sede' });
    if (!requirePermission(request, reply, 'CLOSE_CASH')) return;

    const closure = await closeCashRegister({
      venueId: body.venueId,
      userId: request.user.userId,
      countedAmount: body.countedAmount,
      notes: body.notes,
      printerIp: body.printerIp,
      printerPort: body.printerPort,
    });
    return reply.status(201).send({ data: closure });
  });

  fastify.get<{ Params: { id: string } }>('/cash-closures/:id/preview', async (request, reply) => {
    if (!requirePermission(request, reply, 'VIEW_FINANCIALS')) return;
    const data = await getCashClosurePreview(parseInt(request.params.id, 10));
    return reply.send({ data });
  });

  fastify.get<{ Params: { id: string } }>('/cash-closures/:id/raw', async (request, reply) => {
    if (!requirePermission(request, reply, 'VIEW_FINANCIALS')) return;
    const data = await getCashClosureRaw(parseInt(request.params.id, 10));
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>('/cash-closures/:id/reprint', async (request, reply) => {
    if (!requirePermission(request, reply, 'CLOSE_CASH')) return;
    const data = await reprintCashClosure(parseInt(request.params.id, 10));
    return reply.send({ data });
  });

  fastify.get<{ Params: { tableId: string } }>('/prebills/:tableId/raw', async (request, reply) => {
    const tableId = parseInt(request.params.tableId, 10);
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: { venueId: true },
    });

    if (!table) return reply.status(404).send({ error: 'Mesa no encontrada' });
    if (!canAccessVenue(request, table.venueId)) return reply.status(403).send({ error: 'Sin acceso a esta sede' });

    try {
      const data = await getPreBillRaw(tableId);
      return reply.send({ data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo generar el pre-ticket';
      request.log.error({ err: error, tableId }, 'Error generando RAW de pre-ticket');
      return reply.status(400).send({ statusCode: 400, code: 'PREBILL_ERROR', message });
    }
  });

  fastify.post<{ Params: { tableId: string } }>('/prebills/:tableId/reprint', async (request, reply) => {
    const tableId = parseInt(request.params.tableId, 10);
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: { venueId: true },
    });

    if (!table) return reply.status(404).send({ error: 'Mesa no encontrada' });
    if (!canAccessVenue(request, table.venueId)) return reply.status(403).send({ error: 'Sin acceso a esta sede' });

    try {
      const data = await printPreBill(tableId);
      return reply.send({ data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo imprimir el pre-ticket';
      request.log.error({ err: error, tableId }, 'Error imprimiendo pre-ticket');
      return reply.status(400).send({ statusCode: 400, code: 'PREBILL_ERROR', message });
    }
  });

  /** GET /api/tickets/:id/preview */
  fastify.get<{ Params: { id: string } }>('/:id/preview', async (request, reply) => {
    const data = await getTicketPreview(parseInt(request.params.id, 10));
    return reply.send({ data });
  });

  /** GET /api/tickets/:id/raw */
  fastify.get<{ Params: { id: string } }>('/:id/raw', async (request, reply) => {
    const data = await getTicketRaw(parseInt(request.params.id, 10));
    return reply.send({ data });
  });

  /** POST /api/tickets/:id/reprint */
  fastify.post<{ Params: { id: string } }>('/:id/reprint', async (request, reply) => {
    if (!requirePermission(request, reply, 'REPRINT_TICKETS')) return;
    const data = await reprintTicket(parseInt(request.params.id, 10));
    return reply.send({ data });
  });
}
