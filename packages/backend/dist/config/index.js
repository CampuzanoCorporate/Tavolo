"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
/**
 * Configuración centralizada del backend Tavolo POS.
 * Carga y valida las variables de entorno al arrancar.
 *
 * ⚠️  SEGURIDAD: Nunca loguear este objeto completo — contiene secretos.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Cargar .env desde la raíz del monorepo si no hay variables de entorno
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
function required(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Variable de entorno requerida no definida: ${key}`);
    }
    return value;
}
function optional(key, defaultValue) {
    return process.env[key] ?? defaultValue;
}
exports.config = {
    server: {
        port: parseInt(optional('PORT', '3001'), 10),
        nodeEnv: optional('NODE_ENV', 'development'),
        corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
        isDev: optional('NODE_ENV', 'development') === 'development',
    },
    database: {
        url: required('DATABASE_URL'),
    },
    jwt: {
        secret: required('JWT_SECRET'),
        expiresIn: optional('JWT_EXPIRES_IN', '8h'),
    },
    /**
     * Datos del negocio para la generación de facturas Veri*factu.
     * ⚠️  NORMATIVA: El NIF del emisor es un campo obligatorio e inmutable
     *     en cada factura emitida — se persiste como snapshot en DB.
     */
    business: {
        name: required('BUSINESS_NAME'),
        nif: required('BUSINESS_NIF'),
        address: optional('BUSINESS_ADDRESS', ''),
        invoiceSeries: optional('INVOICE_SERIES', 'T'),
    },
    /**
     * Configuración del módulo Veri*factu / AEAT.
     * En producción, descomentar y configurar la ruta al certificado FNMT.
     */
    aeat: {
        endpointUrl: optional('AEAT_ENDPOINT_URL', 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/FacturaSimplificada'),
        // certPath: optional('CERT_PATH', ''),
        // certPassword: optional('CERT_PASSWORD', ''),
    },
    certificates: {
        encryptionSecret: optional('CERT_ENCRYPTION_SECRET', required('JWT_SECRET')),
    },
    licensing: {
        masterKey: optional('LICENSE_MASTER_KEY', ''),
        defaultValidityDays: parseInt(optional('LICENSE_VALIDITY_DAYS', '30'), 10),
        defaultGraceDays: parseInt(optional('LICENSE_GRACE_DAYS', '7'), 10),
    },
};
//# sourceMappingURL=index.js.map