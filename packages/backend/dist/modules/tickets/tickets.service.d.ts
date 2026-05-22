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
export declare function closeTicket(input: CloseTicketInput): Promise<CloseTicketResult>;
//# sourceMappingURL=tickets.service.d.ts.map