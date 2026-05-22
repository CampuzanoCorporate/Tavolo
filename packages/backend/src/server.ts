/**
 * ============================================================
 * TAVOLO POS — Servidor Fastify v2 (Multi-sede + Auth JWT)
 * ============================================================
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import { config } from './config';
import { buildErrorHandler } from './middleware/errorHandler';
import { authRoutes } from './modules/auth/auth.route';
import { ticketsRoutes } from './modules/tickets/tickets.route';
import { ordersRoutes } from './modules/orders/orders.route';
import { tablesRoutes } from './modules/tables/tables.route';
import { productsRoutes, printersRoutes } from './modules/products/products.route';
import { adminRoutes } from './modules/admin/admin.route';
import { prisma } from './db/client';

async function bootstrap() {
  const app = Fastify({
    logger: { level: config.server.isDev ? 'debug' : 'warn' },
  });

  // ── Plugins de seguridad ──────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.server.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── JWT ───────────────────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: '8h' },
  });

  // Decorador global authenticate para usar en rutas
  app.decorate('authenticate', async function (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Token inválido o expirado' });
    }
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  app.setErrorHandler(buildErrorHandler());

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  }));

  // ── Rutas ─────────────────────────────────────────────────────────────────
  await app.register(authRoutes,     { prefix: '/api/auth' });
  await app.register(ticketsRoutes,  { prefix: '/api/tickets' });
  await app.register(ordersRoutes,   { prefix: '/api/orders' });
  await app.register(tablesRoutes,   { prefix: '/api/tables' });
  await app.register(productsRoutes, { prefix: '/api/products' });
  await app.register(printersRoutes, { prefix: '/api/printers' });
  await app.register(adminRoutes,    { prefix: '/api/admin' });

  // ── Arrancar servidor ─────────────────────────────────────────────────────
  try {
    await app.listen({ port: config.server.port, host: '0.0.0.0' });
    console.log(`\n🍽️  Tavolo POS v2 arrancado en http://localhost:${config.server.port}`);
    console.log(`🔐  Auth: POST /api/auth/login`);
    console.log(`🏛️  Admin: /api/admin/*\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }
}

bootstrap();
