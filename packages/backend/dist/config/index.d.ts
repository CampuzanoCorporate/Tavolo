export declare const config: {
    readonly server: {
        readonly port: number;
        readonly nodeEnv: string;
        readonly corsOrigin: string;
        readonly isDev: boolean;
    };
    readonly database: {
        readonly url: string;
    };
    readonly jwt: {
        readonly secret: string;
        readonly expiresIn: string;
    };
    /**
     * Datos del negocio para la generación de facturas Veri*factu.
     * ⚠️  NORMATIVA: El NIF del emisor es un campo obligatorio e inmutable
     *     en cada factura emitida — se persiste como snapshot en DB.
     */
    readonly business: {
        readonly name: string;
        readonly nif: string;
        readonly address: string;
        readonly invoiceSeries: string;
    };
    /**
     * Configuración del módulo Veri*factu / AEAT.
     * La remisión VERI*FACTU usa el certificado cargado desde administración.
     */
    readonly aeat: {
        readonly deliveryMode: string;
        readonly endpointUrl: string;
        readonly timeoutMs: number;
        readonly software: {
            readonly developerName: string;
            readonly developerNif: string;
            readonly softwareName: string;
            readonly softwareId: string;
            readonly softwareVersion: string;
            readonly installationId: string;
            readonly onlyVerifactu: string;
            readonly multiObligado: string;
            readonly multipleObligadoIndicator: string;
        };
    };
    readonly certificates: {
        readonly encryptionSecret: string;
    };
    readonly licensing: {
        readonly masterKey: string;
        readonly defaultValidityDays: number;
        readonly defaultGraceDays: number;
    };
    readonly qzTray: {
        readonly certificatePath: string;
        readonly privateKeyPath: string;
        readonly privateKeyPassphrase: string;
        readonly signatureAlgorithm: string;
    };
};
export type Config = typeof config;
//# sourceMappingURL=index.d.ts.map