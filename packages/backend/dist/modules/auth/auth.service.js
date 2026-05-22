"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.loginUser = loginUser;
exports.getUserProfile = getUserProfile;
/**
 * ============================================================
 * MÓDULO AUTH — Servicio de Autenticación
 * ============================================================
 * Login con email + password, generación de JWT con
 * payload de roles y sedes accesibles.
 * ============================================================
 */
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("../../db/client");
/**
 * Hashea una contraseña con bcrypt (coste 12).
 */
async function hashPassword(plain) {
    return bcrypt_1.default.hash(plain, 12);
}
/**
 * Verifica una contraseña contra su hash bcrypt.
 */
async function verifyPassword(plain, hash) {
    return bcrypt_1.default.compare(plain, hash);
}
/**
 * Realiza el login de un usuario y retorna el payload JWT.
 * Lanza un Error si las credenciales son inválidas.
 *
 * @param email - Email del usuario
 * @param password - Contraseña en texto plano
 * @returns Payload para incluir en el JWT
 */
async function loginUser(email, password) {
    const user = await client_1.prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        include: {
            venueUsers: { select: { venueId: true } },
        },
    });
    if (!user || !user.isActive) {
        // ⚠️ SEGURIDAD: Mismo mensaje para "no existe" y "contraseña incorrecta"
        throw new Error('Credenciales inválidas');
    }
    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
        throw new Error('Credenciales inválidas');
    }
    // Para ADMIN: acceso a todas las sedes de su organización
    let venueIds;
    if (user.role === 'ADMIN') {
        const venues = await client_1.prisma.venue.findMany({
            where: { organisationId: user.organisationId, isActive: true },
            select: { id: true },
        });
        venueIds = venues.map((v) => v.id);
    }
    else {
        // MANAGER/WAITER/KITCHEN: solo sus sedes asignadas
        venueIds = user.venueUsers.map((vu) => vu.venueId);
    }
    return {
        userId: user.id,
        email: user.email,
        role: user.role,
        organisationId: user.organisationId,
        venueIds,
    };
}
/**
 * Obtiene el perfil completo del usuario autenticado.
 */
async function getUserProfile(userId) {
    return client_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            organisation: {
                select: { id: true, name: true, nif: true },
            },
            venueUsers: {
                include: {
                    venue: { select: { id: true, name: true, slug: true, isActive: true } },
                },
            },
        },
    });
}
//# sourceMappingURL=auth.service.js.map