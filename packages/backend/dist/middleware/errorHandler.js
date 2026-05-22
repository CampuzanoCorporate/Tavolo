"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildErrorHandler = buildErrorHandler;
const zod_1 = require("zod");
function buildErrorHandler() {
    return function errorHandler(error, _request, reply) {
        // Errores de validación Zod
        if (error instanceof zod_1.ZodError) {
            const response = {
                statusCode: 400,
                code: 'VALIDATION_ERROR',
                message: 'Datos de entrada inválidos',
                details: error.flatten().fieldErrors,
            };
            return reply.status(400).send(response);
        }
        // Errores de Fastify (incluyen statusCode)
        if ('statusCode' in error && error.statusCode) {
            const response = {
                statusCode: error.statusCode,
                code: error.code ?? 'FASTIFY_ERROR',
                message: error.message,
            };
            return reply.status(error.statusCode).send(response);
        }
        // Error genérico — no exponer detalles internos en producción
        console.error('[ErrorHandler]', error);
        const response = {
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error interno del servidor',
        };
        return reply.status(500).send(response);
    };
}
//# sourceMappingURL=errorHandler.js.map