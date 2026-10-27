import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { activateLicenseForOrganisation, evaluateLicense, generateLicense, getOrganisationLicenseStatus, refreshLicense, touchOrganisationLicense, updateLicenseStatus } from './licensing.service';
import { prisma } from '../../db/client';
import { testAeatConnection } from '../verifactu/aeat.service';

const ActivateLicenseSchema = z.object({
  code: z.string().min(8).max(64),
});

const GenerateLicenseSchema = z.object({
  organisationId: z.number().int().positive().optional(),
  label: z.string().trim().max(120).optional(),
  planType: z.enum(['BASIC', 'PRO', 'ENTERPRISE', 'CUSTOM']).optional(),
  maxScreens: z.number().int().min(1).max(999).optional(),
  hasKitchenDisplay: z.boolean().optional(),
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

const CentreOrganisationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  nif: z.string().trim().min(4).max(20),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
});

const CentreVenueSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().trim().max(50).optional(),
  invoiceSeries: z.string().trim().min(1).max(20).optional(),
  kitchenEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const CentreUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']),
  venueIds: z.array(z.number().int().positive()).default([]),
  isActive: z.boolean().optional(),
});

function assertAdmin(request: Parameters<FastifyInstance['authenticate']>[0]) {
  if (request.user && request.user.role !== 'ADMIN') {
    throw Object.assign(new Error('Solo el ADMIN puede gestionar licencias'), { statusCode: 403 });
  }
}

function assertMasterKey(request: Parameters<FastifyInstance['authenticate']>[0]) {
  const incomingKey = String(request.headers['x-license-master-key'] ?? '');
  const effectiveMasterKey = config.licensing.masterKey || 'tavolo-master-license-key-change-in-prod';
  if (incomingKey !== effectiveMasterKey) {
    throw Object.assign(new Error('Clave maestra de licencias inválida'), { statusCode: 403 });
  }
}

