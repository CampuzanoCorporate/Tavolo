"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
    /**
     * POST /api/auth/change-password
     * Cambia la contraseña del usuario e invalida la bandera de contraseña provisional (mustChangePassword = false).
     */
    fastify.post('/change-password', { onRequest: [fastify.authenticate] }, async (request, reply) => {
        const schema = zod_1.z.object({
            oldPassword: zod_1.z.string().min(1),
            newPassword: zod_1.z.string().min(6),
        });
        const { oldPassword, newPassword } = schema.parse(request.body);
        const { changeUserPassword } = await Promise.resolve().then(() => __importStar(require('./auth.service')));
        const updatedUser = await changeUserPassword(request.user.userId, oldPassword, newPassword);
        const profile = await (0, auth_service_1.getUserProfile)(updatedUser.id);
        return reply.send({
            message: 'Contraseña actualizada con éxito',
            user: profile,
        });
    });
}
//# sourceMappingURL=auth.route.js.map