/**
 * ============================================================
 * MÓDULO AUTH — Servicio de Autenticación
 * ============================================================
 * Login con email + password, generación de JWT con
 * payload de roles y sedes accesibles.
 * ============================================================
 */
import bcrypt from 'bcrypt';
import { prisma } from '../../db/client';
import type { JWTPayload } from '../../types/jwt';

/**
 * Hashea una contraseña con bcrypt (coste 12).
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/**
 * Verifica una contraseña contra su hash bcrypt.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Realiza el login de un usuario y retorna el payload JWT.
 * Lanza un Error si las credenciales son inválidas.
 *
 * @param email - Email del usuario
 * @param password - Contraseña en texto plano
 * @returns Payload para incluir en el JWT
 */
export async function loginUser(email: string, password: string): Promise<JWTPayload> {
  const user = await prisma.user.findUnique({
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
  let venueIds: number[];
  if (user.role === 'ADMIN') {
    const venues = await prisma.venue.findMany({
      where: { organisationId: user.organisationId, isActive: true },
      select: { id: true },
    });
    venueIds = venues.map((v) => v.id);
  } else {
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
export async function getUserProfile(userId: number) {
  return prisma.user.findUnique({
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
