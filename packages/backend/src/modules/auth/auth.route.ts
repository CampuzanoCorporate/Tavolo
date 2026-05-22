/**
 * Rutas de Autenticación — Tavolo POS
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loginUser, getUserProfile } from './auth.service';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/auth/login
   * Autentica al usuario y devuelve un JWT + datos básicos.
   */
  fastify.post('/login', async (request, reply) => {
    const { email, password } = LoginSchema.parse(request.body);

    try {
      const payload = await loginUser(email, password);
      const token = fastify.jwt.sign(payload, { expiresIn: '8h' });

      const profile = await getUserProfile(payload.userId);

      return reply.send({
        token,
        user: profile,
        venueIds: payload.venueIds,
      });
    } catch (err) {
      return reply.status(401).send({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: err instanceof Error ? err.message : 'Credenciales inválidas',
      });
    }
  });

  /**
   * GET /api/auth/me
   * Retorna el perfil del usuario autenticado.
   */
  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const profile = await getUserProfile(request.user.userId);
    if (!profile) return reply.status(404).send({ error: 'Usuario no encontrado' });
    return reply.send({ data: profile });
  });
}
