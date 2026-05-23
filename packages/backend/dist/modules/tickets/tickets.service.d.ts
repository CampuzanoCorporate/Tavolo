/**
 * ============================================================
 * MÓDULO TICKETS — Servicio de Cierre (v2 Multi-sede)
 * ============================================================
 * Ahora los datos fiscales (NIF, nombre, dirección) se obtienen
 * de la Venue y la Organisation en la DB, no del .env.
 * El encadenamiento de hashes es por venueId.
 * ============================================================
 */
import { Prisma } from '@prisma/client';
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
export declare function closeTicket(input: CloseTicketInput): Promise<CloseTicketResult>;
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
export declare function closePartialTicket(input: ClosePartialTicketInput): Promise<CloseTicketResult>;
export declare function getTicketPreview(ticketId: number): Promise<{
    ticket: {
        order: {
            user: {
                id: number;
                email: string;
                name: string;
                role: import(".prisma/client").$Enums.Role;
                password: string;
                organisationId: number;
                isActive: boolean;
                createdAt: Date;
                updatedAt: Date;
            };
            table: {
                number: number;
                id: number;
                name: string | null;
                venueId: number;
                status: import(".prisma/client").$Enums.TableStatus;
                width: number;
                seats: number;
                zone: string | null;
                posX: number;
                posY: number;
                objectType: string;
                height: number;
            };
            items: ({
                product: {
                    id: number;
                    name: string;
                    venueId: number;
                    vatRate: Prisma.Decimal;
                    description: string | null;
                    price: Prisma.Decimal;
                    categoryId: number;
                    productType: import(".prisma/client").$Enums.ProductType;
                    menuCourseTags: string[];
                    menuConfig: Prisma.JsonValue | null;
                    isAvailable: boolean;
                    imagePath: string | null;
                    sortOrder: number;
                    preparationStationId: number | null;
                };
            } & {
                id: number;
                orderId: number;
                notes: string | null;
                productId: number;
                quantity: number;
                unitPrice: Prisma.Decimal;
                vatRate: Prisma.Decimal;
            })[];
        } & {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            userId: number;
            venueId: number;
            status: import(".prisma/client").$Enums.OrderStatus;
            tableId: number;
            notes: string | null;
        };
    } & {
        id: number;
        userId: number;
        venueId: number;
        invoiceSeries: string;
        orderId: number;
        invoiceNumber: number;
        invoiceCode: string;
        subtotal: Prisma.Decimal;
        vatAmount: Prisma.Decimal;
        total: Prisma.Decimal;
        hashSelf: string;
        hashPrevious: string;
        previousInvoiceCode: string | null;
        aeatStatus: import(".prisma/client").$Enums.AeatStatus;
        aeatSentAt: Date | null;
        aeatResponseCode: string | null;
        aeatResponseMsg: string | null;
        aeatPayloadJson: string | null;
        issuedAt: Date;
        businessName: string;
        businessNif: string;
        businessAddress: string;
    };
    preview: string;
}>;
export declare function reprintTicket(ticketId: number): Promise<{
    success: boolean;
}>;
export declare function getCashSummary(venueId: number): Promise<CashSummaryResult>;
export declare function closeCashRegister(input: {
    venueId: number;
    userId: number;
    notes?: string;
}): Promise<{
    user: {
        id: number;
        name: string;
    };
} & {
    id: number;
    createdAt: Date;
    userId: number;
    venueId: number;
    notes: string | null;
    periodStart: Date;
    periodEnd: Date;
    ticketCount: number;
    billedTotal: Prisma.Decimal;
}>;
//# sourceMappingURL=tickets.service.d.ts.map