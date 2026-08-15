export interface TicketLogoSummary {
    id: number;
    organisationId: number;
    label: string | null;
    originalFilename: string;
    mimeType: string | null;
    width: number;
    height: number;
    fileSizeBytes: number;
    uploadedAt: string;
    updatedAt: string;
}
export declare function getTicketLogoSummary(organisationId: number): Promise<{
    id: number;
    organisationId: number;
    label: string | null;
    originalFilename: string;
    mimeType: string | null;
    width: number;
    height: number;
    fileSizeBytes: number;
    uploadedAt: string;
    updatedAt: string;
} | null>;
export declare function saveTicketLogo(params: {
    organisationId: number;
    label?: string | null;
    filename: string;
    mimeType?: string | null;
    pngBase64: string;
    width: number;
    height: number;
}): Promise<{
    id: number;
    organisationId: number;
    label: string | null;
    originalFilename: string;
    mimeType: string | null;
    width: number;
    height: number;
    fileSizeBytes: number;
    uploadedAt: string;
    updatedAt: string;
} | null>;
export declare function deleteTicketLogo(organisationId: number): Promise<void>;
export declare function getTicketLogoBase64(organisationId: number): Promise<string | null>;
//# sourceMappingURL=logo.service.d.ts.map