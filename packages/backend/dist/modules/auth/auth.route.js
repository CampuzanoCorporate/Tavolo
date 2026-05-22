"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = require("zod");
const auth_service_1 = require("./auth.service");
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
async function authRoutes(fastify) {
    /**
     * POST /api/auth/login
     * Autentica al usuario y devuelve un JWT + datos básicos.
     */
    fastify.post('/login', async (request, reply) => {
        const { email, password } = LoginSchema.parse(request.body);
        try {
            const payload = await (0, auth_service_1.loginUser)(email, password);
            const token = fastify.jwt.sign(payload, { expiresIn: '8h' });
            const profile = await (0, auth_service_1.getUserProfile)(payload.userId);
            return reply.send({
                token,
                user: profile,
                venueIds: payload.venueIds,
            });
        }
        catch (err) {
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
        const profile = await (0, auth_service_1.getUserProfile)(request.user.userId);
        if (!profile)
            return reply.status(404).send({ error: 'Usuario no encontrado' });
        return reply.send({ data: profile });
    });
}
//# sourceMappingURL=auth.route.js.map