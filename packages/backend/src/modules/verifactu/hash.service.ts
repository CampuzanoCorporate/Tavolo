/**
 * ============================================================
 * MÓDULO VERI*FACTU — Servicio de Hash Encadenado SHA-256
 * ============================================================
 *
 * Implementa el algoritmo de huella (fingerprint) requerido por la
 * AEAT según el Reglamento de facturación (RD 1007/2023) y la
 * especificación técnica de Veri*factu.
 *
 * ⚠️  NORMATIVA CRÍTICA:
 *   - El hash debe calcularse sobre campos específicos en un orden exacto.
 *   - El campo "Huella" encadena SIEMPRE con el hash de la factura anterior.
 *   - La primera factura usa una huella anterior de 64 ceros ("0" × 64).
 *   - El resultado DEBE estar en formato hexadecimal MAYÚSCULAS.
 *   - Una vez generado el hash, la factura NO puede modificarse.
 *
 * Referencias:
 *   - RD 1007/2023 (Reglamento Veri*factu)
 *   - Especificación Técnica AEAT SistemaFacturacion v1.0
 * ============================================================
 */
import crypto from 'crypto';

/**
 * Campos fiscales necesarios para calcular la huella SHA-256.
 * Corresponden a los campos obligatorios del registro de factura Veri*factu.
 */
export interface HashInputFields {
  /** NIF del emisor (ej: "B12345678") */
  idEmisorFactura: string;
  /** Serie + número de factura (ej: "T-2024-000001") */
  numSerieFactura: string;
  /** Fecha de expedición en formato dd-mm-yyyy */
  fechaExpedicion: string;
  /** Tipo de factura: siempre "F1" para facturas simplificadas */
  tipoFactura: 'F1' | 'F2' | 'F3';
  /** Cuota total de IVA con 2 decimales (ej: "2.20") */
  cuotaTotal: string;
  /** Importe total con IVA, 2 decimales (ej: "24.20") */
  importeTotal: string;
  /** Huella (hash) de la factura ANTERIOR. 64 ceros para la primera. */
  huellaAnterior: string;
}

/**
 * Calcula la huella SHA-256 de una factura según el estándar Veri*factu.
 *
 * Formato del mensaje a hashear (fields en orden fijo, separados por "&"):
 * IDEmisorFactura=X&NumSerieFactura=Y&FechaExpedicion=Z&TipoFactura=W&
 * CuotaTotal=A&ImporteTotal=B&Huella=C
 *
 * @param fields - Campos fiscales de la factura
 * @returns Hash SHA-256 en formato hexadecimal MAYÚSCULAS (64 caracteres)
 *
 * @example
 * const hash = computeVerifactuHash({
 *   idEmisorFactura: "B12345678",
 *   numSerieFactura: "T-2024-000001",
 *   fechaExpedicion: "01-01-2024",
 *   tipoFactura: "F1",
 *   cuotaTotal: "2.20",
 *   importeTotal: "24.20",
 *   huellaAnterior: "0000...0000",
 * });
 * // => "A3F2...BC9E" (64 chars, uppercase)
 */
export function computeVerifactuHash(fields: HashInputFields): string {
  // Construcción del mensaje según especificación técnica AEAT
  // ⚠️  El orden y los nombres de los parámetros son estrictos
  const message = [
    `IDEmisorFactura=${fields.idEmisorFactura}`,
    `NumSerieFactura=${fields.numSerieFactura}`,
    `FechaExpedicion=${fields.fechaExpedicion}`,
    `TipoFactura=${fields.tipoFactura}`,
    `CuotaTotal=${fields.cuotaTotal}`,
    `ImporteTotal=${fields.importeTotal}`,
    `Huella=${fields.huellaAnterior}`,
  ].join('&');

  const hash = crypto
    .createHash('sha256')
    .update(message, 'utf8')
    .digest('hex')
    .toUpperCase();

  return hash;
}

/**
 * Formatea un número decimal para uso en hash Veri*factu.
 * La AEAT requiere exactamente 2 decimales con punto (no coma).
 *
 * @param value - Número o Decimal de Prisma
 * @returns String con 2 decimales y punto decimal
 */
export function formatDecimalForHash(value: number | string | { toString(): string }): string {
  return parseFloat(value.toString()).toFixed(2);
}

/**
 * Formatea una fecha para uso en hash Veri*factu.
 * Formato requerido: dd-mm-yyyy
 *
 * @param date - Objeto Date
 * @returns Fecha formateada como "dd-mm-yyyy"
 */
export function formatDateForHash(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Hash vacío para la primera factura de una serie (64 ceros).
 * Definido como constante para facilitar referencias y tests.
 */
export const EMPTY_PREVIOUS_HASH = '0'.repeat(64);

/**
 * Valida que un hash tiene el formato correcto (64 caracteres hex mayúsculas).
 */
export function isValidHash(hash: string): boolean {
  return /^[0-9A-F]{64}$/.test(hash);
}
