/**
 * Rutas de Mesas — v2 (filtrado por venueId)
 */
import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/client';
import { TableStatus } from '@prisma/client';

export async function tablesRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  /** GET /api/tables?venueId= */
  fastify.get<{ Querystring: { venueId?: string } }>('/', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!venueId) return reply.status(400).send({ error: 'venueId requerido' });

    const tables = await prisma.table.findMany({
      where: { venueId },
      orderBy: [{ zone: 'asc' }, { number: 'asc' }],
    });
    return reply.send({ data: tables });
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
