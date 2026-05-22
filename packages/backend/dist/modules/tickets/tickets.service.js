"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeTicket = closeTicket;
/**
 * ============================================================
 * MÓDULO TICKETS — Servicio de Cierre (v2 Multi-sede)
 * ============================================================
 * Ahora los datos fiscales (NIF, nombre, dirección) se obtienen
 * de la Venue y la Organisation en la DB, no del .env.
 * El encadenamiento de hashes es por venueId.
 * ============================================================
 */
const client_1 = require("@prisma/client");
const client_2 = require("../../db/client");
const hash_service_1 = require("../verifactu/hash.service");
const sign_service_1 = require("../verifactu/sign.service");
const qr_service_1 = require("../verifactu/qr.service");
const printer_service_1 = require("../printing/printer.service");
const config_1 = require("../../config");
const menuSelection_1 = require("../orders/menuSelection");
async function closeTicket(input) {
    const { orderId, userId, venueId, printerIp, printerPort = 9100 } = input;
    // ── 1. Cargar pedido con items ────────────────────────────────────────────
    const order = await client_2.prisma.order.findUnique({
        where: { id: orderId },
        include: {
            items: { include: { product: true } },
            table: true,
            user: true,
        },
    });
    if (!order)
        throw new Error(`Pedido #${orderId} no encontrado en la sede`);
    if (order.venueId !== venueId)
        throw new Error(`Pedido #${orderId} no pertenece a esta sede`);
    if (order.status === client_1.OrderStatus.CLOSED || order.status === client_1.OrderStatus.CANCELLED) {
        throw new Error(`El pedido #${orderId} ya está cerrado`);
    }
    if (order.items.length === 0)
        throw new Error(`El pedido #${orderId} no tiene productos`);
    // ── 2. Cargar datos fiscales de la sede ────────────────────────────────────
    const venue = await client_2.prisma.venue.findUnique({
        where: { id: venueId },
        include: { organisation: true },
    });
    if (!venue)
        throw new Error(`Sede #${venueId} no encontrada`);
    // Resolver NIF y nombre efectivos (sede propia o heredado de la org)
    const effectiveNif = venue.useOrgNif ? venue.organisation.nif : (venue.nifOverride ?? venue.organisation.nif);
    const effectiveName = venue.useOrgNif ? venue.organisation.name : (venue.nameOverride ?? venue.organisation.name);
    const effectiveAddress = venue.address ?? venue.organisation.address ?? '';
    // ── 3. Calcular importes ──────────────────────────────────────────────────
    let subtotal = 0;
    let total = 0;
    let vatAmount = 0;
    for (const item of order.items) {
        const lineTotal = parseFloat(item.unitPrice.toString()) * item.quantity;
        const divisor = 1 + (parseFloat(item.vatRate.toString()) / 100);
        const lineSubtotal = divisor > 0 ? lineTotal / divisor : lineTotal;
        total += lineTotal;
        subtotal += lineSubtotal;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    total = Math.round(total * 100) / 100;
    vatAmount = Math.round((total - subtotal) * 100) / 100;
    const dominantVatRate = parseFloat(order.items[0]?.vatRate.toString() ?? '10');
    // ── 4 + 5. Transacción atómica: numeración + hash + inserción ─────────────
    // SELECT FOR UPDATE garantiza correlatividad sin saltos, incluso con concurrencia.
    const ticket = await client_2.prisma.$transaction(async (tx) => {
        const lastTickets = await tx.$queryRaw `
      SELECT "invoiceNumber", "invoiceCode", "hashSelf"
      FROM "tickets"
      WHERE "venueId" = ${venueId} AND "invoiceSeries" = ${venue.invoiceSeries}
      ORDER BY "invoiceNumber" DESC
      LIMIT 1
      FOR UPDATE
    `;
        const last = lastTickets[0];
        const nextNumber = last ? last.invoiceNumber + 1 : 1;
        const year = new Date().getFullYear();
        const invoiceCode = `${venue.invoiceSeries}-${year}-${String(nextNumber).padStart(6, '0')}`;
        const previousHash = last ? last.hashSelf : hash_service_1.EMPTY_PREVIOUS_HASH;
        const issuedAt = new Date();
        // Hash encadenado Veri*factu
        const hashSelf = (0, hash_service_1.computeVerifactuHash)({
            idEmisorFactura: effectiveNif,
            numSerieFactura: invoiceCode,
            fechaExpedicion: (0, hash_service_1.formatDateForHash)(issuedAt),
            tipoFactura: 'F1',
            cuotaTotal: (0, hash_service_1.formatDecimalForHash)(vatAmount),
            importeTotal: (0, hash_service_1.formatDecimalForHash)(total),
            huellaAnterior: previousHash,
        });
        const newTicket = await tx.ticket.create({
            data: {
                venueId,
                orderId,
                userId,
                invoiceSeries: venue.invoiceSeries,
                invoiceNumber: nextNumber,
                invoiceCode,
                subtotal: new client_1.Prisma.Decimal(subtotal),
                vatAmount: new client_1.Prisma.Decimal(vatAmount),
                total: new client_1.Prisma.Decimal(total),
                hashSelf,
                hashPrevious: previousHash,
                previousInvoiceCode: last?.invoiceCode ?? null,
                aeatStatus: 'PENDING',
                businessName: effectiveName,
                businessNif: effectiveNif,
                businessAddress: effectiveAddress,
                issuedAt,
            },
        });
        await tx.order.update({ where: { id: orderId }, data: { status: client_1.OrderStatus.CLOSED } });
        await tx.table.update({ where: { id: order.tableId }, data: { status: client_1.TableStatus.FREE } });
        return newTicket;
    });
    // ── 6. QR de cotejo Veri*factu ────────────────────────────────────────────
    let qrBase64;
    try {
        const pad = (n) => String(n).padStart(2, '0');
        const d = ticket.issuedAt;
        const fechaStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
        qrBase64 = await (0, qr_service_1.generateVerifactuQrBase64)({ nif: effectiveNif, nombre: effectiveName, fecha: fechaStr, num: ticket.invoiceCode, importe: (0, hash_service_1.formatDecimalForHash)(total) }, config_1.config.server.isDev ? 'preproduction' : 'production');
    }
    catch (e) {
        console.warn('[Tickets] Error generando QR:', e);
    }
    // ── 7. Envío asíncrono a AEAT ─────────────────────────────────────────────
    const verifactuPayload = (0, sign_service_1.buildVerifactuPayload)({ nif: effectiveNif, invoiceCode: ticket.invoiceCode, issuedAt: ticket.issuedAt, tipoFactura: 'F1', vatAmount, total, hashSelf: ticket.hashSelf, hashPrevious: ticket.hashPrevious });
    const signedPayload = (0, sign_service_1.signVerifactuPayload)(verifactuPayload);
    (0, sign_service_1.sendToAeat)(signedPayload)
        .then(async (r) => {
        await client_2.prisma.ticket.update({
            where: { id: ticket.id },
            data: { aeatStatus: r.code === '2000' ? 'ACCEPTED' : 'REJECTED', aeatSentAt: new Date(), aeatResponseCode: r.code, aeatResponseMsg: r.message, aeatPayloadJson: JSON.stringify(signedPayload.payload) },
        });
    })
        .catch(async (e) => {
        await client_2.prisma.ticket.update({ where: { id: ticket.id }, data: { aeatStatus: 'ERROR', aeatResponseMsg: e instanceof Error ? e.message : 'Error' } });
    });
    // ── 8. Impresión TCP ESC/POS ──────────────────────────────────────────────
    if (printerIp) {
        try {
            const buf = (0, printer_service_1.buildTicketBuffer)({
                businessName: effectiveName,
                businessNif: effectiveNif,
                businessAddress: effectiveAddress,
                invoiceCode: ticket.invoiceCode,
                issuedAt: ticket.issuedAt,
                tableNumber: order.table.number,
                waiterName: order.user.name,
                items: order.items.map((i) => ({ name: i.product.name, quantity: i.quantity, unitPrice: parseFloat(i.unitPrice.toString()), notes: (0, menuSelection_1.getVisibleNotes)(i.notes) })),
                subtotal, vatAmount, vatRate: dominantVatRate, total, qrBase64,
            });
            await (0, printer_service_1.sendToPrinter)({ ipAddress: printerIp, port: printerPort }, buf);
        }
        catch (e) {
            console.error('[Printing] Error al imprimir ticket:', e);
        }
    }
    return { ticketId: ticket.id, invoiceCode: ticket.invoiceCode, total, qrBase64 };
}
//# sourceMappingURL=tickets.service.js.map