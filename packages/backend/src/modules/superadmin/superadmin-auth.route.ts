import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { prisma } from '../../db/client';
import { verifyPassword } from '../auth/auth.service';
import { generateBase32Secret, generateQrCodeDataUrl, verifyTOTP } from './totp.service';

const CloudLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  masterKey: z.string().min(1),
  reset2FA: z.boolean().optional(),
});

const Verify2FASchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().length(6),
});

const Setup2FASchema = z.object({
  challengeToken: z.string().min(10),
  confirmCode: z.string().length(6),
});

// In-memory challenge & TOTP store for Cloud HQ Super Admin (persistent during server lifecycle)
interface ChallengeStore {
  email: string;
  secret: string;
  masterKey: string;
  expiresAt: number;
  isConfigured: boolean;
}

const challengeMap = new Map<string, ChallengeStore>();
const totpSecretsMap = new Map<string, string>(); // email -> secret

export async function superAdminAuthRoutes(fastify: FastifyInstance) {
  /**
   * 1. Login inicial con Email, Contraseña y Clave Maestra
   */
  fastify.post('/api/cloud-hq/auth/login', async (request, reply) => {
    const body = CloudLoginSchema.parse(request.body);

    // Validar Clave Maestra
    const effectiveMasterKey = config.licensing.masterKey || 'tavolo-master-license-key-change-in-prod';
    if (body.masterKey !== effectiveMasterKey) {
      return reply.status(403).send({ error: 'Clave Maestra de Licencias inválida' });
    }

    // Buscar usuario Administrador
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });

    if (!user || user.role !== 'ADMIN' || !user.isActive) {
      return reply.status(401).send({ error: 'Credenciales de Super Admin inválidas' });
    }

    // Verificar contraseña bcrypt
    const validPass = await verifyPassword(body.password, user.password);
    if (!validPass) {
      return reply.status(401).send({ error: 'Credenciales de Super Admin inválidas' });
    }

    if (body.reset2FA) {
      totpSecretsMap.delete(user.email);
    }

    // Obtener o generar secreto TOTP
    let secret = totpSecretsMap.get(user.email);
    const isConfigured = Boolean(secret);

    if (!secret) {
      secret = generateBase32Secret(20);
    }

    // Generar challengeToken
    const challengeToken = `cloud_challenge_${user.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    challengeMap.set(challengeToken, {
      email: user.email,
      secret,
      masterKey: body.masterKey,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutos
      isConfigured,
    });

    let qrCodeUrl: string | undefined = undefined;
    if (!isConfigured) {
      qrCodeUrl = await generateQrCodeDataUrl(user.email, secret, 'Tavolo Cloud HQ');
    }

    return reply.send({
      data: {
        requires2FA: true,
        isSetupRequired: !isConfigured,
        challengeToken,
        qrCodeUrl,
        secret: !isConfigured ? secret : undefined,
      },
    });
  });

  /**
   * 2. Confirmación de Vinculación inicial de 2FA
   */
  fastify.post('/api/cloud-hq/auth/setup-2fa', async (request, reply) => {
    const body = Setup2FASchema.parse(request.body);
    const challenge = challengeMap.get(body.challengeToken);

    if (!challenge || challenge.expiresAt < Date.now()) {
      return reply.status(400).send({ error: 'El desafío de inicio de sesión ha caducado. Vuelve a intentarlo.' });
    }

    const isValid = verifyTOTP(challenge.secret, body.confirmCode);
    if (!isValid) {
      return reply.status(400).send({ error: 'Código de 6 dígitos 2FA incorrecto. Revisa tu aplicación de autenticación.' });
    }

    // Guardar secreto de forma permanente
    totpSecretsMap.set(challenge.email, challenge.secret);
    challenge.isConfigured = true;

    return reply.send({
      data: {
        success: true,
        masterKey: challenge.masterKey,
        email: challenge.email,
      },
    });
  });

  /**
   * 3. Validación de Código TOTP 2FA (6 dígitos)
   */
  fastify.post('/api/cloud-hq/auth/verify-2fa', async (request, reply) => {
    const body = Verify2FASchema.parse(request.body);
    const challenge = challengeMap.get(body.challengeToken);

    if (!challenge || challenge.expiresAt < Date.now()) {
      return reply.status(400).send({ error: 'El desafío de inicio de sesión ha caducado. Vuelve a intentarlo.' });
    }

    const secret = totpSecretsMap.get(challenge.email) ?? challenge.secret;
    const isValid = verifyTOTP(secret, body.code);

    if (!isValid) {
      return reply.status(400).send({ error: 'Código 2FA incorrecto o caducado.' });
    }

    // Si es válido y no estaba guardado, persistir secreto
    if (!totpSecretsMap.has(challenge.email)) {
      totpSecretsMap.set(challenge.email, secret);
    }

    // Eliminar desafío consumido
    challengeMap.delete(body.challengeToken);

    return reply.send({
      data: {
        success: true,
        masterKey: challenge.masterKey,
        email: challenge.email,
      },
    });
  });
}
