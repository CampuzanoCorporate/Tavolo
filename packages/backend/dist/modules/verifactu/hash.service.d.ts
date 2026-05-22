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
export declare function computeVerifactuHash(fields: HashInputFields): string;
/**
 * Formatea un número decimal para uso en hash Veri*factu.
 * La AEAT requiere exactamente 2 decimales con punto (no coma).
 *
 * @param value - Número o Decimal de Prisma
 * @returns String con 2 decimales y punto decimal
 */
export declare function formatDecimalForHash(value: number | string | {
    toString(): string;
}): string;
/**
 * Formatea una fecha para uso en hash Veri*factu.
 * Formato requerido: dd-mm-yyyy
 *
 * @param date - Objeto Date
 * @returns Fecha formateada como "dd-mm-yyyy"
 */
export declare function formatDateForHash(date: Date): string;
/**
 * Hash vacío para la primera factura de una serie (64 ceros).
 * Definido como constante para facilitar referencias y tests.
 */
export declare const EMPTY_PREVIOUS_HASH: string;
/**
 * Valida que un hash tiene el formato correcto (64 caracteres hex mayúsculas).
 */
export declare function isValidHash(hash: string): boolean;
//# sourceMappingURL=hash.service.d.ts.map