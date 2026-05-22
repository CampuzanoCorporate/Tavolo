/**
 * ============================================================
 * MÓDULO ADMIN — CRUD Completo para Gestión del Negocio
 * ============================================================
 * Todas las rutas requieren rol ADMIN o MANAGER.
 * Cubre: Organisation, Venue, Category, Product,
 *        Table, Printer, User.
 * ============================================================
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { hashPassword } from '../auth/auth.service';
import { Prisma } from '@prisma/client';

// ─── SCHEMAS DE VALIDACIÓN ────────────────────────────────────────────────────

const VenueCreateSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  address: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().default('Europe/Madrid'),
  useOrgNif: z.boolean().default(true),
  nifOverride: z.string().optional(),
  nameOverride: z.string().optional(),
  invoiceSeries: z.string().min(1).max(20).default('T'),
});

const OrgUpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  nif: z.string().min(8).max(20).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

const CategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  modifierGroups: z.array(z.object({
    id: z.number().int().positive().optional(),
    name: z.string().min(1).max(100),
    minSelections: z.number().int().min(0).default(1),
    maxSelections: z.number().int().min(1).default(1),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    options: z.array(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().min(1).max(100),
      priceDelta: z.number().min(0).default(0),
      sortOrder: z.number().int().default(0),
      isActive: z.boolean().default(true),
    })).default([]),
  }).superRefine((group, ctx) => {
    if (group.maxSelections < group.minSelections) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maxSelections debe ser mayor o igual que minSelections',
        path: ['maxSelections'],
      });
    }
  })).optional().default([]),
});

const ProductBaseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional().transform((value) => value ?? undefined),
  price: z.number().positive(),
  vatRate: z.number().min(0).max(100).default(10),
  categoryId: z.number().int().positive(),
  productType: z.enum(['NORMAL', 'MENU']).default('NORMAL'),
  menuCourseTags: z.array(z.enum(['FIRST', 'SECOND', 'DESSERT', 'COFFEE'])).default([]),
  menuConfig: z.object({
    includeFirst: z.boolean().default(false),
    includeSecond: z.boolean().default(false),
    finalMode: z.enum(['DESSERT_ONLY', 'DESSERT_OR_COFFEE', 'DESSERT_AND_COFFEE']).default('DESSERT_ONLY'),
  }).nullable().optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});

const ProductSchema = ProductBaseSchema.superRefine((product, ctx) => {
  if (product.productType === 'MENU' && !product.menuConfig) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Los productos de tipo menú necesitan configuración',
      path: ['menuConfig'],
    });
  }
});

const ProductUpdateSchema = ProductBaseSchema.partial().superRefine((product, ctx) => {
  if (product.productType === 'MENU' && !product.menuConfig) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Los productos de tipo menú necesitan configuración',
      path: ['menuConfig'],
    });
  }
});

const TableAdminSchema = z.object({
  number: z.number().int().positive(),
  name: z.string().max(50).optional().nullable(),
  seats: z.number().int().nonnegative().default(4),
  zone: z.string().max(50).optional().nullable(),
  posX: z.number().int().min(0).max(100).optional(),
  posY: z.number().int().min(0).max(100).optional(),
  objectType: z.string().max(20).optional().default('TABLE'),
  width: z.number().int().nonnegative().optional().default(0),
  height: z.number().int().nonnegative().optional().default(0),
});

const PrinterSchema = z.object({
  name: z.string().min(1).max(100),
  ipAddress: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(9100),
  type: z.enum(['RECEIPT', 'KITCHEN', 'BAR']).default('RECEIPT'),
  isActive: z.boolean().default(true),
});

const UserCreateSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']),
  venueIds: z.array(z.number().int().positive()).optional().default([]),
});

const UserUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
  venueIds: z.array(z.number().int().positive()).optional(),
});

// ─── HELPER: Validar acceso de sede ──────────────────────────────────────────

function assertVenueAccess(venueId: number, userVenueIds: number[], role: string) {
  if (role !== 'ADMIN' && !userVenueIds.includes(venueId)) {
    throw Object.assign(new Error('Sin acceso a esta sede'), { statusCode: 403 });
  }
}

function mapProductPayload(body: z.infer<typeof ProductBaseSchema>, venueId: number): Prisma.ProductUncheckedCreateInput {
  return {
    venueId,
    name: body.name,
    description: body.description,
    price: body.price,
    vatRate: body.vatRate,
    categoryId: body.categoryId,
    productType: body.productType,
    menuCourseTags: body.menuCourseTags,
    menuConfig: body.menuConfig === null ? Prisma.JsonNull : body.menuConfig,
    isAvailable: body.isAvailable,
    sortOrder: body.sortOrder,
  };
}

function mapProductUpdatePayload(body: z.infer<typeof ProductUpdateSchema>): Prisma.ProductUncheckedUpdateInput {
  const data: Prisma.ProductUncheckedUpdateInput = {};

  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.price !== undefined) data.price = body.price;
  if (body.vatRate !== undefined) data.vatRate = body.vatRate;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId;
  if (body.productType !== undefined) data.productType = body.productType;
  if (body.menuCourseTags !== undefined) data.menuCourseTags = body.menuCourseTags;
  if (body.menuConfig !== undefined) data.menuConfig = body.menuConfig === null ? Prisma.JsonNull : body.menuConfig;
  if (body.isAvailable !== undefined) data.isAvailable = body.isAvailable;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  return data;
}

// ─── RUTAS ADMIN ─────────────────────────────────────────────────────────────

export async function adminRoutes(fastify: FastifyInstance) {
  // Todas las rutas admin requieren autenticación
  fastify.addHook('onRequest', fastify.authenticate);

  // ── Organización ───────────────────────────────────────────────────────────

  /** GET /api/admin/organisation — Datos de la organización */
  fastify.get('/organisation', async (request, reply) => {
    const org = await prisma.organisation.findUnique({
      where: { id: request.user.organisationId },
      include: { venues: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    });
    return reply.send({ data: org });
  });

  /** PUT /api/admin/organisation — Actualizar datos fiscales/contacto */
  fastify.put('/organisation', async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Solo el ADMIN puede modificar la organización' });
    }
    const body = OrgUpdateSchema.parse(request.body);
    const org = await prisma.organisation.update({
      where: { id: request.user.organisationId },
      data: body,
    });
    return reply.send({ data: org });
  });

  // ── Sedes ──────────────────────────────────────────────────────────────────

  /** GET /api/admin/venues — Lista todas las sedes de la organización */
  fastify.get('/venues', async (request, reply) => {
    const venues = await prisma.venue.findMany({
      where: {
        organisationId: request.user.organisationId,
        // MANAGER solo ve sus sedes
        ...(request.user.role !== 'ADMIN' && {
          id: { in: request.user.venueIds },
        }),
      },
      include: {
        _count: { select: { tables: true, orders: true } },
      },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: venues });
  });

  /** GET /api/admin/venues/:id — Detalle de una sede */
  fastify.get<{ Params: { id: string } }>('/venues/:id', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);

    const venue = await prisma.venue.findFirst({
      where: { id: venueId, organisationId: request.user.organisationId },
      include: {
        printers: { orderBy: { name: 'asc' } },
        _count: { select: { tables: true, categories: true, products: true } },
      },
    });
    if (!venue) return reply.status(404).send({ error: 'Sede no encontrada' });
    return reply.send({ data: venue });
  });

  /** POST /api/admin/venues — Crear nueva sede */
  fastify.post('/venues', async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Solo el ADMIN puede crear sedes' });
    }
    const body = VenueCreateSchema.parse(request.body);
    const venue = await prisma.venue.create({
      data: { ...body, organisationId: request.user.organisationId },
    });
    return reply.status(201).send({ data: venue });
  });

  /** PUT /api/admin/venues/:id — Editar sede */
  fastify.put<{ Params: { id: string } }>('/venues/:id', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const body = VenueCreateSchema.partial().parse(request.body);
    const venue = await prisma.venue.update({ where: { id: venueId }, data: body });
    return reply.send({ data: venue });
  });

  /** DELETE /api/admin/venues/:id — Desactivar sede (soft delete) */
  fastify.delete<{ Params: { id: string } }>('/venues/:id', async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Solo el ADMIN puede desactivar sedes' });
    }
    const venueId = parseInt(request.params.id, 10);
    await prisma.venue.update({ where: { id: venueId }, data: { isActive: false } });
    return reply.send({ success: true });
  });

  // ── Categorías ─────────────────────────────────────────────────────────────

  /** GET /api/admin/venues/:id/categories */
  fastify.get<{ Params: { id: string } }>('/venues/:id/categories', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const categories = await prisma.category.findMany({
      where: { venueId },
      include: {
        _count: { select: { products: true } },
        modifierGroups: {
          include: {
            options: {
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ data: categories });
  });

  /** POST /api/admin/venues/:id/categories */
  fastify.post<{ Params: { id: string } }>('/venues/:id/categories', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const body = CategorySchema.parse(request.body);
    const { modifierGroups, ...categoryData } = body;
    const category = await prisma.category.create({
      data: {
        ...categoryData,
        venueId,
        modifierGroups: modifierGroups.length > 0 ? {
          create: modifierGroups.map((group) => ({
            name: group.name,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            sortOrder: group.sortOrder,
            isActive: group.isActive,
            options: group.options.length > 0 ? {
              create: group.options.map((option) => ({
                name: option.name,
                priceDelta: option.priceDelta,
                sortOrder: option.sortOrder,
                isActive: option.isActive,
              })),
            } : undefined,
          })),
        } : undefined,
      },
      include: {
        modifierGroups: {
          include: { options: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return reply.status(201).send({ data: category });
  });

  /** PUT /api/admin/categories/:id */
  fastify.put<{ Params: { id: string } }>('/categories/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return reply.status(404).send({ error: 'Categoría no encontrada' });
    assertVenueAccess(cat.venueId, request.user.venueIds, request.user.role);
    const body = CategorySchema.partial().parse(request.body);
    const { modifierGroups, ...categoryData } = body;

    const updated = await prisma.$transaction(async (tx) => {
      if (modifierGroups) {
        const existingGroups = await tx.modifierGroup.findMany({
          where: { categoryId: id },
          include: { options: true },
        });

        const incomingGroupIds = modifierGroups
          .map((group) => group.id)
          .filter((groupId): groupId is number => typeof groupId === 'number');

        const groupsToDelete = existingGroups.filter((group) => !incomingGroupIds.includes(group.id));
        if (groupsToDelete.length > 0) {
          await tx.modifierGroup.deleteMany({
            where: { id: { in: groupsToDelete.map((group) => group.id) } },
          });
        }

        for (const group of modifierGroups) {
          const groupRecord = group.id
            ? await tx.modifierGroup.update({
                where: { id: group.id },
                data: {
                  name: group.name,
                  minSelections: group.minSelections,
                  maxSelections: group.maxSelections,
                  sortOrder: group.sortOrder,
                  isActive: group.isActive,
                },
              })
            : await tx.modifierGroup.create({
                data: {
                  categoryId: id,
                  name: group.name,
                  minSelections: group.minSelections,
                  maxSelections: group.maxSelections,
                  sortOrder: group.sortOrder,
                  isActive: group.isActive,
                },
              });

          const existingOptions = existingGroups.find((existingGroup) => existingGroup.id === groupRecord.id)?.options ?? [];
          const incomingOptionIds = group.options
            .map((option) => option.id)
            .filter((optionId): optionId is number => typeof optionId === 'number');

          const optionsToDelete = existingOptions.filter((option) => !incomingOptionIds.includes(option.id));
          if (optionsToDelete.length > 0) {
            await tx.modifierOption.deleteMany({
              where: { id: { in: optionsToDelete.map((option) => option.id) } },
            });
          }

          for (const option of group.options) {
            if (option.id) {
              await tx.modifierOption.update({
                where: { id: option.id },
                data: {
                  name: option.name,
                  priceDelta: option.priceDelta,
                  sortOrder: option.sortOrder,
                  isActive: option.isActive,
                },
              });
            } else {
              await tx.modifierOption.create({
                data: {
                  groupId: groupRecord.id,
                  name: option.name,
                  priceDelta: option.priceDelta,
                  sortOrder: option.sortOrder,
                  isActive: option.isActive,
                },
              });
            }
          }
        }
      }

      return tx.category.update({
        where: { id },
        data: categoryData,
        include: {
          modifierGroups: {
            include: { options: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
    return reply.send({ data: updated });
  });

  /** DELETE /api/admin/categories/:id */
  fastify.delete<{ Params: { id: string } }>('/categories/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return reply.status(404).send({ error: 'Categoría no encontrada' });
    assertVenueAccess(cat.venueId, request.user.venueIds, request.user.role);
    await prisma.category.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true });
  });

  // ── Productos ──────────────────────────────────────────────────────────────

  /** GET /api/admin/venues/:id/products */
  fastify.get<{ Params: { id: string } }>('/venues/:id/products', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const products = await prisma.product.findMany({
      where: { venueId },
      include: { category: true },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    });
    return reply.send({ data: products });
  });

  /** POST /api/admin/venues/:id/products */
  fastify.post<{ Params: { id: string } }>('/venues/:id/products', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const body = ProductSchema.parse(request.body);
    const product = await prisma.product.create({ data: mapProductPayload(body, venueId) });
    return reply.status(201).send({ data: product });
  });

  /** PUT /api/admin/products/:id */
  fastify.put<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const prod = await prisma.product.findUnique({ where: { id } });
    if (!prod) return reply.status(404).send({ error: 'Producto no encontrado' });
    assertVenueAccess(prod.venueId, request.user.venueIds, request.user.role);
    const body = ProductUpdateSchema.parse(request.body);
    const updated = await prisma.product.update({ where: { id }, data: mapProductUpdatePayload(body) });
    return reply.send({ data: updated });
  });

  /** DELETE /api/admin/products/:id */
  fastify.delete<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const prod = await prisma.product.findUnique({ where: { id } });
    if (!prod) return reply.status(404).send({ error: 'Producto no encontrado' });
    assertVenueAccess(prod.venueId, request.user.venueIds, request.user.role);
    await prisma.product.update({ where: { id }, data: { isAvailable: false } });
    return reply.send({ success: true });
  });

  // ── Mesas ──────────────────────────────────────────────────────────────────

  /** GET /api/admin/venues/:id/tables */
  fastify.get<{ Params: { id: string } }>('/venues/:id/tables', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const tables = await prisma.table.findMany({
      where: { venueId },
      orderBy: { number: 'asc' },
    });
    return reply.send({ data: tables });
  });

  /** POST /api/admin/venues/:id/tables */
  fastify.post<{ Params: { id: string } }>('/venues/:id/tables', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const body = TableAdminSchema.parse(request.body);
    const table = await prisma.table.create({ data: { ...body, venueId } });
    return reply.status(201).send({ data: table });
  });

  /** PUT /api/admin/tables/:id */
  fastify.put<{ Params: { id: string } }>('/tables/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const table = await prisma.table.findUnique({ where: { id } });
    if (!table) return reply.status(404).send({ error: 'Mesa no encontrada' });
    assertVenueAccess(table.venueId, request.user.venueIds, request.user.role);
    const body = TableAdminSchema.partial().parse(request.body);
    const updated = await prisma.table.update({ where: { id }, data: body });
    return reply.send({ data: updated });
  });

  /** DELETE /api/admin/tables/:id */
  fastify.delete<{ Params: { id: string } }>('/tables/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const table = await prisma.table.findUnique({ where: { id } });
    if (!table) return reply.status(404).send({ error: 'Mesa no encontrada' });
    assertVenueAccess(table.venueId, request.user.venueIds, request.user.role);
    await prisma.table.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── Impresoras ─────────────────────────────────────────────────────────────

  /** GET /api/admin/venues/:id/printers */
  fastify.get<{ Params: { id: string } }>('/venues/:id/printers', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const printers = await prisma.printer.findMany({ where: { venueId }, orderBy: { name: 'asc' } });
    return reply.send({ data: printers });
  });

  /** POST /api/admin/venues/:id/printers */
  fastify.post<{ Params: { id: string } }>('/venues/:id/printers', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const body = PrinterSchema.parse(request.body);
    const printer = await prisma.printer.create({ data: { ...body, venueId } });
    return reply.status(201).send({ data: printer });
  });

  /** PUT /api/admin/printers/:id */
  fastify.put<{ Params: { id: string } }>('/printers/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const p = await prisma.printer.findUnique({ where: { id } });
    if (!p) return reply.status(404).send({ error: 'Impresora no encontrada' });
    assertVenueAccess(p.venueId, request.user.venueIds, request.user.role);
    const body = PrinterSchema.partial().parse(request.body);
    const updated = await prisma.printer.update({ where: { id }, data: body });
    return reply.send({ data: updated });
  });

  /** DELETE /api/admin/printers/:id */
  fastify.delete<{ Params: { id: string } }>('/printers/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const p = await prisma.printer.findUnique({ where: { id } });
    if (!p) return reply.status(404).send({ error: 'Impresora no encontrada' });
    assertVenueAccess(p.venueId, request.user.venueIds, request.user.role);
    await prisma.printer.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true });
  });

  // ── Usuarios ───────────────────────────────────────────────────────────────

  /** GET /api/admin/users */
  fastify.get('/users', async (request, reply) => {
    if (request.user.role !== 'ADMIN' && request.user.role !== 'MANAGER') {
      return reply.status(403).send({ error: 'Sin permisos' });
    }
    const users = await prisma.user.findMany({
      where: { organisationId: request.user.organisationId },
      select: {
        id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
        venueUsers: { include: { venue: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: users });
  });

  /** POST /api/admin/users — Crear usuario */
  fastify.post('/users', async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Solo el ADMIN puede crear usuarios' });
    }
    const body = UserCreateSchema.parse(request.body);
    const hashedPassword = await hashPassword(body.password);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          password: hashedPassword,
          role: body.role,
          organisationId: request.user.organisationId,
        },
      });
      if (body.venueIds && body.venueIds.length > 0) {
        await tx.venueUser.createMany({
          data: body.venueIds.map((venueId) => ({ userId: newUser.id, venueId })),
        });
      }
      return newUser;
    });

    return reply.status(201).send({
      data: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });

  /** PUT /api/admin/users/:id — Actualizar usuario */
  fastify.put<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Solo el ADMIN puede modificar usuarios' });
    }
    const userId = parseInt(request.params.id, 10);
    const body = UserUpdateSchema.parse(request.body);

    const updateData: Record<string, unknown> = {};
    if (body.name) updateData.name = body.name;
    if (body.role) updateData.role = body.role;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.password) updateData.password = await hashPassword(body.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: updateData });
      if (body.venueIds !== undefined) {
        await tx.venueUser.deleteMany({ where: { userId } });
        if (body.venueIds.length > 0) {
          await tx.venueUser.createMany({
            data: body.venueIds.map((venueId) => ({ userId, venueId })),
          });
        }
      }
    });

    return reply.send({ success: true });
  });

  // ── Tickets (log fiscal) ───────────────────────────────────────────────────

  /** GET /api/admin/venues/:id/tickets — Log de facturas */
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string; aeatStatus?: string };
  }>('/venues/:id/tickets', async (request, reply) => {
    const venueId = parseInt(request.params.id, 10);
    assertVenueAccess(venueId, request.user.venueIds, request.user.role);
    const { limit = '50', offset = '0', aeatStatus } = request.query;
    const tickets = await prisma.ticket.findMany({
      where: {
        venueId,
        ...(aeatStatus && { aeatStatus: aeatStatus as 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'ERROR' }),
      },
      orderBy: { invoiceNumber: 'desc' },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });
    const total = await prisma.ticket.count({ where: { venueId } });
    return reply.send({ data: tickets, total });
  });
}
