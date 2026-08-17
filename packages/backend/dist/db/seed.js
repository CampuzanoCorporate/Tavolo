"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ============================================================
 * SEED v2 — Multi-sede con Autenticación
 * ============================================================
 * Crea: 1 Organización, 2 Sedes, usuarios, catálogos,
 *       mesas e impresoras de ejemplo.
 * ============================================================
 */
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Iniciando seed v2...');
    // ── 1. Organización ──────────────────────────────────────────────────────
    const org = await prisma.organisation.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'Restaurantes García S.L.',
            nif: 'B12345678',
            address: 'Calle Mayor 1, 28001 Madrid',
            phone: '+34 91 234 56 78',
            email: 'contacto@garcia-restaurantes.es',
        },
    });
    console.log('✅ Organización:', org.name);
    // ── 2. Sedes ──────────────────────────────────────────────────────────────
    const venueCentro = await prisma.venue.upsert({
        where: { slug: 'centro' },
        update: {},
        create: {
            organisationId: org.id,
            name: 'García - Centro',
            slug: 'centro',
            address: 'Calle Mayor 1, 28001 Madrid',
            phone: '+34 91 234 56 78',
            useOrgNif: true,
            invoiceSeries: 'T-MAD',
        },
    });
    const venueNorte = await prisma.venue.upsert({
        where: { slug: 'norte' },
        update: {},
        create: {
            organisationId: org.id,
            name: 'García - Norte',
            slug: 'norte',
            address: 'Av. del Norte 45, 28034 Madrid',
            phone: '+34 91 345 67 89',
            useOrgNif: true,
            invoiceSeries: 'T-NOR',
        },
    });
    console.log('✅ Sedes:', venueCentro.name, '|', venueNorte.name);
    // ── 3. Usuarios ───────────────────────────────────────────────────────────
    const pwAdmin = await bcrypt_1.default.hash('Admin1234!', 12);
    const pwCarlos = await bcrypt_1.default.hash('Camarero1!', 12);
    const pwCocina = await bcrypt_1.default.hash('Cocina111!', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@garcia.es' },
        update: {},
        create: { name: 'Administrador', email: 'admin@garcia.es', password: pwAdmin, role: 'ADMIN', organisationId: org.id },
    });
    const carlos = await prisma.user.upsert({
        where: { email: 'carlos@garcia.es' },
        update: {},
        create: { name: 'Carlos García', email: 'carlos@garcia.es', password: pwCarlos, role: 'WAITER', organisationId: org.id },
    });
    const cocina = await prisma.user.upsert({
        where: { email: 'cocina@garcia.es' },
        update: {},
        create: { name: 'Cocina Centro', email: 'cocina@garcia.es', password: pwCocina, role: 'KITCHEN', organisationId: org.id },
    });
    console.log('✅ Usuarios creados');
    // Asignar sedes a usuarios
    await prisma.venueUser.createMany({
        data: [
            { userId: carlos.id, venueId: venueCentro.id },
            { userId: carlos.id, venueId: venueNorte.id },
            { userId: cocina.id, venueId: venueCentro.id },
        ],
        skipDuplicates: true,
    });
    async function seedVenueCatalog(venue, label) {
        const ensureCategory = async (name, color, sortOrder) => {
            const existing = await prisma.category.findFirst({
                where: { venueId: venue.id, name },
            });
            if (existing)
                return existing;
            return prisma.category.create({
                data: { venueId: venue.id, name, color, sortOrder },
            });
        };
        const [catBebidas, catPrimeros, catCarnes, catPostres] = await Promise.all([
            ensureCategory('Bebidas', '#3B82F6', 0),
            ensureCategory('Primeros', '#10B981', 1),
            ensureCategory('Carnes', '#EF4444', 2),
            ensureCategory('Postres', '#F59E0B', 3),
        ]);
        const productosData = [
            { venueId: venue.id, name: 'Agua Mineral 50cl', price: 1.80, vatRate: 10, categoryId: catBebidas.id, sortOrder: 0 },
            { venueId: venue.id, name: 'Coca-Cola', price: 2.50, vatRate: 10, categoryId: catBebidas.id, sortOrder: 1 },
            { venueId: venue.id, name: 'Cerveza Estrella', price: 2.80, vatRate: 10, categoryId: catBebidas.id, sortOrder: 2 },
            { venueId: venue.id, name: 'Vino Tinto Copa', price: 3.50, vatRate: 10, categoryId: catBebidas.id, sortOrder: 3 },
            { venueId: venue.id, name: 'Zumo Natural Naranja', price: 3.00, vatRate: 10, categoryId: catBebidas.id, sortOrder: 4 },
            { venueId: venue.id, name: 'Ensalada Mixta', price: 6.50, vatRate: 10, categoryId: catPrimeros.id, description: 'Lechuga, tomate, zanahoria, aceitunas', sortOrder: 0 },
            { venueId: venue.id, name: 'Gazpacho Andaluz', price: 5.50, vatRate: 10, categoryId: catPrimeros.id, sortOrder: 1 },
            { venueId: venue.id, name: 'Croquetas Caseras (6u)', price: 7.50, vatRate: 10, categoryId: catPrimeros.id, sortOrder: 2 },
            { venueId: venue.id, name: 'Jamón Ibérico Bellota', price: 14.00, vatRate: 10, categoryId: catPrimeros.id, sortOrder: 3 },
            { venueId: venue.id, name: 'Entrecot de Ternera', price: 18.50, vatRate: 10, categoryId: catCarnes.id, description: '250g, con patatas y pimientos del padrón', sortOrder: 0 },
            { venueId: venue.id, name: 'Secreto Ibérico a la Plancha', price: 16.00, vatRate: 10, categoryId: catCarnes.id, sortOrder: 1 },
            { venueId: venue.id, name: 'Pollo al Horno con Tomillo', price: 13.50, vatRate: 10, categoryId: catCarnes.id, sortOrder: 2 },
            { venueId: venue.id, name: 'Tarta de Queso', price: 5.00, vatRate: 10, categoryId: catPostres.id, sortOrder: 0 },
            { venueId: venue.id, name: 'Crema Catalana', price: 4.50, vatRate: 10, categoryId: catPostres.id, sortOrder: 1 },
            { venueId: venue.id, name: 'Coulant de Chocolate', price: 5.50, vatRate: 10, categoryId: catPostres.id, sortOrder: 2 },
        ];
        for (const product of productosData) {
            const existing = await prisma.product.findFirst({
                where: { venueId: venue.id, name: product.name },
            });
            if (!existing) {
                await prisma.product.create({
                    data: product,
                });
            }
        }
        console.log(`✅ Catálogo ${label}:`, productosData.length, 'productos');
    }
    // ── 4. Catálogos de ejemplo ─────────────────────────────────────────────
    await seedVenueCatalog(venueCentro, 'Centro');
    await seedVenueCatalog(venueNorte, 'Norte');
    // ── 5. Mesas Centro ───────────────────────────────────────────────────────
    const mesasCentro = [
        { number: 1, zone: 'Interior', seats: 2 },
        { number: 2, zone: 'Interior', seats: 4 },
        { number: 3, zone: 'Interior', seats: 4 },
        { number: 4, zone: 'Interior', seats: 6 },
        { number: 5, zone: 'Interior', seats: 6 },
        { number: 6, zone: 'Interior', seats: 2 },
        { number: 7, zone: 'Terraza', seats: 2 },
        { number: 8, zone: 'Terraza', seats: 4 },
        { number: 9, zone: 'Terraza', seats: 4 },
        { number: 10, zone: 'Terraza', seats: 6 },
        { number: 11, zone: 'Barra', seats: 1 },
        { number: 12, zone: 'Barra', seats: 1 },
    ];
    for (const mesa of mesasCentro) {
        await prisma.table.upsert({
            where: { venueId_number: { venueId: venueCentro.id, number: mesa.number } },
            update: {},
            create: { venueId: venueCentro.id, ...mesa },
        });
    }
    console.log('✅ Mesas Centro:', mesasCentro.length);
    // Mesas Norte (simplificado)
    for (let i = 1; i <= 8; i++) {
        await prisma.table.upsert({
            where: { venueId_number: { venueId: venueNorte.id, number: i } },
            update: {},
            create: { venueId: venueNorte.id, number: i, zone: i <= 4 ? 'Salón' : 'Terraza', seats: i % 2 === 0 ? 4 : 2 },
        });
    }
    console.log('✅ Mesas Norte: 8');
    // ── 6. Impresoras ─────────────────────────────────────────────────────────
    await prisma.printer.createMany({
        data: [
            { venueId: venueCentro.id, name: 'Impresora Caja', connectionType: 'NETWORK', ipAddress: '192.168.1.100', port: 9100, type: 'RECEIPT' },
            { venueId: venueCentro.id, name: 'Impresora Cocina', connectionType: 'NETWORK', ipAddress: '192.168.1.101', port: 9100, type: 'KITCHEN' },
            { venueId: venueCentro.id, name: 'Impresora Barra', connectionType: 'NETWORK', ipAddress: '192.168.1.102', port: 9100, type: 'BAR' },
            { venueId: venueNorte.id, name: 'Caja Norte', connectionType: 'NETWORK', ipAddress: '192.168.2.100', port: 9100, type: 'RECEIPT' },
            { venueId: venueNorte.id, name: 'Cocina Norte', connectionType: 'NETWORK', ipAddress: '192.168.2.101', port: 9100, type: 'KITCHEN' },
        ],
        skipDuplicates: true,
    });
    console.log('✅ Impresoras configuradas');
    // ── Resumen ───────────────────────────────────────────────────────────────
    console.log('\n🎉 Seed completado. Credenciales de acceso:');
    console.log('  ADMIN:   admin@garcia.es    / Admin1234!');
    console.log('  WAITER:  carlos@garcia.es   / Camarero1!');
    console.log('  KITCHEN: cocina@garcia.es   / Cocina111!\n');
}
main()
    .catch((e) => { console.error('❌ Error en seed:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
//# sourceMappingURL=seed.js.map