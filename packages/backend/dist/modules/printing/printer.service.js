"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESCPOS = void 0;
exports.sendToPrinter = sendToPrinter;
exports.buildTicketBuffer = buildTicketBuffer;
exports.buildTicketPreviewText = buildTicketPreviewText;
exports.buildCommandaBuffer = buildCommandaBuffer;
exports.buildCommandaPreviewText = buildCommandaPreviewText;
exports.buildKitchenMessageBuffer = buildKitchenMessageBuffer;
/**
 * ============================================================
 * MÓDULO DE IMPRESIÓN — Servicio TCP Socket ESC/POS
 * ============================================================
 *
 * Envía comandos ESC/POS directamente a impresoras de red
 * (Ethernet/Wi-Fi) mediante socket TCP en el puerto 9100.
 *
 * Compatible con:
 *   - Epson TM-T20, TM-T88 series
 *   - Star TSP100, TSP650 series
 *   - Cualquier impresora con emulación ESC/POS
 *
 * ⚠️  REQUISITO DE RED: El backend debe tener acceso directo
 *     a la red local donde están las impresoras.
 * ============================================================
 */
const net_1 = __importDefault(require("net"));
// ─── CONSTANTES ESC/POS ────────────────────────────────────────────────────
/** Comandos ESC/POS estándar */
const ESC = 0x1b;
const GS = 0x1d;
exports.ESCPOS = {
    /** Inicializar impresora (resetea configuración) */
    INIT: Buffer.from([ESC, 0x40]),
    /** Alineación izquierda */
    ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
    /** Alineación centrada */
    ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
    /** Alineación derecha */
    ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
    /** Negrita activada */
    BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
    /** Negrita desactivada */
    BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
    /** Doble tamaño (ancho + alto) */
    DOUBLE_SIZE_ON: Buffer.from([GS, 0x21, 0x11]),
    /** Tamaño normal */
    DOUBLE_SIZE_OFF: Buffer.from([GS, 0x21, 0x00]),
    /** Subrayado activado */
    UNDERLINE_ON: Buffer.from([ESC, 0x2d, 0x01]),
    /** Subrayado desactivado */
    UNDERLINE_OFF: Buffer.from([ESC, 0x2d, 0x00]),
    /** Avance de línea */
    NEWLINE: Buffer.from([0x0a]),
    /** Corte de papel parcial */
    CUT_PARTIAL: Buffer.from([GS, 0x56, 0x41, 0x03]),
    /** Corte de papel total */
    CUT_FULL: Buffer.from([GS, 0x56, 0x00]),
    /** Abrir cajón portamonedas (pin 2) */
    OPEN_DRAWER: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]),
};
// ─── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────
/**
 * Envía un buffer de datos a una impresora de red vía TCP.
 *
 * @param target - Configuración de la impresora (IP + puerto)
 * @param data - Buffer de datos ESC/POS a enviar
 * @returns Promise que resuelve cuando el envío es exitoso
 * @throws Error si no se puede conectar a la impresora
 */
function sendToPrinter(target, data) {
    const { ipAddress, port = 9100, timeoutMs = 5000 } = target;
    return new Promise((resolve, reject) => {
        const socket = new net_1.default.Socket();
        socket.setTimeout(timeoutMs);
        socket.connect(port, ipAddress, () => {
            socket.write(data, (writeError) => {
                if (writeError) {
                    socket.destroy();
                    reject(new Error(`Error al escribir en impresora ${ipAddress}: ${writeError.message}`));
                    return;
                }
                // Dar tiempo a la impresora para procesar antes de cerrar
                setTimeout(() => {
                    socket.end();
                    resolve();
                }, 200);
            });
        });
        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error(`Timeout conectando a impresora ${ipAddress}:${port}`));
        });
        socket.on('error', (err) => {
            socket.destroy();
            reject(new Error(`Error de red con impresora ${ipAddress}:${port} — ${err.message}`));
        });
    });
}
// ─── CONSTRUCTORES DE TICKETS ──────────────────────────────────────────────
/**
 * Construye el buffer ESC/POS de un ticket/factura completo.
 *
 * @param data - Datos del ticket a imprimir
 * @returns Buffer listo para enviar a la impresora
 */
