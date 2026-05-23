import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppPermission } from './permissions';
export declare function requirePermission(request: FastifyRequest, reply: FastifyReply, permission: AppPermission): boolean;
export declare function canAccessVenue(request: FastifyRequest, venueId: number): boolean;
//# sourceMappingURL=guards.d.ts.map