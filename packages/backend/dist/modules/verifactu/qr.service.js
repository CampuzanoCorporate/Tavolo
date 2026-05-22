"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVerifyUrl = buildVerifyUrl;
exports.generateVerifactuQrBase64 = generateVerifactuQrBase64;
exports.generateVerifactuQrBuffer = generateVerifactuQrBuffer;
/**
 * ============================================================
 * MÓDULO VERI*FACTU — Generador de QR de Cotejo
 * ============================================================
 *
 * Genera el código QR oficial para verificación de facturas
 * en el sistema Veri*factu de la AEAT.
 *
 * El QR debe contener la URL de cotejo con los parámetros de
 * la factura, permitiendo al cliente verificar la factura en
 * la sede electrónica de la AEAT escaneando el QR del ticket.
 *
 * URL de cotejo (preproducción):
 *   https://prewww2.aeat.es/static_files/common/internet/dep/
 *   aplicaciones/es/aeat/tike/cont/ws/SistemaFacturacion/
 *   VerificacionFactura?nif=X&nombre=Y&fecha=Z&num=A&importe=B
 *
 * Referencias:
 *   - Especificación Técnica AEAT Veri*factu (Anexo IV - QR)
 * ============================================================
 */
const qrcode_1 = __importDefault(require("qrcode"));
/** Entorno de la AEAT para el QR de cotejo */
const AEAT_VERIFY_BASE_URL = {
    production: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SistemaFacturacion/VerificacionFactura',
    preproduction: 'https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SistemaFacturacion/VerificacionFactura',
};
/**
 * Construye la URL de cotejo de Veri*factu para la AEAT.
 *
 * @param params - Datos de la factura para la URL
 * @param env - Entorno: 'production' o 'preproduction'
 * @returns URL de cotejo completa
 */
function buildVerifyUrl(params, env = 'preproduction') {
    const baseUrl = AEAT_VERIFY_BASE_URL[env];
    const urlParams = new URLSearchParams({
        nif: params.nif,
        nombre: params.nombre,
        fecha: params.fecha,
        num: params.num,
        importe: params.importe,
    });
    return `${baseUrl}?${urlParams.toString()}`;
}
/**
 * Genera el código QR de cotejo Veri*factu como imagen PNG en Base64.
 *
 * @param params - Parámetros de la factura
 * @param env - Entorno AEAT
 * @returns String Base64 del QR PNG (sin prefijo data:image)
 */
async function generateVerifactuQrBase64(params, env = 'preproduction') {
    const url = buildVerifyUrl(params, env);
    const qrDataUrl = await qrcode_1.default.toDataURL(url, {
        errorCorrectionLevel: 'M', // Nivel M (medium) recomendado por AEAT
        margin: 2,
        width: 200,
        color: {
            dark: '#000000',
            light: '#FFFFFF',
        },
    });
    // Eliminar el prefijo "data:image/png;base64," para devolver solo el Base64
    return qrDataUrl.replace(/^data:image\/png;base64,/, '');
}
/**
 * Genera el código QR de cotejo Veri*factu como Buffer PNG.
 * Útil para embeber directamente en comandos ESC/POS de impresora.
 *
 * @param params - Parámetros de la factura
 * @param env - Entorno AEAT
 * @returns Buffer PNG del QR
 */
async function generateVerifactuQrBuffer(params, env = 'preproduction') {
    const url = buildVerifyUrl(params, env);
    return qrcode_1.default.toBuffer(url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 200,
    });
}
//# sourceMappingURL=qr.service.js.map