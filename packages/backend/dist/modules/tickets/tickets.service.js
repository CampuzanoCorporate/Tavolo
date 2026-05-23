"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeTicket = closeTicket;
exports.closePartialTicket = closePartialTicket;
exports.getTicketPreview = getTicketPreview;
exports.reprintTicket = reprintTicket;
exports.getCashSummary = getCashSummary;
exports.closeCashRegister = closeCashRegister;
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
function isMissingCashClosuresTable(error) {
    return error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
}
function buildPrintableTicketPayload(ticket, order) {
    const dominantVatRate = parseFloat(order.items[0]?.vatRate.toString() ?? '10');
    return {
        businessName: ticket.businessName,
        businessNif: ticket.businessNif,
        businessAddress: ticket.businessAddress,
        invoiceCode: ticket.invoiceCode,
        issuedAt: ticket.issuedAt,
        tableNumber: order.table.number,
        waiterName: order.user.name,
        items: order.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice.toString()),
            notes: (0, menuSelection_1.getVisibleNotes)(item.notes),
        })),
        subtotal: parseFloat(ticket.subtotal.toString()),
        vatAmount: parseFloat(ticket.vatAmount.toString()),
        vatRate: dominantVatRate,
        total: parseFloat(ticket.total.toString()),
        qrBase64: ticket.qrBase64 ?? undefined,
    };
}
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
async function closePartialTicket(input) {
    const { originalOrderId, userId, venueId, items, splitMode = 'QUANTITY', printerIp, printerPort = 9100 } = input;
    // 1. Cargar el pedido original
    const originalOrder = await client_2.prisma.order.findUnique({
        where: { id: originalOrderId },
        include: {
            items: true,
            table: true,
        },
    });
    if (!originalOrder)
        throw new Error(`Pedido #${originalOrderId} no encontrado`);
    if (originalOrder.venueId !== venueId)
        throw new Error(`El pedido #${originalOrderId} no pertenece a esta sede`);
    if (originalOrder.status === client_1.OrderStatus.CLOSED || originalOrder.status === client_1.OrderStatus.CANCELLED) {
        throw new Error(`El pedido #${originalOrderId} ya está cerrado o cancelado`);
    }
    // 2. Realizar la separación en una transacción atómica de Prisma
    const partialOrder = await client_2.prisma.$transaction(async (tx) => {
        // a. Descontar las cantidades o precios del pedido original
        for (const selectedItem of items) {
            const originalItem = originalOrder.items.find((oi) => oi.productId === selectedItem.productId && oi.notes === (selectedItem.notes || null));
            if (!originalItem) {
                throw new Error(`El producto #${selectedItem.productId} no está en la comanda original con las mismas notas`);
            }
            if (splitMode === 'PRICE') {
                const remainingPrice = Number(originalItem.unitPrice) - selectedItem.unitPrice;
                if (remainingPrice <= 0.01) {
                    // Si el precio restante es insignificante, eliminar la línea completa
                    await tx.orderItem.delete({
                        where: { id: originalItem.id },
                    });
                }
                else {
                    // Descontar el precio del artículo comanda original
                    await tx.orderItem.update({
                        where: { id: originalItem.id },
                        data: { unitPrice: new client_1.Prisma.Decimal(remainingPrice) },
                    });
                }
            }
            else {
                if (selectedItem.quantity > originalItem.quantity) {
                    throw new Error(`La cantidad a separar (${selectedItem.quantity}) es mayor que la existente (${originalItem.quantity}) para el producto #${selectedItem.productId}`);
                }
                const remainingQty = originalItem.quantity - selectedItem.quantity;
                if (remainingQty <= 0) {
                    // Eliminar la línea completa
                    await tx.orderItem.delete({
                        where: { id: originalItem.id },
                    });
                }
                else {
                    // Actualizar la cantidad
                    await tx.orderItem.update({
                        where: { id: originalItem.id },
                        data: { quantity: remainingQty },
                    });
                }
            }
        }
        // b. Crear un nuevo pedido temporal para cobrar
        const newOrder = await tx.order.create({
            data: {
                venueId,
                tableId: originalOrder.tableId,
                userId,
                status: client_1.OrderStatus.OPEN,
                items: {
                    create: items.map((item) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitPrice: new client_1.Prisma.Decimal(item.unitPrice),
                        vatRate: new client_1.Prisma.Decimal(item.vatRate),
                        notes: item.notes || null,
                    })),
                },
            },
        });
        return newOrder;
    });
    // 3. Invocar closeTicket oficial en el nuevo pedido temporal
    const result = await closeTicket({
        orderId: partialOrder.id,
        userId,
        venueId,
        printerIp,
        printerPort,
    });
    // 4. Si el pedido original aún conserva algún artículo, restaurar el estado de la mesa a Cuenta (BILL_REQUESTED)
    const remainingCount = await client_2.prisma.orderItem.count({
        where: { orderId: originalOrderId },
    });
    if (remainingCount > 0) {
        await client_2.prisma.table.update({
            where: { id: originalOrder.tableId },
            data: { status: client_1.TableStatus.BILL_REQUESTED },
        });
    }
    else {
        // Si no queda nada en el pedido original, lo marcamos como cancelado
        await client_2.prisma.order.update({
            where: { id: originalOrderId },
            data: { status: client_1.OrderStatus.CANCELLED },
        });
    }
    return result;
}
async function getTicketPreview(ticketId) {
    const ticket = await client_2.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
            order: {
                include: {
                    items: { include: { product: true } },
                    table: true,
                    user: true,
                },
            },
        },
    });
    if (!ticket) {
        throw new Error('Ticket no encontrado');
    }
    const payload = buildPrintableTicketPayload(ticket, ticket.order);
    return {
        ticket,
        preview: (0, printer_service_1.buildTicketPreviewText)(payload),
    };
}
async function reprintTicket(ticketId) {
    const ticket = await client_2.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
            order: {
                include: {
                    items: { include: { product: true } },
                    table: true,
                    user: true,
                },
            },
            venue: true,
        },
    });
    if (!ticket) {
        throw new Error('Ticket no encontrado');
    }
    const printer = await client_2.prisma.printer.findFirst({
        where: {
            venueId: ticket.venueId,
            type: 'RECEIPT',
            isActive: true,
        },
        orderBy: { id: 'asc' },
    });
    if (!printer) {
        throw new Error('No hay impresora de tickets activa en esta sede');
    }
    const payload = buildPrintableTicketPayload(ticket, ticket.order);
    const buffer = (0, printer_service_1.buildTicketBuffer)(payload);
    await (0, printer_service_1.sendToPrinter)({ ipAddress: printer.ipAddress, port: printer.port }, buffer);
    return { success: true };
}
async function getCashSummary(venueId) {
    let lastClosure = null;
    try {
        lastClosure = await client_2.prisma.cashClosure.findFirst({
            where: { venueId },
            orderBy: { periodEnd: 'desc' },
            select: { periodEnd: true },
        });
    }
    catch (error) {
        if (!isMissingCashClosuresTable(error))
            throw error;
    }
    const periodStart = lastClosure?.periodEnd ?? new Date(new Date().setHours(0, 0, 0, 0));
    const periodEnd = new Date();
    const [tickets, aggregate] = await Promise.all([
        client_2.prisma.ticket.findMany({
            where: {
                venueId,
                issuedAt: { gt: periodStart, lte: periodEnd },
            },
            orderBy: { issuedAt: 'desc' },
            take: 50,
            select: {
                id: true,
                invoiceCode: true,
                issuedAt: true,
                total: true,
            },
        }),
        client_2.prisma.ticket.aggregate({
            where: {
                venueId,
                issuedAt: { gt: periodStart, lte: periodEnd },
            },
            _count: { id: true },
            _sum: { total: true },
        }),
    ]);
    return {
        periodStart,
        periodEnd,
        ticketCount: aggregate._count.id,
        billedTotal: Number(aggregate._sum.total ?? 0),
        tickets,
    };
}
async function closeCashRegister(input) {
    const summary = await getCashSummary(input.venueId);
    let closure;
    try {
        closure = await client_2.prisma.cashClosure.create({
            data: {
                venueId: input.venueId,
                userId: input.userId,
                periodStart: summary.periodStart,
                periodEnd: summary.periodEnd,
                ticketCount: summary.ticketCount,
                billedTotal: new client_1.Prisma.Decimal(summary.billedTotal),
                notes: input.notes,
            },
            include: {
                user: {
                    select: { id: true, name: true },
                },
            },
        });
    }
    catch (error) {
        if (isMissingCashClosuresTable(error)) {
            throw new Error('La tabla de cierres de caja aún no está aplicada en la base de datos');
        }
        throw error;
    }
    return closure;
}
//# sourceMappingURL=tickets.service.js.map