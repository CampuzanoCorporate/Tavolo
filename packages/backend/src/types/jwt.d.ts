/**
 * ============================================================
 * MÓDULO AUTH — Declaraciones de Tipos JWT
 * Augmenta FastifyJWT para TypeScript estricto.
 * ============================================================
 */
import '@fastify/jwt';
import 'fastify';
import type { Role } from '@prisma/client';
import { FastifyRequest, FastifyReply } from 'fastify';

export interface JWTPayload {
  userId: number;
  email: string;
  role: Role;
  organisationId: number;
  /** IDs de las sedes a las que tiene acceso el usuario */
  venueIds: number[];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
