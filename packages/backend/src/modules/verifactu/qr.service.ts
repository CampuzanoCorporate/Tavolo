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
 *   https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR
 *   ?nif=X&numserie=Y&fecha=Z&importe=B
 *
 * Referencias:
 *   - Especificación Técnica AEAT Veri*factu (Anexo IV - QR)
 * ============================================================
 */
import QRCode from 'qrcode';

/** Entorno de la AEAT para el QR de cotejo */
const AEAT_VERIFY_BASE_URL = {
  production: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
  preproduction: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
} as const;

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
export function buildVerifyUrl(
  params: QrVerifyParams,
  env: 'production' | 'preproduction' = 'preproduction'
): string {
  const baseUrl = AEAT_VERIFY_BASE_URL[env];
  const urlParams = new URLSearchParams({
    nif: params.nif,
    numserie: params.numserie,
    fecha: params.fecha,
    importe: params.importe,
  });
  if (params.idioma) {
    urlParams.set('idioma', params.idioma);
  }
  return `${baseUrl}?${urlParams.toString()}`;
}

/**
 * Genera el código QR de cotejo Veri*factu como imagen PNG en Base64.
 *
 * @param params - Parámetros de la factura
 * @param env - Entorno AEAT
 * @returns String Base64 del QR PNG (sin prefijo data:image)
 */
export async function generateVerifactuQrBase64(
  params: QrVerifyParams,
  env: 'production' | 'preproduction' = 'preproduction'
): Promise<string> {
  const url = buildVerifyUrl(params, env);

  const qrDataUrl = await QRCode.toDataURL(url, {
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
export async function generateVerifactuQrBuffer(
  params: QrVerifyParams,
  env: 'production' | 'preproduction' = 'preproduction'
): Promise<Buffer> {
  const url = buildVerifyUrl(params, env);
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 200,
  });
}
