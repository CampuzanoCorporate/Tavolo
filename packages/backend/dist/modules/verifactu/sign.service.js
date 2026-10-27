"use strict";
/**
 * ============================================================
 * MÓDULO VERI*FACTU — Arquitectura Criptográfica y Firma
 * ============================================================
 *
 * En la modalidad VERI*FACTU (remisión voluntaria e inmediata
 * de los registros de facturación a la Agencia Tributaria según
 * el Real Decreto 1007/2023 y la Orden HAC/1177/2024):
 *
 * 1. Los registros se autentican en tránsito mediante canal seguro
 *    HTTPS con autenticación mutua (mTLS) utilizando el certificado
 *    electrónico reconocido (FNMT, Camerfirma, etc.) del obligado
 *    tributario o representante.
 * 2. La integridad y no alterabilidad del registro se garantiza
 *    mediante la huella criptográfica encadenada (SHA-256) calculada
 *    en `hash.service.ts`.
 * 3. La remisión real y gestión del certificado digital se
 *    encuentran centralizadas en:
 *      - `aeat.service.ts` (remisión SOAP XML con mTLS)
 *      - `certificate.service.ts` (almacenamiento cifrado AES-256)
 * ============================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVerifactuSecurityInfo = getVerifactuSecurityInfo;
function getVerifactuSecurityInfo() {
    return {
        mechanism: 'mTLS_CHAINED_SHA256',
        hashAlgorithm: 'SHA-256',
        transmissionProtocol: 'SOAP_1_1_OVER_HTTPS_MTLS',
        regulation: 'RD_1007_2023_ORDEN_HAC_1177_2024',
    };
}
//# sourceMappingURL=sign.service.js.map