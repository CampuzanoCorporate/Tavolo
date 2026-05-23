import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppPermission } from './permissions';
import { hasPermission } from './permissions';

export function requirePermission(request: FastifyRequest, reply: FastifyReply, permission: AppPermission) {
  if (request.user.role === 'ADMIN') {
    return true;
  }

  if (!hasPermission(request.user.permissions, permission)) {
    reply.status(403).send({ error: 'No tienes permisos para realizar esta acción' });
    return false;
  }

  return true;
}

export function canAccessVenue(request: FastifyRequest, venueId: number) {
  return request.user.role === 'ADMIN' || request.user.venueIds.includes(venueId);
}