function buildTicketBuffer(data) {
    const parts = [];
    const text = (str) => Buffer.from(str, 'latin1');
    const nl = exports.ESCPOS.NEWLINE;
    const line = (char = '-', length = 42) => text(char.repeat(length));
    // ── Inicializar impresora
    parts.push(exports.ESCPOS.INIT);
    // ── Cabecera: nombre del negocio
    parts.push(exports.ESCPOS.ALIGN_CENTER);
    parts.push(exports.ESCPOS.BOLD_ON, exports.ESCPOS.DOUBLE_SIZE_ON);
    parts.push(text(data.businessName.toUpperCase().substring(0, 20)));
    parts.push(nl);
    parts.push(exports.ESCPOS.DOUBLE_SIZE_OFF, exports.ESCPOS.BOLD_OFF);
    parts.push(text(data.businessAddress), nl);
    parts.push(text(`NIF: ${data.businessNif}`), nl);
    parts.push(nl);
    parts.push(line(), nl);
    // ── Info del ticket
    parts.push(exports.ESCPOS.ALIGN_LEFT);
    const fecha = data.issuedAt;
    const pad = (n) => String(n).padStart(2, '0');
    const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
    parts.push(text(`Factura: ${data.invoiceCode}`), nl);
    parts.push(text(`Fecha:   ${fechaStr}`), nl);
    parts.push(text(`Mesa:    ${data.tableNumber}   Camarero: ${data.waiterName}`), nl);
    parts.push(line(), nl);
    // ── Líneas de producto
    parts.push(exports.ESCPOS.BOLD_ON);
    parts.push(text('Descripcion            Cant   Precio'), nl);
    parts.push(exports.ESCPOS.BOLD_OFF);
    parts.push(line(), nl);
    for (const item of data.items) {
        const name = item.name.substring(0, 22).padEnd(22, ' ');
        const qty = String(item.quantity).padStart(4, ' ');
        const price = (item.quantity * item.unitPrice).toFixed(2).padStart(8, ' ');
        parts.push(text(`${name}${qty}  ${price}EUR`), nl);
        if (item.notes) {
            parts.push(text(`  >> ${item.notes.substring(0, 35)}`), nl);
        }
    }
    parts.push(line(), nl);
    // ── Totales
    parts.push(exports.ESCPOS.ALIGN_RIGHT);
    parts.push(text(`Subtotal:  ${data.subtotal.toFixed(2)} EUR`), nl);
    parts.push(text(`IVA (${data.vatRate}%): ${data.vatAmount.toFixed(2)} EUR`), nl);
    parts.push(nl);
    parts.push(exports.ESCPOS.BOLD_ON, exports.ESCPOS.DOUBLE_SIZE_ON);
    parts.push(text(`TOTAL: ${data.total.toFixed(2)} EUR`), nl);
    parts.push(exports.ESCPOS.DOUBLE_SIZE_OFF, exports.ESCPOS.BOLD_OFF);
    parts.push(nl);
    // ── Pie: Veri*factu y mensaje
    parts.push(exports.ESCPOS.ALIGN_CENTER);
    parts.push(line('='), nl);
    parts.push(text('Factura verificable en sede.agenciatributaria.gob.es'), nl);
    parts.push(text('Veri*factu RD 1007/2023'), nl);
    parts.push(nl);
    parts.push(text('Gracias por su visita'), nl);
    parts.push(nl, nl, nl);
    // ── Corte de papel
    parts.push(exports.ESCPOS.CUT_PARTIAL);
    return Buffer.concat(parts);
}
function buildTicketPreviewText(data) {
    const pad = (n) => String(n).padStart(2, '0');
    const fecha = data.issuedAt;
    const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
    const lines = [
        data.businessName.toUpperCase(),
        data.businessAddress,
        `NIF: ${data.businessNif}`,
        '------------------------------------------',
        `Factura: ${data.invoiceCode}`,
        `Fecha:   ${fechaStr}`,
        `Mesa:    ${data.tableNumber}   Camarero: ${data.waiterName}`,
        '------------------------------------------',
        'Descripcion            Cant   Precio',
        '------------------------------------------',
    ];
    for (const item of data.items) {
        const name = item.name.substring(0, 22).padEnd(22, ' ');
        const qty = String(item.quantity).padStart(4, ' ');
        const price = (item.quantity * item.unitPrice).toFixed(2).padStart(8, ' ');
        lines.push(`${name}${qty}  ${price}EUR`);
        if (item.notes)
            lines.push(`  >> ${item.notes.substring(0, 35)}`);
    }
    lines.push('------------------------------------------');
    lines.push(`Subtotal:  ${data.subtotal.toFixed(2)} EUR`);
    lines.push(`IVA (${data.vatRate}%): ${data.vatAmount.toFixed(2)} EUR`);
    lines.push(`TOTAL: ${data.total.toFixed(2)} EUR`);
    lines.push('==========================================');
    lines.push('Gracias por su visita');
    return lines.join('\n');
}
/**
 * Construye el buffer ESC/POS de una comanda de cocina.
 * Letra grande para máxima legibilidad en cocina.
 *
 * @param data - Datos de la comanda
 * @returns Buffer listo para enviar a la impresora de cocina
 */
