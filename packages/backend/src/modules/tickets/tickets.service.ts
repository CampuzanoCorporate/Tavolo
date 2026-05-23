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
import { buildTicketBuffer, buildTicketPreviewText, sendToPrinter } from '../printing/printer.service';
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

export interface CashSummaryResult {
  periodStart: Date;
  periodEnd: Date;
  ticketCount: number;
  billedTotal: number;
  tickets: Array<{
    id: number;
    invoiceCode: string;
    issuedAt: Date;
    total: Prisma.Decimal;
  }>;
}

function isMissingCashClosuresTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
}

function buildPrintableTicketPayload(ticket: {
  invoiceCode: string;
  issuedAt: Date;
  subtotal: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  businessName: string;
  businessNif: string;
  businessAddress: string;
  qrBase64?: string | null;
}, order: {
  table: { number: number };
  user: { name: string };
  items: Array<{
    quantity: number;
    unitPrice: Prisma.Decimal;
    vatRate: Prisma.Decimal;
    notes: string | null;
    product: { name: string };
  }>;
}) {
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
      notes: getVisibleNotes(item.notes),
    })),
    subtotal: parseFloat(ticket.subtotal.toString()),
    vatAmount: parseFloat(ticket.vatAmount.toString()),
    vatRate: dominantVatRate,
    total: parseFloat(ticket.total.toString()),
    qrBase64: ticket.qrBase64 ?? undefined,
  };
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

export interface ClosePartialTicketInput {
  originalOrderId: number;
  userId: number;
  venueId: number;
  items: Array<{
    productId: number;
    quantity: number;
    notes?: string | null;
    unitPrice: number;
    vatRate: number;
  }>;
  splitMode?: 'QUANTITY' | 'PRICE';
  printerIp?: string;
  printerPort?: number;
}

export async function closePartialTicket(input: ClosePartialTicketInput): Promise<CloseTicketResult> {
  const { originalOrderId, userId, venueId, items, splitMode = 'QUANTITY', printerIp, printerPort = 9100 } = input;

  // 1. Cargar el pedido original
  const originalOrder = await prisma.order.findUnique({
    where: { id: originalOrderId },
    include: {
      items: true,
      table: true,
    },
  });

  if (!originalOrder) throw new Error(`Pedido #${originalOrderId} no encontrado`);
  if (originalOrder.venueId !== venueId) throw new Error(`El pedido #${originalOrderId} no pertenece a esta sede`);
  if (originalOrder.status === OrderStatus.CLOSED || originalOrder.status === OrderStatus.CANCELLED) {
    throw new Error(`El pedido #${originalOrderId} ya está cerrado o cancelado`);
  }

  // 2. Realizar la separación en una transacción atómica de Prisma
  const partialOrder = await prisma.$transaction(async (tx) => {
    // a. Descontar las cantidades o precios del pedido original
    for (const selectedItem of items) {
      const originalItem = originalOrder.items.find(
        (oi) => oi.productId === selectedItem.productId && oi.notes === (selectedItem.notes || null)
      );

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
        } else {
          // Descontar el precio del artículo comanda original
          await tx.orderItem.update({
            where: { id: originalItem.id },
            data: { unitPrice: new Prisma.Decimal(remainingPrice) },
          });
        }
      } else {
        if (selectedItem.quantity > originalItem.quantity) {
          throw new Error(
            `La cantidad a separar (${selectedItem.quantity}) es mayor que la existente (${originalItem.quantity}) para el producto #${selectedItem.productId}`
          );
        }

        const remainingQty = originalItem.quantity - selectedItem.quantity;
        if (remainingQty <= 0) {
          // Eliminar la línea completa
          await tx.orderItem.delete({
            where: { id: originalItem.id },
          });
        } else {
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
        status: OrderStatus.OPEN,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            vatRate: new Prisma.Decimal(item.vatRate),
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
  const remainingCount = await prisma.orderItem.count({
    where: { orderId: originalOrderId },
  });

  if (remainingCount > 0) {
    await prisma.table.update({
      where: { id: originalOrder.tableId },
      data: { status: TableStatus.BILL_REQUESTED },
    });
  } else {
    // Si no queda nada en el pedido original, lo marcamos como cancelado
    await prisma.order.update({
      where: { id: originalOrderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  return result;
}

export async function getTicketPreview(ticketId: number) {
  const ticket = await prisma.ticket.findUnique({
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
    preview: buildTicketPreviewText(payload),
  };
}

export async function reprintTicket(ticketId: number) {
  const ticket = await prisma.ticket.findUnique({
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

  const printer = await prisma.printer.findFirst({
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
  const buffer = buildTicketBuffer(payload);
  await sendToPrinter({ ipAddress: printer.ipAddress, port: printer.port }, buffer);

  return { success: true };
}

export async function getCashSummary(venueId: number): Promise<CashSummaryResult> {
  let lastClosure: { periodEnd: Date } | null = null;
  try {
    lastClosure = await prisma.cashClosure.findFirst({
      where: { venueId },
      orderBy: { periodEnd: 'desc' },
      select: { periodEnd: true },
    });
  } catch (error) {
    if (!isMissingCashClosuresTable(error)) throw error;
  }

  const periodStart = lastClosure?.periodEnd ?? new Date(new Date().setHours(0, 0, 0, 0));
  const periodEnd = new Date();

  const [tickets, aggregate] = await Promise.all([
    prisma.ticket.findMany({
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
    prisma.ticket.aggregate({
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

export async function closeCashRegister(input: { venueId: number; userId: number; notes?: string }) {
  const summary = await getCashSummary(input.venueId);
  let closure;
  try {
    closure = await prisma.cashClosure.create({
      data: {
        venueId: input.venueId,
        userId: input.userId,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        ticketCount: summary.ticketCount,
        billedTotal: new Prisma.Decimal(summary.billedTotal),
        notes: input.notes,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });
  } catch (error) {
    if (isMissingCashClosuresTable(error)) {
      throw new Error('La tabla de cierres de caja aún no está aplicada en la base de datos');
    }
    throw error;
  }

  return closure;
}
