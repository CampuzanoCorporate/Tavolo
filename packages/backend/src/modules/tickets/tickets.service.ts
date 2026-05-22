/**
 * ============================================================
 * MÓDULO TICKETS — Servicio de Cierre (v2 Multi-sede)
 * ============================================================
 * Ahora los datos fiscales (NIF, nombre, dirección) se obtienen
 * de la Venue y la Organisation en la DB, no del .env.
 * El encadenamiento de hashes es por venueId.
 * ============================================================
 */
import { Prisma, OrderStatus, TableStatus } from '@prisma/client';
import { prisma } from '../../db/client';
import {
  computeVerifactuHash,
  formatDecimalForHash,
  formatDateForHash,
  EMPTY_PREVIOUS_HASH,
} from '../verifactu/hash.service';
import { buildVerifactuPayload, signVerifactuPayload, sendToAeat } from '../verifactu/sign.service';
import { generateVerifactuQrBase64 } from '../verifactu/qr.service';
import { buildTicketBuffer, sendToPrinter } from '../printing/printer.service';
import { config } from '../../config';
import { getVisibleNotes } from '../orders/menuSelection';

export interface CloseTicketInput {
  orderId: number;
  userId: number;
  venueId: number;
  /** IP de impresora de caja. Si no se proporciona, no imprime. */
  printerIp?: string;
  printerPort?: number;
}

export interface CloseTicketResult {
  ticketId: number;
  invoiceCode: string;
  total: number;
  qrBase64?: string;
}

export async function closeTicket(input: CloseTicketInput): Promise<CloseTicketResult> {
  const { orderId, userId, venueId, printerIp, printerPort = 9100 } = input;

  // ── 1. Cargar pedido con items ────────────────────────────────────────────
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      table: true,
      user: true,
    },
  });

  if (!order) throw new Error(`Pedido #${orderId} no encontrado en la sede`);
  if (order.venueId !== venueId) throw new Error(`Pedido #${orderId} no pertenece a esta sede`);
  if (order.status === OrderStatus.CLOSED || order.status === OrderStatus.CANCELLED) {
    throw new Error(`El pedido #${orderId} ya está cerrado`);
  }
  if (order.items.length === 0) throw new Error(`El pedido #${orderId} no tiene productos`);

  // ── 2. Cargar datos fiscales de la sede ────────────────────────────────────
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: { organisation: true },
  });
  if (!venue) throw new Error(`Sede #${venueId} no encontrada`);

  // Resolver NIF y nombre efectivos (sede propia o heredado de la org)
  const effectiveNif     = venue.useOrgNif ? venue.organisation.nif     : (venue.nifOverride  ?? venue.organisation.nif);
  const effectiveName    = venue.useOrgNif ? venue.organisation.name     : (venue.nameOverride ?? venue.organisation.name);
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
  const ticket = await prisma.$transaction(async (tx) => {
    const lastTickets = await tx.$queryRaw<Array<{
      invoiceNumber: number;
      invoiceCode: string;
      hashSelf: string;
    }>>`
      SELECT "invoiceNumber", "invoiceCode", "hashSelf"
      FROM "tickets"
      WHERE "venueId" = ${venueId} AND "invoiceSeries" = ${venue.invoiceSeries}
      ORDER BY "invoiceNumber" DESC
      LIMIT 1
      FOR UPDATE
    `;

    const last = lastTickets[0];
    const nextNumber    = last ? last.invoiceNumber + 1 : 1;
    const year          = new Date().getFullYear();
    const invoiceCode   = `${venue.invoiceSeries}-${year}-${String(nextNumber).padStart(6, '0')}`;
    const previousHash  = last ? last.hashSelf : EMPTY_PREVIOUS_HASH;
    const issuedAt      = new Date();

    // Hash encadenado Veri*factu
    const hashSelf = computeVerifactuHash({
      idEmisorFactura:  effectiveNif,
      numSerieFactura:  invoiceCode,
      fechaExpedicion:  formatDateForHash(issuedAt),
      tipoFactura:      'F1',
      cuotaTotal:       formatDecimalForHash(vatAmount),
      importeTotal:     formatDecimalForHash(total),
      huellaAnterior:   previousHash,
    });

    const newTicket = await tx.ticket.create({
      data: {
        venueId,
        orderId,
        userId,
        invoiceSeries:       venue.invoiceSeries,
        invoiceNumber:       nextNumber,
        invoiceCode,
        subtotal:            new Prisma.Decimal(subtotal),
        vatAmount:           new Prisma.Decimal(vatAmount),
        total:               new Prisma.Decimal(total),
        hashSelf,
        hashPrevious:        previousHash,
        previousInvoiceCode: last?.invoiceCode ?? null,
        aeatStatus:          'PENDING',
        businessName:        effectiveName,
        businessNif:         effectiveNif,
        businessAddress:     effectiveAddress,
        issuedAt,
      },
    });

    await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CLOSED } });
    await tx.table.update({ where: { id: order.tableId }, data: { status: TableStatus.FREE } });

    return newTicket;
  });

  // ── 6. QR de cotejo Veri*factu ────────────────────────────────────────────
  let qrBase64: string | undefined;
  try {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = ticket.issuedAt;
    const fechaStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    qrBase64 = await generateVerifactuQrBase64(
      { nif: effectiveNif, nombre: effectiveName, fecha: fechaStr, num: ticket.invoiceCode, importe: formatDecimalForHash(total) },
      config.server.isDev ? 'preproduction' : 'production'
    );
  } catch (e) {
    console.warn('[Tickets] Error generando QR:', e);
  }

  // ── 7. Envío asíncrono a AEAT ─────────────────────────────────────────────
  const verifactuPayload = buildVerifactuPayload({ nif: effectiveNif, invoiceCode: ticket.invoiceCode, issuedAt: ticket.issuedAt, tipoFactura: 'F1', vatAmount, total, hashSelf: ticket.hashSelf, hashPrevious: ticket.hashPrevious });
  const signedPayload = signVerifactuPayload(verifactuPayload);

  sendToAeat(signedPayload)
    .then(async (r) => {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { aeatStatus: r.code === '2000' ? 'ACCEPTED' : 'REJECTED', aeatSentAt: new Date(), aeatResponseCode: r.code, aeatResponseMsg: r.message, aeatPayloadJson: JSON.stringify(signedPayload.payload) },
      });
    })
    .catch(async (e) => {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { aeatStatus: 'ERROR', aeatResponseMsg: e instanceof Error ? e.message : 'Error' } });
    });

  // ── 8. Impresión TCP ESC/POS ──────────────────────────────────────────────
  if (printerIp) {
    try {
      const buf = buildTicketBuffer({
        businessName:    effectiveName,
        businessNif:     effectiveNif,
        businessAddress: effectiveAddress,
        invoiceCode:     ticket.invoiceCode,
        issuedAt:        ticket.issuedAt,
        tableNumber:     order.table.number,
        waiterName:      order.user.name,
        items: order.items.map((i) => ({ name: i.product.name, quantity: i.quantity, unitPrice: parseFloat(i.unitPrice.toString()), notes: getVisibleNotes(i.notes) })),
        subtotal, vatAmount, vatRate: dominantVatRate, total, qrBase64,
      });
      await sendToPrinter({ ipAddress: printerIp, port: printerPort }, buf);
    } catch (e) {
      console.error('[Printing] Error al imprimir ticket:', e);
    }
  }

  return { ticketId: ticket.id, invoiceCode: ticket.invoiceCode, total, qrBase64 };
}
