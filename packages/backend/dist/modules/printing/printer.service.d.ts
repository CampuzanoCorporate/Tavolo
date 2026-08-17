export declare const ESCPOS: {
    /** Inicializar impresora (resetea configuración) */
    readonly INIT: Buffer<ArrayBuffer>;
    /** Alineación izquierda */
    readonly ALIGN_LEFT: Buffer<ArrayBuffer>;
    /** Alineación centrada */
    readonly ALIGN_CENTER: Buffer<ArrayBuffer>;
    /** Alineación derecha */
    readonly ALIGN_RIGHT: Buffer<ArrayBuffer>;
    /** Negrita activada */
    readonly BOLD_ON: Buffer<ArrayBuffer>;
    /** Negrita desactivada */
    readonly BOLD_OFF: Buffer<ArrayBuffer>;
    /** Doble tamaño (ancho + alto) */
    readonly DOUBLE_SIZE_ON: Buffer<ArrayBuffer>;
    /** Tamaño normal */
    readonly DOUBLE_SIZE_OFF: Buffer<ArrayBuffer>;
    /** Subrayado activado */
    readonly UNDERLINE_ON: Buffer<ArrayBuffer>;
    /** Subrayado desactivado */
    readonly UNDERLINE_OFF: Buffer<ArrayBuffer>;
    /** Avance de línea */
    readonly NEWLINE: Buffer<ArrayBuffer>;
    /** Corte de papel parcial */
    readonly CUT_PARTIAL: Buffer<ArrayBuffer>;
    /** Corte de papel total */
    readonly CUT_FULL: Buffer<ArrayBuffer>;
    /** Abrir cajón portamonedas (pin 2) */
    readonly OPEN_DRAWER: Buffer<ArrayBuffer>;
};
export interface PrinterTarget {
    /** Dirección IP de la impresora en la red local */
    ipAddress?: string;
    /** Puerto TCP (default: 9100 para ESC/POS) */
    port?: number;
    /** Nombre de la impresora dada de alta en el sistema operativo */
    systemName?: string;
    /** Modo de conexión */
    connectionType?: 'NETWORK' | 'SYSTEM';
    /** Timeout de conexión en ms (default: 5000) */
    timeoutMs?: number;
}
export interface PrintTicketData {
    /** Nombre del negocio */
    businessName: string;
    /** NIF del negocio */
    businessNif: string;
    /** Dirección del negocio */
    businessAddress: string;
    /** Código de factura (ej: "T-2024-000001") */
    invoiceCode: string;
    /** Fecha y hora de emisión */
    issuedAt: Date;
    /** Número de mesa */
    tableNumber: number;
    /** Nombre del camarero */
    waiterName: string;
    /** Líneas del ticket */
    items: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        notes?: string;
    }>;
    subtotal: number;
    vatAmount: number;
    vatRate: number;
    total: number;
    /** Logotipo PNG en base64, ya normalizado para impresión */
    logoPngBase64?: string | null;
    /** QR de cotejo Veri*factu (Base64 PNG) — opcional */
    qrBase64?: string;
}
export interface PrintCommandaData {
    tableNumber: number;
    waiterName: string;
    orderTime: Date;
    items: Array<{
        name: string;
        quantity: number;
        description?: string;
        notes?: string;
    }>;
    isCancellation?: boolean;
}
export interface KitchenMessageData {
    message: string;
    waiterName: string;
    reference?: string;
    createdAt: Date;
}
/**
 * Envía un buffer de datos a una impresora de red vía TCP.
 *
 * @param target - Configuración de la impresora (IP + puerto)
 * @param data - Buffer de datos ESC/POS a enviar
 * @returns Promise que resuelve cuando el envío es exitoso
 * @throws Error si no se puede conectar a la impresora
 */
export declare function sendToPrinter(target: PrinterTarget, data: Buffer): Promise<void>;
export declare function listSystemPrinters(): Promise<string[]>;
/**
 * Construye el buffer ESC/POS de un ticket/factura completo.
 *
 * @param data - Datos del ticket a imprimir
 * @returns Buffer listo para enviar a la impresora
 */
export declare function buildTicketBuffer(data: PrintTicketData): Buffer;
export declare function buildTicketPreviewText(data: PrintTicketData): string;
/**
 * Construye el buffer ESC/POS de una comanda de cocina.
 * Letra grande para máxima legibilidad en cocina.
 *
 * @param data - Datos de la comanda
 * @returns Buffer listo para enviar a la impresora de cocina
 */
export declare function buildCommandaBuffer(data: PrintCommandaData): Buffer;
export declare function buildCommandaPreviewText(data: PrintCommandaData): string;
export declare function buildKitchenMessageBuffer(data: KitchenMessageData): Buffer;
//# sourceMappingURL=printer.service.d.ts.map