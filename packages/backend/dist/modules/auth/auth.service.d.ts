import type { JWTPayload } from '../../types/jwt';
/**
 * Hashea una contraseña con bcrypt (coste 12).
 */
export declare function hashPassword(plain: string): Promise<string>;
/**
 * Verifica una contraseña contra su hash bcrypt.
 */
export declare function verifyPassword(plain: string, hash: string): Promise<boolean>;
/**
 * Realiza el login de un usuario y retorna el payload JWT.
 * Lanza un Error si las credenciales son inválidas.
 *
 * @param email - Email del usuario
 * @param password - Contraseña en texto plano
 * @returns Payload para incluir en el JWT
 */
export declare function loginUser(email: string, password: string): Promise<JWTPayload>;
/**
 * Obtiene el perfil completo del usuario autenticado.
 */
export declare function getUserProfile(userId: number): Promise<{
    organisation: {
        id: number;
        name: string;
        nif: string;
    };
    id: number;
    email: string;
    name: string;
    role: import(".prisma/client").$Enums.Role;
    permissions: string[];
    isActive: boolean;
    createdAt: Date;
    venueUsers: ({
        venue: {
            id: number;
            name: string;
            isActive: boolean;
            slug: string;
        };
    } & {
        userId: number;
        venueId: number;
    })[];
} | null>;
//# sourceMappingURL=auth.service.d.ts.map