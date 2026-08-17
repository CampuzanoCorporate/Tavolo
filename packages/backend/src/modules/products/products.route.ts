/**
 * Rutas de Productos e Impresoras — v2 (filtrado por venueId)
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { buildCommandaPreviewText, buildTicketPreviewText, ESCPOS, listSystemPrinters, sendToPrinter } from '../printing/printer.service';
import { requirePermission } from '../auth/guards';

export async function productsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  /** GET /api/products?venueId= — Catálogo completo por categorías */
  fastify.get<{ Querystring: { venueId?: string } }>('/', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!venueId) return reply.status(400).send({ error: 'venueId requerido' });

    const categories = await prisma.category.findMany({
      where: { venueId, isActive: true },
      include: {
        modifierGroups: {
          where: { isActive: true },
          include: {
            options: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        products: {
          where: { isAvailable: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ data: categories });
  });

  fastify.get('/system', async (_request, reply) => {
    const printers = await listSystemPrinters();
    return reply.send({ data: printers });
  });
}

export async function printersRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const OpenDrawerSchema = z.object({
    venueId: z.number().int().positive(),
  });

  /** GET /api/printers?venueId= */
  fastify.get<{ Querystring: { venueId?: string } }>('/', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!venueId) return reply.status(400).send({ error: 'venueId requerido' });

    const printers = await prisma.printer.findMany({
      where: { venueId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: printers });
  });

  /** POST /api/printers/open-drawer — Abre el cajon de la impresora principal */
  fastify.post('/open-drawer', async (request, reply) => {
    const body = OpenDrawerSchema.parse(request.body);
    if (!requirePermission(request, reply, 'OPEN_DRAWER')) return;

    const receiptPrinter = await prisma.printer.findFirst({
      where: {
        venueId: body.venueId,
        isActive: true,
        type: 'RECEIPT',
      },
      orderBy: { name: 'asc' },
    });

    const fallbackPrinter = receiptPrinter ? null : await prisma.printer.findFirst({
      where: {
        venueId: body.venueId,
        isActive: true,
        type: { in: ['BAR', 'KITCHEN'] },
      },
      orderBy: { name: 'asc' },
    });

    const printer = receiptPrinter ?? fallbackPrinter;

    if (!printer) {
      return reply.status(404).send({ error: 'No hay impresoras activas para abrir el cajon' });
    }

    await sendToPrinter({
      connectionType: printer.connectionType,
      ipAddress: printer.ipAddress ?? undefined,
      port: printer.port ?? undefined,
      systemName: printer.systemName ?? undefined,
    }, ESCPOS.OPEN_DRAWER);
    return reply.send({ success: true });
  });

  /** GET /api/printers/preview-samples?venueId= */
  fastify.get<{ Querystring: { venueId?: string } }>('/preview-samples', async (request, reply) => {
    const venueId = parseInt(request.query.venueId ?? '0', 10);
    if (!venueId) return reply.status(400).send({ error: 'venueId requerido' });
    if (!requirePermission(request, reply, 'MANAGE_PRINTERS')) return;

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { organisation: true },
    });
    if (!venue) return reply.status(404).send({ error: 'Sede no encontrada' });

    const sampleProducts = await prisma.product.findMany({
      where: { venueId, isAvailable: true },
      orderBy: { sortOrder: 'asc' },
      take: 3,
    });

    const businessName = venue.useOrgNif ? venue.organisation.name : (venue.nameOverride ?? venue.organisation.name);
    const businessNif = venue.useOrgNif ? venue.organisation.nif : (venue.nifOverride ?? venue.organisation.nif);
    const businessAddress = venue.address ?? venue.organisation.address ?? '';

    const ticketItems = sampleProducts.length > 0
      ? sampleProducts.map((product, index) => ({
          name: product.name,
          quantity: index === 0 ? 2 : 1,
          unitPrice: Number(product.price),
          notes: product.description ?? undefined,
        }))
      : [
          { name: 'Cafe solo', quantity: 1, unitPrice: 1.5, notes: 'Muestra de producto' },
        ];

    const total = ticketItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const subtotal = Math.round((total / 1.1) * 100) / 100;
    const vatAmount = Math.round((total - subtotal) * 100) / 100;

    const ticket = buildTicketPreviewText({
      businessName,
      businessNif,
      businessAddress,
      invoiceCode: `${venue.invoiceSeries}-2026-000123`,
      issuedAt: new Date(),
      tableNumber: 7,
      waiterName: 'Carlos',
      items: ticketItems,
      subtotal,
      vatAmount,
      vatRate: 10,
      total,
    });

    const kitchen = buildCommandaPreviewText({
      tableNumber: 7,
      waiterName: 'Carlos',
      orderTime: new Date(),
      items: ticketItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        description: item.notes,
        notes: item.quantity > 1 ? 'Marchar juntas' : undefined,
      })),
    });

    return reply.send({ data: { ticket, kitchen } });
  });
}