function buildCommandaBuffer(data) {
    const parts = [];
    const text = (str) => Buffer.from(str, 'latin1');
    const nl = exports.ESCPOS.NEWLINE;
    const line = (char = '-', length = 32) => text(char.repeat(length));
    const pad = (n) => String(n).padStart(2, '0');
    const wrapText = (value, lineLength) => {
        const cleaned = value.trim().replace(/\s+/g, ' ');
        if (!cleaned)
            return [];
        const words = cleaned.split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= lineLength) {
                current = candidate;
            }
            else {
                if (current)
                    lines.push(current);
                current = word;
            }
        }
        if (current)
            lines.push(current);
        return lines;
    };
    parts.push(exports.ESCPOS.INIT);
    parts.push(exports.ESCPOS.ALIGN_CENTER);
    parts.push(exports.ESCPOS.BOLD_ON, exports.ESCPOS.DOUBLE_SIZE_ON);
    if (data.isCancellation) {
        parts.push(text('*** CANCELACION ***'), nl);
    }
    parts.push(text(`MESA ${data.tableNumber}`), nl);
    parts.push(exports.ESCPOS.DOUBLE_SIZE_OFF);
    const hora = `${pad(data.orderTime.getHours())}:${pad(data.orderTime.getMinutes())}`;
    parts.push(text(`${hora}  ${data.waiterName}`), nl);
    parts.push(exports.ESCPOS.BOLD_OFF);
    parts.push(line('='), nl);
    for (const item of data.items) {
        parts.push(exports.ESCPOS.BOLD_ON, exports.ESCPOS.DOUBLE_SIZE_ON);
        parts.push(text(`${item.quantity}x ${item.name.substring(0, 16)}`), nl);
        parts.push(exports.ESCPOS.DOUBLE_SIZE_OFF, exports.ESCPOS.BOLD_OFF);
        if (item.description) {
            parts.push(exports.ESCPOS.BOLD_ON);
            for (const descriptionLine of wrapText(item.description, 28)) {
                parts.push(text(` ING: ${descriptionLine}`), nl);
            }
            parts.push(exports.ESCPOS.BOLD_OFF);
        }
        if (item.notes) {
            parts.push(exports.ESCPOS.BOLD_ON, exports.ESCPOS.DOUBLE_SIZE_ON);
            for (const noteLine of wrapText(item.notes, 14)) {
                parts.push(text(noteLine), nl);
            }
            parts.push(exports.ESCPOS.DOUBLE_SIZE_OFF, exports.ESCPOS.BOLD_OFF);
        }
    }
    parts.push(line('='), nl);
    parts.push(nl, nl);
    parts.push(exports.ESCPOS.CUT_PARTIAL);
    return Buffer.concat(parts);
}
function buildCommandaPreviewText(data) {
    const pad = (n) => String(n).padStart(2, '0');
    const hora = `${pad(data.orderTime.getHours())}:${pad(data.orderTime.getMinutes())}`;
    const wrapText = (value, lineLength) => {
        const cleaned = value.trim().replace(/\s+/g, ' ');
        if (!cleaned)
            return [];
        const words = cleaned.split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= lineLength) {
                current = candidate;
            }
            else {
                if (current)
                    lines.push(current);
                current = word;
            }
        }
        if (current)
            lines.push(current);
        return lines;
    };
    const lines = [
        data.isCancellation ? '*** CANCELACION ***' : '',
        `MESA ${data.tableNumber}`,
        `${hora}  ${data.waiterName}`,
        '================================',
    ].filter(Boolean);
    for (const item of data.items) {
        lines.push(`${item.quantity}x ${item.name}`);
        if (item.description) {
            wrapText(item.description, 28).forEach((line) => lines.push(` ING: ${line}`));
        }
        if (item.notes) {
            wrapText(item.notes, 18).forEach((line) => lines.push(` >>> ${line}`));
        }
    }
    lines.push('================================');
    return lines.join('\n');
}
function buildKitchenMessageBuffer(data) {
    const parts = [];
    const text = (str) => Buffer.from(str, 'latin1');
    const nl = exports.ESCPOS.NEWLINE;
    const line = (char = '-', length = 32) => text(char.repeat(length));
    const pad = (n) => String(n).padStart(2, '0');
    const createdAt = data.createdAt;
    const time = `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}`;
    parts.push(exports.ESCPOS.INIT);
    parts.push(exports.ESCPOS.ALIGN_CENTER);
    parts.push(exports.ESCPOS.BOLD_ON, exports.ESCPOS.DOUBLE_SIZE_ON);
    parts.push(text('AVISO COCINA'), nl);
    parts.push(exports.ESCPOS.DOUBLE_SIZE_OFF, exports.ESCPOS.BOLD_OFF);
    parts.push(line(), nl);
    parts.push(exports.ESCPOS.ALIGN_LEFT);
    if (data.reference) {
        parts.push(text(`Referencia: ${data.reference.substring(0, 28)}`), nl);
    }
    parts.push(text(`Camarero: ${data.waiterName.substring(0, 28)}`), nl);
    parts.push(text(`Hora: ${time}`), nl);
    parts.push(line(), nl);
    for (const rawLine of data.message.split(/\r?\n/)) {
        const lineText = rawLine.trim();
        if (!lineText)
            continue;
        for (let i = 0; i < lineText.length; i += 30) {
            parts.push(text(lineText.slice(i, i + 30)), nl);
        }
    }
    parts.push(nl, nl, nl);
    parts.push(exports.ESCPOS.CUT_PARTIAL);
    return Buffer.concat(parts);
}
//# sourceMappingURL=printer.service.js.map