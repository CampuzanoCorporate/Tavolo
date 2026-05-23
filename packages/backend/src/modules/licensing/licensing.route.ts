import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { activateLicenseForOrganisation, evaluateLicense, generateLicense, getOrganisationLicenseStatus, refreshLicense, touchOrganisationLicense, updateLicenseStatus } from './licensing.service';
import { prisma } from '../../db/client';

const ActivateLicenseSchema = z.object({
  code: z.string().min(8).max(64),
});

const GenerateLicenseSchema = z.object({
  organisationId: z.number().int().positive().optional(),
  label: z.string().trim().max(120).optional(),
  validityDays: z.number().int().min(1).max(365).default(config.licensing.defaultValidityDays),
  graceDays: z.number().int().min(0).max(90).default(config.licensing.defaultGraceDays),
  notes: z.string().trim().max(1000).optional(),
});

const RefreshLicenseSchema = z.object({
  validityDays: z.number().int().min(1).max(365).default(config.licensing.defaultValidityDays),
});

const UpdateLicenseStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']),
});

function assertAdmin(request: Parameters<FastifyInstance['authenticate']>[0]) {
  if (request.user.role !== 'ADMIN') {
    throw Object.assign(new Error('Solo el ADMIN puede gestionar licencias'), { statusCode: 403 });
  }
}

function assertMasterKey(request: Parameters<FastifyInstance['authenticate']>[0]) {
  const incomingKey = String(request.headers['x-license-master-key'] ?? '');
  if (!config.licensing.masterKey || incomingKey !== config.licensing.masterKey) {
    throw Object.assign(new Error('Clave maestra de licencias inválida'), { statusCode: 403 });
  }
}

export async function licensingRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/status', async (request, reply) => {
    const status = await getOrganisationLicenseStatus(request.user.organisationId);
    await touchOrganisationLicense(request.user.organisationId);
    return reply.send({ data: status });
  });

  fastify.get('/current', async (request, reply) => {
    assertAdmin(request);
    const status = await getOrganisationLicenseStatus(request.user.organisationId);
    return reply.send({ data: status });
  });

  fastify.post('/activate', async (request, reply) => {
    assertAdmin(request);
    const body = ActivateLicenseSchema.parse(request.body);
    const license = await activateLicenseForOrganisation(body.code, request.user.organisationId);
    return reply.status(201).send({ data: evaluateLicense(license) });
  });

  fastify.get('/center/licenses', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);

    const licenses = await prisma.license.findMany({
      where: {
        OR: [
          { organisationId: request.user.organisationId },
          { organisationId: null },
        ],
      },
      include: {
        organisation: {
          select: { id: true, name: true, nif: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return reply.send({ data: licenses });
  });

  fastify.post('/center/licenses/generate', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const body = GenerateLicenseSchema.parse(request.body);
    const targetOrganisationId = body.organisationId ?? request.user.organisationId;
    const license = await generateLicense({
      organisationId: targetOrganisationId,
      label: body.label,
      validityDays: body.validityDays,
      graceDays: body.graceDays,
      notes: body.notes,
    });

    return reply.status(201).send({ data: license });
  });

  fastify.post<{ Params: { id: string } }>('/center/licenses/:id/refresh', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const body = RefreshLicenseSchema.parse(request.body);
    const id = parseInt(request.params.id, 10);
    const license = await refreshLicense(id, body.validityDays);
    return reply.send({ data: license });
  });

  fastify.patch<{ Params: { id: string } }>('/center/licenses/:id/status', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const body = UpdateLicenseStatusSchema.parse(request.body);
    const id = parseInt(request.params.id, 10);
    const license = await updateLicenseStatus(id, body.status);
    return reply.send({ data: license });
  });
}
