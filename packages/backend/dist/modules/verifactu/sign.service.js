"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVerifactuPayload = buildVerifactuPayload;
exports.signVerifactuPayload = signVerifactuPayload;
exports.sendToAeat = sendToAeat;
/**
 * ============================================================
 * MÓDULO VERI*FACTU — Servicio de Firma Digital X.509
 * ============================================================
 *
 * Gestiona la firma digital del payload Veri*factu con el
 * certificado electrónico de la FNMT (X.509 / PKCS#12).
 *
 * ⚠️  ESTADO MVP: La firma real está SIMULADA.
 *     Para producción, descomentar el bloque de firma real
 *     e instalar el certificado de la FNMT en ./certs/
 *
 * Para producción necesitarás:
 *   1. Certificado de representante (FNMT) o persona física
 *   2. npm install node-forge (para manejo de PKCS#12)
 *   3. Configurar CERT_PATH y CERT_PASSWORD en .env
 *
 * Referencias:
 *   - https://www.sede.fnmt.gob.es/certificados
 *   - Especificación Técnica AEAT Veri*factu (Anexo III - Firma)
 * ============================================================
 */
const crypto_1 = __importDefault(require("crypto"));
/**
 * Construye el payload JSON de Veri*factu listo para enviar a la AEAT.
 */
function buildVerifactuPayload(params) {
    const fecha = params.issuedAt;
    const pad = (n) => String(n).padStart(2, '0');
    const fechaExpedicion = `${pad(fecha.getDate())}-${pad(fecha.getMonth() + 1)}-${fecha.getFullYear()}`;
    // Formato ISO 8601 con zona horaria para el registro
    const fechaHoraHuso = fecha.toISOString().replace('T', 'T').slice(0, 19) + '+01:00';
    return {
        IDEmisorFactura: params.nif,
        NumSerieFactura: params.invoiceCode,
        FechaExpedicion: fechaExpedicion,
        TipoFactura: params.tipoFactura,
        CuotaTotal: params.vatAmount.toFixed(2),
        ImporteTotal: params.total.toFixed(2),
        Huella: params.hashSelf,
        HuellaAnterior: params.hashPrevious,
        FechaHoraHusoGenRegistro: fechaHoraHuso,
    };
}
/**
 * Firma digitalmente el payload Veri*factu.
 *
 * MVP: Genera una firma HMAC-SHA256 simulada usando JWT_SECRET.
 * PRODUCCIÓN: Sustituir por firma RSA con certificado FNMT.
 *
 * @param payload - Payload Veri*factu a firmar
 * @returns Payload firmado con metadatos de la firma
 */
function signVerifactuPayload(payload) {
    const payloadString = JSON.stringify(payload);
    const signedAt = new Date().toISOString();
    // ── SIMULACIÓN DE FIRMA (MVP) ──────────────────────────────────────────────
    // En MVP generamos un HMAC-SHA256 que actúa como firma simulada.
    // ⚠️  ESTO NO ES UNA FIRMA X.509 VÁLIDA PARA LA AEAT EN PRODUCCIÓN.
    const simulatedSecret = process.env['JWT_SECRET'] ?? 'tavolo-dev-secret';
    const signature = crypto_1.default
        .createHmac('sha256', simulatedSecret)
        .update(payloadString)
        .digest('base64');
    // ── FIRMA REAL (PRODUCCIÓN) ────────────────────────────────────────────────
    // Para activar en producción:
    // const forge = require('node-forge');
    // const p12Asn1 = forge.asn1.fromDer(fs.readFileSync(config.aeat.certPath).toString('binary'));
    // const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, config.aeat.certPassword);
    // const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    // const keyBag = bags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    // const privateKey = keyBag?.key;
    // const md = forge.md.sha256.create();
    // md.update(payloadString, 'utf8');
    // const signature = forge.util.encode64(privateKey.sign(md));
    return {
        payload,
        signature,
        isSimulated: true, // Cambiar a false en producción con firma real
        signedAt,
    };
}
/**
 * Simula el envío del payload firmado al endpoint de la AEAT.
 *
 * ⚠️  MVP: Simula la respuesta de la AEAT sin conexión real.
 *     Para producción, usar axios/fetch con el endpoint oficial y certificado.
 *
 * @param signedPayload - Payload firmado
 * @returns Respuesta simulada de la AEAT
 */
async function sendToAeat(signedPayload) {
    // Simular latencia de red
    await new Promise((resolve) => setTimeout(resolve, 100));
    // ── ENVÍO REAL (PRODUCCIÓN) ────────────────────────────────────────────────
    // const response = await axios.post(config.aeat.endpointUrl, signedPayload.payload, {
    //   headers: { 'Content-Type': 'application/json' },
    //   httpsAgent: new https.Agent({
    //     pfx: fs.readFileSync(config.aeat.certPath),
    //     passphrase: config.aeat.certPassword,
    //   }),
    // });
    // return { code: response.data.codigo, message: response.data.descripcion };
    // Respuesta simulada MVP
    return {
        code: '2000',
        message: 'Registro de factura simplificada recibido correctamente (SIMULADO)',
    };
}
//# sourceMappingURL=sign.service.js.map