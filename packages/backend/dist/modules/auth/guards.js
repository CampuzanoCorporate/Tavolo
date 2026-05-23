"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
exports.canAccessVenue = canAccessVenue;
const permissions_1 = require("./permissions");
function requirePermission(request, reply, permission) {
    if (request.user.role === 'ADMIN') {
        return true;
    }
    if (!(0, permissions_1.hasPermission)(request.user.permissions, permission)) {
        reply.status(403).send({ error: 'No tienes permisos para realizar esta acción' });
        return false;
    }
    return true;
}
function canAccessVenue(request, venueId) {
    return request.user.role === 'ADMIN' || request.user.venueIds.includes(venueId);
}
//# sourceMappingURL=guards.js.map