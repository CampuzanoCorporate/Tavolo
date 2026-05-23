import crypto from 'crypto';
import type { License, LicenseStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { config } from '../../config';

export type EffectiveLicenseState = 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'UNLICENSED';

export interface LicenseEvaluation {
  effectiveState: EffectiveLicenseState;
  canWrite: boolean;
  reason: string;
  license: License | null;
}

function isMissingLicenseTableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2021';
  }

  return error instanceof Error
    && (
      error.message.includes('licenses')
      || error.message.includes('License')
      || error.message.includes('does not exist')
    );
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function buildLicenseDates(validityDays = config.licensing.defaultValidityDays, graceDays = config.licensing.defaultGraceDays) {
  const validFrom = new Date();
  const validUntil = addDays(validFrom, validityDays);
  const graceUntil = addDays(validUntil, graceDays);
  return { validFrom, validUntil, graceUntil };
}

export function generateLicenseCode() {
  return `TAV-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

export function evaluateLicense(license: License | null, now = new Date()): LicenseEvaluation {
  if (!license) {
    return {
      effectiveState: 'UNLICENSED',
      canWrite: false,
      reason: 'No hay licencia asignada a esta organización.',
      license: null,
    };
  }

  const nowMs = now.getTime();
  const validUntilMs = new Date(license.validUntil).getTime();
  const graceUntilMs = new Date(license.graceUntil).getTime();

  if (license.status === 'ACTIVE') {
    if (nowMs <= validUntilMs) {
      return {
        effectiveState: 'ACTIVE',
        canWrite: true,
        reason: 'Licencia activa y validada.',
        license,
      };
    }

    if (nowMs <= graceUntilMs) {
      return {
        effectiveState: 'GRACE',
        canWrite: true,
        reason: 'La licencia ha entrado en período de gracia. La sede puede seguir operando temporalmente.',
        license,
      };
    }
  }

  if ((license.status === 'SUSPENDED' || license.status === 'CANCELLED') && nowMs <= graceUntilMs) {
    return {
      effectiveState: 'GRACE',
      canWrite: true,
      reason: 'La licencia está suspendida, pero aún se encuentra dentro del período de gracia.',
      license,
    };
  }

  return {
    effectiveState: 'BLOCKED',
    canWrite: false,
    reason: license.status === 'CANCELLED'
      ? 'La licencia está cancelada y ha agotado el período de gracia.'
      : 'La licencia ha agotado el período de gracia y la sede queda en modo solo consulta.',
    license,
  };
}

export async function getCurrentOrganisationLicense(organisationId: number) {
  try {
    return await prisma.license.findFirst({
      where: { organisationId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  } catch (error) {
    if (isMissingLicenseTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getOrganisationLicenseStatus(organisationId: number) {
  try {
    const license = await getCurrentOrganisationLicense(organisationId);

    if (!license) {
      return {
        effectiveState: 'ACTIVE',
        canWrite: true,
        reason: 'Módulo de licencias aún no inicializado en esta base de datos.',
        license: null,
      } satisfies LicenseEvaluation;
    }

    return evaluateLicense(license);
  } catch (error) {
    if (isMissingLicenseTableError(error)) {
      return {
        effectiveState: 'ACTIVE',
        canWrite: true,
        reason: 'Módulo de licencias aún no inicializado en esta base de datos.',
        license: null,
      } satisfies LicenseEvaluation;
    }
    throw error;
  }
}

export async function touchOrganisationLicense(organisationId: number) {
  try {
    const license = await getCurrentOrganisationLicense(organisationId);
    if (!license) return null;

    return await prisma.license.update({
      where: { id: license.id },
      data: { lastSeenAt: new Date() },
    });
  } catch (error) {
    if (isMissingLicenseTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function generateLicense(params: {
  organisationId?: number;
  label?: string;
  status?: LicenseStatus;
  validityDays?: number;
  graceDays?: number;
  notes?: string;
}) {
  const graceDays = params.graceDays ?? config.licensing.defaultGraceDays;
  const { validFrom, validUntil, graceUntil } = buildLicenseDates(params.validityDays, graceDays);

  if (params.organisationId) {
    await prisma.license.updateMany({
      where: { organisationId: params.organisationId },
      data: { organisationId: null },
    });
  }

  return prisma.license.create({
    data: {
      organisationId: params.organisationId,
      code: generateLicenseCode(),
      label: params.label?.trim() || null,
      status: params.status ?? 'ACTIVE',
      validFrom,
      validUntil,
      graceDays,
      graceUntil,
      activatedAt: params.organisationId ? new Date() : null,
      lastValidatedAt: new Date(),
      notes: params.notes?.trim() || null,
    },
  });
}

export async function activateLicenseForOrganisation(code: string, organisationId: number) {
  const cleanedCode = code.trim().toUpperCase();
  const license = await prisma.license.findUnique({ where: { code: cleanedCode } });

  if (!license) {
    throw Object.assign(new Error('Código de licencia no encontrado'), { statusCode: 404 });
  }

  if (license.organisationId && license.organisationId !== organisationId) {
    throw Object.assign(new Error('Esta licencia ya está asignada a otra organización'), { statusCode: 409 });
  }

  const current = await getCurrentOrganisationLicense(organisationId);
  if (current && current.id !== license.id) {
    await prisma.license.update({
      where: { id: current.id },
      data: { organisationId: null },
    });
  }

  const now = new Date();
  const validUntil = new Date(license.validUntil);
  const graceUntil = new Date(license.graceUntil);

  if (validUntil < now) {
    const refreshed = buildLicenseDates(config.licensing.defaultValidityDays, license.graceDays);
    return prisma.license.update({
      where: { id: license.id },
      data: {
        organisationId,
        status: 'ACTIVE',
        validFrom: refreshed.validFrom,
        validUntil: refreshed.validUntil,
        graceUntil: refreshed.graceUntil,
        activatedAt: now,
        lastValidatedAt: now,
        lastSeenAt: now,
      },
    });
  }

  return prisma.license.update({
    where: { id: license.id },
    data: {
      organisationId,
      activatedAt: license.activatedAt ?? now,
      lastValidatedAt: now,
      lastSeenAt: now,
    },
  });
}

export async function refreshLicense(id: number, validityDays = config.licensing.defaultValidityDays) {
  const existing = await prisma.license.findUnique({ where: { id } });
  if (!existing) {
    throw Object.assign(new Error('Licencia no encontrada'), { statusCode: 404 });
  }

  const validFrom = startOfDay(new Date());
  const validUntil = addDays(validFrom, validityDays);
  const graceUntil = addDays(validUntil, existing.graceDays);

  return prisma.license.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      validFrom,
      validUntil,
      graceUntil,
      lastValidatedAt: new Date(),
    },
  });
}

export async function updateLicenseStatus(id: number, status: LicenseStatus) {
  const existing = await prisma.license.findUnique({ where: { id } });
  if (!existing) {
    throw Object.assign(new Error('Licencia no encontrada'), { statusCode: 404 });
  }

  const now = new Date();
  const graceUntil = existing.graceUntil > now ? existing.graceUntil : addDays(now, existing.graceDays);

  return prisma.license.update({
    where: { id },
    data: {
      status,
      graceUntil,
      lastValidatedAt: now,
    },
  });
}
