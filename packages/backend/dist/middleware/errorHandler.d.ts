/**
 * Middleware de gestión de errores para Fastify — Tavolo POS
 * Normaliza todos los errores a una respuesta JSON estructurada.
 */
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
export interface ApiError {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
}
export declare function buildErrorHandler(): (error: FastifyError | ZodError | Error, _request: FastifyRequest, reply: FastifyReply) => FastifyReply<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").RouteGenericInterface, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
//# sourceMappingURL=errorHandler.d.ts.map