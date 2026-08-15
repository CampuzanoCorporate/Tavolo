type EncryptedBlob = {
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
};
export interface FiscalCertificateSummary {
    id: number;
    organisationId: number;
    label: string | null;
    originalFilename: string;
    mimeType: string | null;
    fileSizeBytes: number;
    fileSha256: string;
    uploadedAt: string;
    updatedAt: string;
}
export declare function decryptBuffer(blob: EncryptedBlob): Buffer<ArrayBuffer>;
export declare function getFiscalCertificateSummary(organisationId: number): Promise<{
    id: number;
    organisationId: number;
    label: string | null;
    originalFilename: string;
    mimeType: string | null;
    fileSizeBytes: number;
    fileSha256: string;
    uploadedAt: string;
    updatedAt: string;
} | null>;
export declare function saveFiscalCertificate(params: {
    organisationId: number;
    filename: string;
    mimeType?: string | null;
    label?: string | null;
    base64Content: string;
    passphrase: string;
}): Promise<{
    id: number;
    organisationId: number;
    label: string | null;
    originalFilename: string;
    mimeType: string | null;
    fileSizeBytes: number;
    fileSha256: string;
    uploadedAt: string;
    updatedAt: string;
} | null>;
export declare function deleteFiscalCertificate(organisationId: number): Promise<void>;
export declare function getFiscalCertificateBundle(organisationId: number): Promise<{
    filename: string;
    mimeType: string | null;
    fileBuffer: Buffer<ArrayBuffer>;
    passphrase: string;
} | null>;
export {};
//# sourceMappingURL=certificate.service.d.ts.map