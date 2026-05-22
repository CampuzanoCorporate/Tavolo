"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
/**
 * Cliente Prisma singleton para Tavolo POS.
 * Reutiliza la misma instancia en desarrollo (hot reload)
 * y crea una nueva instancia en producción.
 */
const client_1 = require("@prisma/client");
const config_1 = require("../config");
const prisma = global.__prisma ??
    new client_1.PrismaClient({
        log: config_1.config.server.isDev
            ? ['query', 'warn', 'error']
            : ['warn', 'error'],
    });
exports.prisma = prisma;
if (config_1.config.server.isDev) {
    global.__prisma = prisma;
}
//# sourceMappingURL=client.js.map