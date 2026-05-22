/**
 * Cliente Prisma singleton para Tavolo POS.
 * Reutiliza la misma instancia en desarrollo (hot reload)
 * y crea una nueva instancia en producción.
 */
import { PrismaClient } from '@prisma/client';
declare global {
    var __prisma: PrismaClient | undefined;
}
declare const prisma: PrismaClient;
export { prisma };
//# sourceMappingURL=client.d.ts.map