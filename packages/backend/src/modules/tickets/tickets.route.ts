/**
 * Rutas de Tickets — v2
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { closeTicket } from './tickets.service';

const CloseTicketSchema = z.object({
  orderId:     z.number().int().positive(),
  venueId:     z.number().int().positive(),
  printerIp:   z.string().ip().optional(),
  printerPort: z.number().int().optional(),
});

export async function ticketsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  /** POST /api/tickets/close */
  fastify.post('/close', async (request, reply) => {
    const body = CloseTicketSchema.parse(request.body);
    const result = await closeTicket({ ...body, userId: request.user.userId });
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
}
