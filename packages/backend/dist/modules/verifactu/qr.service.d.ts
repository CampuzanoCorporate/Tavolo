export interface QrVerifyParams {
    /** NIF del emisor */
    nif: string;
    /** Fecha de expedición en formato dd-mm-yyyy */
    fecha: string;
    /** Número de serie + número de factura */
    numserie: string;
    /** Importe total con 2 decimales */
    importe: string;
    /** Idioma opcional de la respuesta de la sede */
    idioma?: 'gl' | 'ca' | 'eu' | 'es' | 'va' | 'en';
}
/**
 * Construye la URL de cotejo de Veri*factu para la AEAT.
 *
 * @param params - Datos de la factura para la URL
 * @param env - Entorno: 'production' o 'preproduction'
 * @returns URL de cotejo completa
 */
export declare function buildVerifyUrl(params: QrVerifyParams, env?: 'production' | 'preproduction'): string;
/**
 * Genera el código QR de cotejo Veri*factu como imagen PNG en Base64.
 *
 * @param params - Parámetros de la factura
 * @param env - Entorno AEAT
 * @returns String Base64 del QR PNG (sin prefijo data:image)
 */
export declare function generateVerifactuQrBase64(params: QrVerifyParams, env?: 'production' | 'preproduction'): Promise<string>;
/**
 * Genera el código QR de cotejo Veri*factu como Buffer PNG.
 * Útil para embeber directamente en comandos ESC/POS de impresora.
 *
 * @param params - Parámetros de la factura
 * @param env - Entorno AEAT
 * @returns Buffer PNG del QR
 */
export declare function generateVerifactuQrBuffer(params: QrVerifyParams, env?: 'production' | 'preproduction'): Promise<Buffer>;
//# sourceMappingURL=qr.service.d.ts.map