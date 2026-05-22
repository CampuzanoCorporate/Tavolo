export interface VerifactuPayload {
    IDEmisorFactura: string;
    NumSerieFactura: string;
    FechaExpedicion: string;
    TipoFactura: string;
    CuotaTotal: string;
    ImporteTotal: string;
    Huella: string;
    HuellaAnterior: string;
    FechaHoraHusoGenRegistro: string;
}
export interface SignedPayload {
    payload: VerifactuPayload;
    /** Firma digital en formato Base64 (real o simulada) */
    signature: string;
    /** Indica si la firma es real (producción) o simulada (MVP) */
    isSimulated: boolean;
    /** Timestamp de la firma */
    signedAt: string;
}
/**
 * Construye el payload JSON de Veri*factu listo para enviar a la AEAT.
 */
export declare function buildVerifactuPayload(params: {
    nif: string;
    invoiceCode: string;
    issuedAt: Date;
    tipoFactura: 'F1';
    vatAmount: number;
    total: number;
    hashSelf: string;
    hashPrevious: string;
}): VerifactuPayload;
/**
 * Firma digitalmente el payload Veri*factu.
 *
 * MVP: Genera una firma HMAC-SHA256 simulada usando JWT_SECRET.
 * PRODUCCIÓN: Sustituir por firma RSA con certificado FNMT.
 *
 * @param payload - Payload Veri*factu a firmar
 * @returns Payload firmado con metadatos de la firma
 */
export declare function signVerifactuPayload(payload: VerifactuPayload): SignedPayload;
/**
 * Simula el envío del payload firmado al endpoint de la AEAT.
 *
 * ⚠️  MVP: Simula la respuesta de la AEAT sin conexión real.
 *     Para producción, usar axios/fetch con el endpoint oficial y certificado.
 *
 * @param signedPayload - Payload firmado
 * @returns Respuesta simulada de la AEAT
 */
export declare function sendToAeat(signedPayload: SignedPayload): Promise<{
    code: string;
    message: string;
}>;
//# sourceMappingURL=sign.service.d.ts.map