/**
 * Cliente Prisma singleton para Tavolo POS.
 * Reutiliza la misma instancia en desarrollo (hot reload)
 * y crea una nueva instancia en producción.
 */
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

declare global {
  // Evitar múltiples instancias en desarrollo con hot-reload
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: config.server.isDev
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  });

if (config.server.isDev) {
  global.__prisma = prisma;
}

export { prisma };
