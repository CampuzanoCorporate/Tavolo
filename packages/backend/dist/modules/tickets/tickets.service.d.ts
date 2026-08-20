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
    paymentMethod: 'CASH' | 'CARD';
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
export interface CashClosurePrintResult {
    id: number;
    preview: string;
    rawBase64: string;
}
export interface CashSummaryResult {
    activeSession: {
        id: number;
        status: 'OPEN' | 'CLOSED';
        openedAt: Date;
        openingAmount: number;
        openingNotes?: string | null;
        openedBy: {
            id: number;
            name: string;
        };
    } | null;
    periodStart: Date;
    periodEnd: Date;
    ticketCount: number;
    billedTotal: number;
    openingAmount: number;
    manualInTotal: number;
    manualOutTotal: number;
    cashSalesTotal: number;
    cardSalesTotal: number;
    vatTotal: number;
    expectedAmount: number;
    tickets: Array<{
        id: number;
        invoiceCode: string;
        issuedAt: Date;
        total: Prisma.Decimal;
    }>;
    movements: Array<{
        id: number;
        type: 'OPENING' | 'CASH_IN' | 'CASH_OUT' | 'TICKET';
        amount: number;
        description?: string | null;
        createdAt: Date;
        user: {
            id: number;
            name: string;
        };
        ticket?: {
            id: number;
            invoiceCode: string;
        } | null;
    }>;
}
export interface CashSessionResult {
    id: number;
    venueId: number;
    openedAt: Date;
    openingAmount: Prisma.Decimal;
    openingNotes: string | null;
    status: 'OPEN' | 'CLOSED';
    openedByUser: {
        id: number;
        name: string;
    };
}
export declare function closeTicket(input: CloseTicketInput): Promise<CloseTicketResult>;
export interface ClosePartialTicketInput {
    originalOrderId: number;
    userId: number;
    venueId: number;
    paymentMethod: 'CASH' | 'CARD';
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
                permissions: string[];
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
                height: number;
                seats: number;
                zone: string | null;
                posX: number;
                posY: number;
                objectType: string;
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
                notes: string | null;
                vatRate: Prisma.Decimal;
                orderId: number;
                productId: number;
                quantity: number;
                unitPrice: Prisma.Decimal;
            })[];
        } & {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            userId: number;
            venueId: number;
            status: import(".prisma/client").$Enums.OrderStatus;
            notes: string | null;
            tableId: number;
        };
    } & {
        id: number;
        userId: number;
        venueId: number;
        invoiceSeries: string;
        orderId: number;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
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
export declare function getTicketRaw(ticketId: number): Promise<{
    ticket: {
        id: number;
        invoiceCode: string;
        issuedAt: string;
        total: Prisma.Decimal;
        businessName: string;
    };
    rawBase64: string;
    preview: string;
}>;
export declare function reprintTicket(ticketId: number): Promise<{
    success: boolean;
}>;
export declare function getCashClosurePreview(closureId: number): Promise<CashClosurePrintResult>;
export declare function getCashClosureRaw(closureId: number): Promise<CashClosurePrintResult>;
export declare function reprintCashClosure(closureId: number): Promise<{
    success: boolean;
    preview: string;
    rawBase64: string;
}>;
export declare function getCashSummary(venueId: number): Promise<CashSummaryResult>;
export declare function openCashSession(input: {
    venueId: number;
    userId: number;
    openingAmount: number;
    notes?: string;
}): Promise<CashSessionResult>;
export declare function addCashMovement(input: {
    venueId: number;
    userId: number;
    type: 'CASH_IN' | 'CASH_OUT';
    amount: number;
    description: string;
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
    type: import(".prisma/client").$Enums.CashMovementType;
    sessionId: number;
    amount: Prisma.Decimal;
    description: string | null;
    ticketId: number | null;
}>;
export declare function closeCashRegister(input: {
    venueId: number;
    userId: number;
    countedAmount: number;
    notes?: string;
    printerIp?: string;
    printerPort?: number;
}): Promise<({
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
    sessionId: number | null;
    periodStart: Date;
    periodEnd: Date;
    ticketCount: number;
    billedTotal: Prisma.Decimal;
    openingAmount: Prisma.Decimal;
    manualInTotal: Prisma.Decimal;
    manualOutTotal: Prisma.Decimal;
    cashSalesTotal: Prisma.Decimal;
    cardSalesTotal: Prisma.Decimal;
    vatTotal: Prisma.Decimal;
    expectedAmount: Prisma.Decimal;
    countedAmount: Prisma.Decimal;
    discrepancyAmount: Prisma.Decimal;
}) | {
    preview: string;
    rawBase64: string;
    printed: boolean;
    user: {
        id: number;
        name: string;
    };
    id: number;
    createdAt: Date;
    userId: number;
    venueId: number;
    notes: string | null;
    sessionId: number | null;
    periodStart: Date;
    periodEnd: Date;
    ticketCount: number;
    billedTotal: Prisma.Decimal;
    openingAmount: Prisma.Decimal;
    manualInTotal: Prisma.Decimal;
    manualOutTotal: Prisma.Decimal;
    cashSalesTotal: Prisma.Decimal;
    cardSalesTotal: Prisma.Decimal;
    vatTotal: Prisma.Decimal;
    expectedAmount: Prisma.Decimal;
    countedAmount: Prisma.Decimal;
    discrepancyAmount: Prisma.Decimal;
}>;
//# sourceMappingURL=tickets.service.d.ts.map