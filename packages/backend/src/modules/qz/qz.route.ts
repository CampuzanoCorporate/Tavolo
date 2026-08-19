import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getQzTrayCertificate, signQzTrayPayload } from './qz.service';

const SignPayloadSchema = z.object({
  request: z.string().min(1),
});

export async function qzRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/certificate', async (_request, reply) => {
    const certificate = await getQzTrayCertificate();
    reply.type('text/plain; charset=utf-8');
    return reply.send(certificate);
  });

  fastify.post('/sign', async (request, reply) => {
    const { request: payload } = SignPayloadSchema.parse(request.body);
    const signature = await signQzTrayPayload(payload);
    return reply.send({ data: signature });
  });
}
