"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ============================================================
 * TAVOLO POS — Servidor Fastify v2 (Multi-sede + Auth JWT)
 * ============================================================
 */
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const config_1 = require("./config");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_route_1 = require("./modules/auth/auth.route");
const tickets_route_1 = require("./modules/tickets/tickets.route");
const orders_route_1 = require("./modules/orders/orders.route");
const tables_route_1 = require("./modules/tables/tables.route");
const products_route_1 = require("./modules/products/products.route");
const admin_route_1 = require("./modules/admin/admin.route");
const client_1 = require("./db/client");
async function bootstrap() {
    const app = (0, fastify_1.default)({
        logger: { level: config_1.config.server.isDev ? 'debug' : 'warn' },
    });
    // ── Plugins de seguridad ──────────────────────────────────────────────────
    await app.register(helmet_1.default, { contentSecurityPolicy: false });
    await app.register(cors_1.default, {
        origin: config_1.config.server.corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
    });
    // ── JWT ───────────────────────────────────────────────────────────────────
    await app.register(jwt_1.default, {
        secret: config_1.config.jwt.secret,
        sign: { expiresIn: '8h' },
    });
    // Decorador global authenticate para usar en rutas
    app.decorate('authenticate', async function (request, reply) {
        try {
            await request.jwtVerify();
        }
        catch {
            reply.status(401).send({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Token inválido o expirado' });
        }
    });
    // ── Error handler ─────────────────────────────────────────────────────────
    app.setErrorHandler((0, errorHandler_1.buildErrorHandler)());
    // ── Health check ──────────────────────────────────────────────────────────
    app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
    }));
    // ── Rutas ─────────────────────────────────────────────────────────────────
    await app.register(auth_route_1.authRoutes, { prefix: '/api/auth' });
    await app.register(tickets_route_1.ticketsRoutes, { prefix: '/api/tickets' });
    await app.register(orders_route_1.ordersRoutes, { prefix: '/api/orders' });
    await app.register(tables_route_1.tablesRoutes, { prefix: '/api/tables' });
    await app.register(products_route_1.productsRoutes, { prefix: '/api/products' });
    await app.register(products_route_1.printersRoutes, { prefix: '/api/printers' });
    await app.register(admin_route_1.adminRoutes, { prefix: '/api/admin' });
    // ── Arrancar servidor ─────────────────────────────────────────────────────
    try {
        await app.listen({ port: config_1.config.server.port, host: '0.0.0.0' });
        console.log(`\n🍽️  Tavolo POS v2 arrancado en http://localhost:${config_1.config.server.port}`);
        console.log(`🔐  Auth: POST /api/auth/login`);
        console.log(`🏛️  Admin: /api/admin/*\n`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
    // ── Graceful shutdown ─────────────────────────────────────────────────────
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, async () => {
            await app.close();
            await client_1.prisma.$disconnect();
            process.exit(0);
        });
    }
}
bootstrap();
//# sourceMappingURL=server.js.map