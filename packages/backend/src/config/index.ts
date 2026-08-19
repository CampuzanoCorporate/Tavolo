/**
 * Configuración centralizada del backend Tavolo POS.
 * Carga y valida las variables de entorno al arrancar.
 *
 * ⚠️  SEGURIDAD: Nunca loguear este objeto completo — contiene secretos.
 */
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env desde la raíz del monorepo si no hay variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variable de entorno requerida no definida: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
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
   * La remisión VERI*FACTU usa el certificado cargado desde administración.
   */
  aeat: {
    deliveryMode: optional('AEAT_DELIVERY_MODE', 'simulate'),
    endpointUrl: optional(
      'AEAT_ENDPOINT_URL',
      'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
    ),
    timeoutMs: parseInt(optional('AEAT_TIMEOUT_MS', '15000'), 10),
    software: {
      developerName: optional('AEAT_SOFTWARE_DEVELOPER_NAME', 'Tavolo POS'),
      developerNif: optional('AEAT_SOFTWARE_DEVELOPER_NIF', ''),
      softwareName: optional('AEAT_SOFTWARE_NAME', 'TAVOLOPOS'),
      softwareId: optional('AEAT_SOFTWARE_ID', '01'),
      softwareVersion: optional('AEAT_SOFTWARE_VERSION', '1.0.0'),
      installationId: optional('AEAT_SOFTWARE_INSTALLATION_ID', 'default'),
      onlyVerifactu: optional('AEAT_SOFTWARE_ONLY_VERIFACTU', 'S'),
      multiObligado: optional('AEAT_SOFTWARE_MULTI_OT', 'N'),
      multipleObligadoIndicator: optional('AEAT_SOFTWARE_MULTIPLE_OT_INDICATOR', 'N'),
    },
  },

  certificates: {
    encryptionSecret: optional('CERT_ENCRYPTION_SECRET', required('JWT_SECRET')),
  },

  licensing: {
    masterKey: optional('LICENSE_MASTER_KEY', ''),
    defaultValidityDays: parseInt(optional('LICENSE_VALIDITY_DAYS', '30'), 10),
    defaultGraceDays: parseInt(optional('LICENSE_GRACE_DAYS', '7'), 10),
  },

  qzTray: {
    certificatePath: optional('QZ_TRAY_CERTIFICATE_PATH', ''),
    privateKeyPath: optional('QZ_TRAY_PRIVATE_KEY_PATH', ''),
    privateKeyPassphrase: optional('QZ_TRAY_PRIVATE_KEY_PASSPHRASE', ''),
    signatureAlgorithm: optional('QZ_TRAY_SIGNATURE_ALGORITHM', 'SHA512'),
  },
} as const;

export type Config = typeof config;