export async function licensingRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    const isCenterRoute = request.url.includes('/center/');
    if (isCenterRoute) {
      const incomingKey = String(request.headers['x-license-master-key'] ?? '');
      const effectiveMasterKey = config.licensing.masterKey || 'tavolo-master-license-key-change-in-prod';
      if (incomingKey === effectiveMasterKey) {
        return;
      }
    }
    await fastify.authenticate(request, reply);
  });

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

    const orgId = request.user?.organisationId;
    const licenses = await prisma.license.findMany({
      where: orgId ? {
        OR: [
          { organisationId: orgId },
          { organisationId: null },
        ],
      } : undefined,
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
    const targetOrganisationId = body.organisationId ?? request.user?.organisationId;
    const license = await generateLicense({
      organisationId: targetOrganisationId,
      label: body.label,
      planType: body.planType,
      maxScreens: body.maxScreens,
      hasKitchenDisplay: body.hasKitchenDisplay,
      validityDays: body.validityDays,
      graceDays: body.graceDays,
      notes: body.notes,
    });

    return reply.status(201).send({ data: license });
  });

  fastify.post<{ Params: { id: string } }>('/center/licenses/:id/refresh', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const id = parseInt(request.params.id, 10);
    const body = RefreshLicenseSchema.parse(request.body ?? {});
    const updated = await refreshLicense(id, body.validityDays);
    return reply.send({ data: updated });
  });

  fastify.patch<{ Params: { id: string } }>('/center/licenses/:id/status', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const id = parseInt(request.params.id, 10);
    const body = UpdateLicenseStatusSchema.parse(request.body);
    const updated = await updateLicenseStatus(id, body.status);
    return reply.send({ data: updated });
  });

  fastify.post('/center/organisations/provision', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);

    const schema = z.object({
      name: z.string().min(2).max(100),
      nif: z.string().min(4).max(20),
      email: z.string().email(),
      provisionalPassword: z.string().min(6),
      venueName: z.string().min(2).default('Sede Central'),
      planType: z.enum(['BASIC', 'PRO', 'ENTERPRISE', 'CUSTOM']).default('PRO'),
      maxScreens: z.number().int().min(1).default(5),
      hasKitchenDisplay: z.boolean().default(true),
    });

    const body = schema.parse(request.body);
    const { hashPassword } = await import('../auth/auth.service');

    // 1. Crear Organización
    const org = await prisma.organisation.create({
      data: {
        name: body.name.trim(),
        nif: body.nif.trim().toUpperCase(),
        email: body.email.trim().toLowerCase(),
        isActive: true,
      },
    });

    // 2. Crear Sede inicial
    const slug = body.venueName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'sede-1';
    const venue = await prisma.venue.create({
      data: {
        organisationId: org.id,
        name: body.venueName.trim(),
        slug: `${slug}-${org.id}`,
        isActive: true,
        invoiceSeries: 'F2026',
      },
    });

    // 3. Crear Usuario Administrador de Cliente con contraseña provisional
    const hashedPassword = await hashPassword(body.provisionalPassword);
    const user = await prisma.user.create({
      data: {
        name: `Admin ${body.name}`,
        email: body.email.trim().toLowerCase(),
        password: hashedPassword,
        role: 'ADMIN',
        organisationId: org.id,
        mustChangePassword: true,
        isActive: true,
      },
    });

    await prisma.venueUser.create({
      data: {
        userId: user.id,
        venueId: venue.id,
      },
    });

    // 4. Generar Licencia activa
    const license = await generateLicense({
      organisationId: org.id,
      label: `Licencia Inicial ${body.planType}`,
      planType: body.planType,
      maxScreens: body.maxScreens,
      hasKitchenDisplay: body.hasKitchenDisplay,
      validityDays: 30,
    });

    return reply.status(201).send({
      data: {
        organisation: org,
        venue,
        user: { id: user.id, email: user.email, mustChangePassword: true },
        license,
      },
    });
  });

  fastify.get('/center/organisations', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);

    const orgs = await prisma.organisation.findMany({
      include: {
        fiscalConfig: true,
        fiscalCertificate: {
          select: {
            id: true,
            label: true,
            originalFilename: true,
            fileSizeBytes: true,
            uploadedAt: true,
          },
        },
        licenses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        venues: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const data = await Promise.all(
      orgs.map(async (org) => {
        const activeLicense = org.licenses[0] ?? null;
        const evaluation = evaluateLicense(activeLicense);
        const venueIds = org.venues.map((v) => v.id);

        let billingStats = {
          totalBilled: 0,
          totalTickets: 0,
          pendingAeatCount: 0,
          errorAeatCount: 0,
        };

        let issueTickets: Array<{
          id: number;
          invoiceCode: string;
          total: number;
          aeatStatus: string;
          aeatResponseMsg: string | null;
          issuedAt: string;
          venueName: string;
        }> = [];

        if (venueIds.length > 0) {
          const aggregate = await prisma.ticket.aggregate({
            where: { venueId: { in: venueIds } },
            _sum: { total: true },
            _count: { id: true },
          });

          const pendingCount = await prisma.ticket.count({
            where: { venueId: { in: venueIds }, aeatStatus: 'PENDING' },
          });

          const errorCount = await prisma.ticket.count({
            where: { venueId: { in: venueIds }, aeatStatus: { in: ['ERROR', 'REJECTED'] } },
          });

          billingStats = {
            totalBilled: Number(aggregate._sum.total ?? 0),
            totalTickets: aggregate._count.id,
            pendingAeatCount: pendingCount,
            errorAeatCount: errorCount,
          };

          const problematicTickets = await prisma.ticket.findMany({
            where: {
              venueId: { in: venueIds },
              aeatStatus: { in: ['PENDING', 'ERROR', 'REJECTED'] },
            },
            include: { venue: { select: { name: true } } },
            orderBy: { issuedAt: 'desc' },
            take: 20,
          });

          issueTickets = problematicTickets.map((t) => ({
            id: t.id,
            invoiceCode: t.invoiceCode,
            total: Number(t.total),
            aeatStatus: t.aeatStatus,
            aeatResponseMsg: t.aeatResponseMsg,
            issuedAt: t.issuedAt.toISOString(),
            venueName: t.venue.name,
          }));
        }

        return {
          id: org.id,
          name: org.name,
          nif: org.nif,
          address: org.address,
          phone: org.phone,
          email: org.email,
          isActive: org.isActive,
          venues: org.venues,
          fiscalConfig: org.fiscalConfig,
          hasCertificate: Boolean(org.fiscalCertificate),
          certificateSummary: org.fiscalCertificate,
          activeLicense: activeLicense ? { ...activeLicense, evaluation } : null,
          billingStats,
          issueTickets,
        };
      })
    );

    return reply.send({ data });
  });

  /** Gestión de la ficha comercial y fiscal de cualquier cliente. */
  fastify.put<{ Params: { id: string } }>('/center/organisations/:id', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const organisationId = parseInt(request.params.id, 10);
    const body = CentreOrganisationSchema.parse(request.body);
    const organisation = await prisma.organisation.update({
      where: { id: organisationId },
      data: { ...body, nif: body.nif.toUpperCase(), email: body.email?.toLowerCase() },
    });
    return reply.send({ data: organisation });
  });

  fastify.post<{ Params: { id: string } }>('/center/organisations/:id/venues', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const organisationId = parseInt(request.params.id, 10);
    const body = CentreVenueSchema.parse(request.body);
    const venue = await prisma.venue.create({ data: { ...body, organisationId } });
    return reply.status(201).send({ data: venue });
  });

  fastify.put<{ Params: { id: string } }>('/center/venues/:id', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const venueId = parseInt(request.params.id, 10);
    const body = CentreVenueSchema.partial().parse(request.body);
    const venue = await prisma.venue.update({ where: { id: venueId }, data: body });
    return reply.send({ data: venue });
  });

  fastify.get<{ Params: { id: string } }>('/center/organisations/:id/users', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const organisationId = parseInt(request.params.id, 10);
    const users = await prisma.user.findMany({
      where: { organisationId },
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, venueUsers: { select: { venueId: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return reply.send({ data: users });
  });

  fastify.post<{ Params: { id: string } }>('/center/organisations/:id/users', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const organisationId = parseInt(request.params.id, 10);
    const body = CentreUserSchema.extend({ password: z.string().min(8).max(100) }).parse(request.body);
    const allowedVenues = await prisma.venue.count({ where: { id: { in: body.venueIds }, organisationId } });
    if (allowedVenues !== body.venueIds.length) return reply.status(400).send({ error: 'Una o más sedes no pertenecen al cliente' });
    const { hashPassword } = await import('../auth/auth.service');
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        role: body.role,
        password: await hashPassword(body.password),
        organisationId,
        isActive: body.isActive ?? true,
        mustChangePassword: true,
        venueUsers: { create: body.venueIds.map((venueId) => ({ venueId })) },
      },
    });
    return reply.status(201).send({ data: user });
  });

  fastify.put<{ Params: { id: string } }>('/center/users/:id', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const userId = parseInt(request.params.id, 10);
    const body = CentreUserSchema.partial().parse(request.body);
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) return reply.status(404).send({ error: 'Usuario no encontrado' });
    if (body.venueIds) {
      const allowedVenues = await prisma.venue.count({ where: { id: { in: body.venueIds }, organisationId: current.organisationId } });
      if (allowedVenues !== body.venueIds.length) return reply.status(400).send({ error: 'Una o más sedes no pertenecen al cliente' });
    }
    const user = await prisma.$transaction(async (tx) => {
      if (body.venueIds) {
        await tx.venueUser.deleteMany({ where: { userId } });
        await tx.venueUser.createMany({ data: body.venueIds.map((venueId) => ({ userId, venueId })) });
      }
      return tx.user.update({
        where: { id: userId },
        data: { name: body.name, email: body.email?.toLowerCase(), role: body.role, isActive: body.isActive },
      });
    });
    return reply.send({ data: user });
  });

  fastify.post<{ Params: { id: string } }>('/center/users/:id/reset-password', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);
    const userId = parseInt(request.params.id, 10);
    const { password } = z.object({ password: z.string().min(8).max(100) }).parse(request.body);
    const { hashPassword } = await import('../auth/auth.service');
    const user = await prisma.user.update({ where: { id: userId }, data: { password: await hashPassword(password), mustChangePassword: true } });
    return reply.send({ data: user });
  });

  /**
   * PATCH /api/licensing/center/organisations/:id/status
   * Dar de baja (desactivar) o reactivar una organización cliente completa.
   */
  fastify.patch<{ Params: { id: string } }>('/center/organisations/:id/status', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);

    const organisationId = parseInt(request.params.id, 10);
    const schema = z.object({
      isActive: z.boolean(),
    });

    const { isActive } = schema.parse(request.body);
    const now = new Date();

    // 1. Actualizar estado de la organización
    const updatedOrg = await prisma.organisation.update({
      where: { id: organisationId },
      data: { isActive },
    });

    // 2. Actualizar estado de sus sedes
    await prisma.venue.updateMany({
      where: { organisationId },
      data: { isActive },
    });

    // 3. Actualizar estado de sus usuarios
    await prisma.user.updateMany({
      where: { organisationId },
      data: { isActive },
    });

    // 4. Si se da de baja, suspender sus licencias inmediatamente. Si se reactiva, activar licencia.
    if (!isActive) {
      await prisma.license.updateMany({
        where: { organisationId },
        data: {
          status: 'SUSPENDED',
          graceDays: 0,
          graceUntil: now,
          lastValidatedAt: now,
        },
      });
    } else {
      const activeLic = await prisma.license.findFirst({
        where: { organisationId },
        orderBy: { createdAt: 'desc' },
      });
      if (activeLic) {
        await prisma.license.update({
          where: { id: activeLic.id },
          data: {
            status: 'ACTIVE',
            graceDays: config.licensing.defaultGraceDays,
            validUntil: activeLic.validUntil < now ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : activeLic.validUntil,
            graceUntil: new Date(now.getTime() + 37 * 24 * 60 * 60 * 1000),
            lastValidatedAt: now,
          },
        });
      }
    }

    return reply.send({
      message: isActive ? 'Cliente reactivado con éxito' : 'Cliente dado de baja correctamente',
      data: updatedOrg,
    });
  });

  fastify.put<{ Params: { id: string } }>('/center/organisations/:id/fiscal', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);

    const organisationId = parseInt(request.params.id, 10);
    const FiscalConfigSchema = z.object({
      environment: z.enum(['TEST', 'PRODUCTION']).default('TEST'),
      customEndpointUrl: z
        .union([z.string().url(), z.literal('')])
        .nullable()
        .optional()
        .transform((val) => (val === '' || !val ? null : val)),
      developerName: z.string().min(2).max(120).default('Tavolo POS'),
      developerNif: z
        .union([z.string().max(20), z.literal('')])
        .nullable()
        .optional()
        .transform((val) => (val === '' || !val ? null : val)),
      softwareName: z.string().min(1).max(30).default('TAVOLOPOS'),
      softwareId: z.string().min(1).max(2).default('01'),
      softwareVersion: z.string().min(1).max(50).default('1.0.0'),
      installationId: z.string().min(1).max(100).default('default'),
      onlyVerifactu: z.boolean().default(true),
    });

    const body = FiscalConfigSchema.parse(request.body);
    const cfg = await prisma.fiscalConfig.upsert({
      where: { organisationId },
      create: { ...body, organisationId },
      update: body,
    });

    return reply.send({ data: cfg });
  });

  fastify.post<{ Params: { id: string } }>('/center/organisations/:id/test-aeat', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);

    const organisationId = parseInt(request.params.id, 10);
    const result = await testAeatConnection(organisationId);
    return reply.send({ data: result });
  });

  fastify.get<{ Params: { id: string } }>('/center/venues/:id/tickets', async (request, reply) => {
    assertAdmin(request);
    assertMasterKey(request);

    const venueId = parseInt(request.params.id, 10);
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { organisation: { select: { id: true, name: true, nif: true } } },
    });

    if (!venue) {
      return reply.status(404).send({ error: 'Sede no encontrada' });
    }

    const aggregate = await prisma.ticket.aggregate({
      where: { venueId },
      _sum: { total: true },
      _count: { id: true },
    });

    const pendingCount = await prisma.ticket.count({
      where: { venueId, aeatStatus: 'PENDING' },
    });
    const acceptedCount = await prisma.ticket.count({
      where: { venueId, aeatStatus: 'ACCEPTED' },
    });
    const errorCount = await prisma.ticket.count({
      where: { venueId, aeatStatus: { in: ['ERROR', 'REJECTED'] } },
    });

    const tickets = await prisma.ticket.findMany({
      where: { venueId },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });

    return reply.send({
      data: {
        venue: {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
          invoiceSeries: venue.invoiceSeries,
          organisationName: venue.organisation.name,
          organisationNif: venue.organisation.nif,
        },
        stats: {
          totalBilled: Number(aggregate._sum.total ?? 0),
          totalTickets: aggregate._count.id,
          acceptedCount,
          pendingCount,
          errorCount,
        },
        tickets: tickets.map((t) => ({
          id: t.id,
          invoiceCode: t.invoiceCode,
          invoiceSeries: t.invoiceSeries,
          invoiceNumber: t.invoiceNumber,
          subtotal: Number(t.subtotal),
          vatAmount: Number(t.vatAmount),
          total: Number(t.total),
          paymentMethod: t.paymentMethod,
          aeatStatus: t.aeatStatus,
          aeatResponseMsg: t.aeatResponseMsg,
          hashSelf: t.hashSelf,
          issuedAt: t.issuedAt.toISOString(),
          isRectified: t.isRectified,
        })),
      },
    });
  });
}
