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
import net from 'net';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
// `pngjs` ya existe en el árbol de dependencias y nos permite rasterizar
// el logo a ESC/POS sin dependencias nativas.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PNG } = require('pngjs');
const execFileAsync = promisify(execFile);

// ─── CONSTANTES ESC/POS ────────────────────────────────────────────────────

/** Comandos ESC/POS estándar */
const ESC = 0x1b;
const GS = 0x1d;

export const ESCPOS = {
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
} as const;

// ─── INTERFACES ────────────────────────────────────────────────────────────

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

// ─── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────

/**
 * Envía un buffer de datos a una impresora de red vía TCP.
 *
 * @param target - Configuración de la impresora (IP + puerto)
 * @param data - Buffer de datos ESC/POS a enviar
 * @returns Promise que resuelve cuando el envío es exitoso
 * @throws Error si no se puede conectar a la impresora
 */
export function sendToPrinter(
  target: PrinterTarget,
  data: Buffer
): Promise<void> {
  if (target.connectionType === 'SYSTEM') {
    return sendToSystemPrinter(target, data);
  }

  const { ipAddress, port = 9100, timeoutMs = 5000 } = target;
  if (!ipAddress) {
    return Promise.reject(new Error('Falta la IP de la impresora de red'));
  }

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

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

async function sendToSystemPrinter(target: PrinterTarget, data: Buffer): Promise<void> {
  if (!target.systemName) {
    throw new Error('Falta el nombre de la impresora del sistema');
  }

  const tmpFile = path.join(os.tmpdir(), `tavolo-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);

  try {
    await fs.writeFile(tmpFile, data);
    const command = process.platform === 'darwin' ? 'lp' : 'lp';
    const args = process.platform === 'darwin'
      ? ['-d', target.systemName, '-o', 'raw', tmpFile]
      : ['-d', target.systemName, '-o', 'raw', tmpFile];

    await execFileAsync(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al imprimir por sistema';
    throw new Error(`Error enviando a impresora del sistema "${target.systemName}": ${message}`);
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined);
  }
}

export async function listSystemPrinters(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('lpstat', ['-a']);
    return stdout
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((value) => value && value !== 'lpstat:');
  } catch (error) {
    console.warn('[Printer] No se pudieron listar impresoras del sistema', error);
    return [];
  }
}

// ─── CONSTRUCTORES DE TICKETS ──────────────────────────────────────────────

/**
 * Construye el buffer ESC/POS de un ticket/factura completo.
 *
 * @param data - Datos del ticket a imprimir
 * @returns Buffer listo para enviar a la impresora
 */
export function buildTicketBuffer(data: PrintTicketData): Buffer {
  const parts: Buffer[] = [];

  const text = (str: string) => Buffer.from(str, 'latin1');
  const nl = ESCPOS.NEWLINE;
  const line = (char = '-', length = 42) => text(char.repeat(length));

  // ── Inicializar impresora
  parts.push(ESCPOS.INIT);

  if (data.logoPngBase64) {
    const logoBuffer = buildEscPosImageBuffer(data.logoPngBase64);
    if (logoBuffer) {
      parts.push(ESCPOS.ALIGN_CENTER);
      parts.push(logoBuffer);
      parts.push(nl);
    }
  }

  // ── Cabecera: nombre del negocio
  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(ESCPOS.BOLD_ON, ESCPOS.DOUBLE_SIZE_ON);
  parts.push(text(data.businessName.toUpperCase().substring(0, 20)));
  parts.push(nl);
  parts.push(ESCPOS.DOUBLE_SIZE_OFF, ESCPOS.BOLD_OFF);
  parts.push(text(data.businessAddress), nl);
  parts.push(text(`NIF: ${data.businessNif}`), nl);
  parts.push(nl);
  parts.push(line(), nl);

  // ── Info del ticket
  parts.push(ESCPOS.ALIGN_LEFT);
  const fecha = data.issuedAt;
  const pad = (n: number) => String(n).padStart(2, '0');
  const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
  parts.push(text(`Factura: ${data.invoiceCode}`), nl);
  parts.push(text(`Fecha:   ${fechaStr}`), nl);
  parts.push(text(`Mesa:    ${data.tableNumber}   Camarero: ${data.waiterName}`), nl);
  parts.push(line(), nl);

  // ── Líneas de producto
  parts.push(ESCPOS.BOLD_ON);
  parts.push(text('Descripcion            Cant   Precio'), nl);
  parts.push(ESCPOS.BOLD_OFF);
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
  parts.push(ESCPOS.ALIGN_RIGHT);
  parts.push(text(`Subtotal:  ${data.subtotal.toFixed(2)} EUR`), nl);
  parts.push(text(`IVA (${data.vatRate}%): ${data.vatAmount.toFixed(2)} EUR`), nl);
  parts.push(nl);
  parts.push(ESCPOS.BOLD_ON, ESCPOS.DOUBLE_SIZE_ON);
  parts.push(text(`TOTAL: ${data.total.toFixed(2)} EUR`), nl);
  parts.push(ESCPOS.DOUBLE_SIZE_OFF, ESCPOS.BOLD_OFF);
  parts.push(nl);

  // ── Pie: Veri*factu y mensaje
  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(line('='), nl);
  parts.push(text('Factura verificable en sede.agenciatributaria.gob.es'), nl);
  parts.push(text('Veri*factu RD 1007/2023'), nl);
  parts.push(nl);
  parts.push(text('Gracias por su visita'), nl);
  parts.push(nl, nl, nl);

  // ── Corte de papel
  parts.push(ESCPOS.CUT_PARTIAL);

  return Buffer.concat(parts);
}

export function buildTicketPreviewText(data: PrintTicketData): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fecha = data.issuedAt;
  const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;

  const lines = [
    ...(data.logoPngBase64 ? ['[Logo del negocio]'] : []),
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
    if (item.notes) lines.push(`  >> ${item.notes.substring(0, 35)}`);
  }

  lines.push('------------------------------------------');
  lines.push(`Subtotal:  ${data.subtotal.toFixed(2)} EUR`);
  lines.push(`IVA (${data.vatRate}%): ${data.vatAmount.toFixed(2)} EUR`);
  lines.push(`TOTAL: ${data.total.toFixed(2)} EUR`);
  lines.push('==========================================');
  lines.push('Gracias por su visita');

  return lines.join('\n');
}

function buildEscPosImageBuffer(base64Png: string): Buffer | null {
  try {
    const png = PNG.sync.read(Buffer.from(base64Png, 'base64'));
    const maxWidth = 384;
    const targetWidth = Math.min(png.width, maxWidth);
    const bytesPerRow = Math.ceil(targetWidth / 8);
    const raster = Buffer.alloc(bytesPerRow * png.height);

    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const idx = (png.width * y + x) << 2;
        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        const a = png.data[idx + 3];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const isBlack = a > 16 && luminance < 196;

        if (isBlack) {
          const byteIndex = y * bytesPerRow + (x >> 3);
          raster[byteIndex] |= 0x80 >> (x & 7);
        }
      }
    }

    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = png.height & 0xff;
    const yH = (png.height >> 8) & 0xff;

    return Buffer.concat([
      Buffer.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
      raster,
    ]);
  } catch (error) {
    console.error('[Printer] No se pudo rasterizar el logo del ticket', error);
    return null;
  }
}

/**
 * Construye el buffer ESC/POS de una comanda de cocina.
 * Letra grande para máxima legibilidad en cocina.
 *
 * @param data - Datos de la comanda
 * @returns Buffer listo para enviar a la impresora de cocina
 */
export function buildCommandaBuffer(data: PrintCommandaData): Buffer {
  const parts: Buffer[] = [];
  const text = (str: string) => Buffer.from(str, 'latin1');
  const nl = ESCPOS.NEWLINE;
  const line = (char = '-', length = 32) => text(char.repeat(length));
  const pad = (n: number) => String(n).padStart(2, '0');
  const wrapText = (value: string, lineLength: number) => {
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (!cleaned) return [];
    const words = cleaned.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= lineLength) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines;
  };

  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(ESCPOS.BOLD_ON, ESCPOS.DOUBLE_SIZE_ON);
  if (data.isCancellation) {
    parts.push(text('*** CANCELACION ***'), nl);
  }
  parts.push(text(`MESA ${data.tableNumber}`), nl);
  parts.push(ESCPOS.DOUBLE_SIZE_OFF);
  const hora = `${pad(data.orderTime.getHours())}:${pad(data.orderTime.getMinutes())}`;
  parts.push(text(`${hora}  ${data.waiterName}`), nl);
  parts.push(ESCPOS.BOLD_OFF);
  parts.push(line('='), nl);

  for (const item of data.items) {
    parts.push(ESCPOS.BOLD_ON, ESCPOS.DOUBLE_SIZE_ON);
    parts.push(text(`${item.quantity}x ${item.name.substring(0, 16)}`), nl);
    parts.push(ESCPOS.DOUBLE_SIZE_OFF, ESCPOS.BOLD_OFF);
    if (item.description) {
      parts.push(ESCPOS.BOLD_ON);
      for (const descriptionLine of wrapText(item.description, 28)) {
        parts.push(text(` ING: ${descriptionLine}`), nl);
      }
      parts.push(ESCPOS.BOLD_OFF);
    }
    if (item.notes) {
      parts.push(ESCPOS.BOLD_ON, ESCPOS.DOUBLE_SIZE_ON);
      for (const noteLine of wrapText(item.notes, 14)) {
        parts.push(text(noteLine), nl);
      }
      parts.push(ESCPOS.DOUBLE_SIZE_OFF, ESCPOS.BOLD_OFF);
    }
  }

  parts.push(line('='), nl);
  parts.push(nl, nl);
  parts.push(ESCPOS.CUT_PARTIAL);

  return Buffer.concat(parts);
}

export function buildCommandaPreviewText(data: PrintCommandaData): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const hora = `${pad(data.orderTime.getHours())}:${pad(data.orderTime.getMinutes())}`;
  const wrapText = (value: string, lineLength: number) => {
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (!cleaned) return [];
    const words = cleaned.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= lineLength) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
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

export function buildKitchenMessageBuffer(data: KitchenMessageData): Buffer {
  const parts: Buffer[] = [];
  const text = (str: string) => Buffer.from(str, 'latin1');
  const nl = ESCPOS.NEWLINE;
  const line = (char = '-', length = 32) => text(char.repeat(length));
  const pad = (n: number) => String(n).padStart(2, '0');
  const createdAt = data.createdAt;
  const time = `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}`;

  parts.push(ESCPOS.INIT);
  parts.push(ESCPOS.ALIGN_CENTER);
  parts.push(ESCPOS.BOLD_ON, ESCPOS.DOUBLE_SIZE_ON);
  parts.push(text('AVISO COCINA'), nl);
  parts.push(ESCPOS.DOUBLE_SIZE_OFF, ESCPOS.BOLD_OFF);
  parts.push(line(), nl);

  parts.push(ESCPOS.ALIGN_LEFT);
  if (data.reference) {
    parts.push(text(`Referencia: ${data.reference.substring(0, 28)}`), nl);
  }
  parts.push(text(`Camarero: ${data.waiterName.substring(0, 28)}`), nl);
  parts.push(text(`Hora: ${time}`), nl);
  parts.push(line(), nl);

  for (const rawLine of data.message.split(/\r?\n/)) {
    const lineText = rawLine.trim();
    if (!lineText) continue;
    for (let i = 0; i < lineText.length; i += 30) {
      parts.push(text(lineText.slice(i, i + 30)), nl);
    }
  }

  parts.push(nl, nl, nl);
  parts.push(ESCPOS.CUT_PARTIAL);

  return Buffer.concat(parts);
}
