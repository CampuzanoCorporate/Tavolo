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
     * En producción, descomentar y configurar la ruta al certificado FNMT.
     */
    readonly aeat: {
        readonly endpointUrl: string;
    };
    readonly certificates: {
        readonly encryptionSecret: string;
    };
    readonly licensing: {
        readonly masterKey: string;
        readonly defaultValidityDays: number;
        readonly defaultGraceDays: number;
    };
};
export type Config = typeof config;
//# sourceMappingURL=index.d.ts.map