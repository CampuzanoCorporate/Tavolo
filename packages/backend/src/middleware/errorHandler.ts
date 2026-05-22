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

export function buildErrorHandler() {
  return function errorHandler(
    error: FastifyError | ZodError | Error,
    _request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Errores de validación Zod
    if (error instanceof ZodError) {
      const response: ApiError = {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: error.flatten().fieldErrors,
      };
      return reply.status(400).send(response);
    }

    // Errores de Fastify (incluyen statusCode)
    if ('statusCode' in error && error.statusCode) {
      const response: ApiError = {
        statusCode: error.statusCode,
        code: error.code ?? 'FASTIFY_ERROR',
        message: error.message,
      };
      return reply.status(error.statusCode).send(response);
    }

    // Error genérico — no exponer detalles internos en producción
    console.error('[ErrorHandler]', error);
    const response: ApiError = {
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error interno del servidor',
    };
    return reply.status(500).send(response);
  };
}
