import { prisma } from '../../db/client';

export interface TicketLogoSummary {
  id: number;
  organisationId: number;
  label: string | null;
  originalFilename: string;
  mimeType: string | null;
  width: number;
  height: number;
  fileSizeBytes: number;
  uploadedAt: string;
  updatedAt: string;
}

function toSummary(record: Awaited<ReturnType<typeof prisma.ticketLogo.findUnique>>) {
  if (!record) return null;

  return {
    id: record.id,
    organisationId: record.organisationId,
    label: record.label,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    width: record.width,
    height: record.height,
    fileSizeBytes: record.fileSizeBytes,
    uploadedAt: record.uploadedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  } satisfies TicketLogoSummary;
}

export async function getTicketLogoSummary(organisationId: number) {
  const record = await prisma.ticketLogo.findUnique({
    where: { organisationId },
  });

  return toSummary(record);
}

export async function saveTicketLogo(params: {
  organisationId: number;
  label?: string | null;
  filename: string;
  mimeType?: string | null;
  pngBase64: string;
  width: number;
  height: number;
}) {
  const normalized = params.pngBase64.trim();
  const fileSizeBytes = Buffer.from(normalized, 'base64').length;

  if (fileSizeBytes === 0) {
    throw new Error('El logotipo está vacío');
  }

  if (fileSizeBytes > 1024 * 1024 * 2) {
    throw new Error('El logotipo supera el tamaño máximo permitido de 2 MB');
  }

  const record = await prisma.ticketLogo.upsert({
    where: { organisationId: params.organisationId },
    create: {
      organisationId: params.organisationId,
      label: params.label?.trim() || null,
      originalFilename: params.filename.trim(),
      mimeType: params.mimeType?.trim() || 'image/png',
      width: params.width,
      height: params.height,
      fileSizeBytes,
      pngBase64: normalized,
    },
    update: {
      label: params.label?.trim() || null,
      originalFilename: params.filename.trim(),
      mimeType: params.mimeType?.trim() || 'image/png',
      width: params.width,
      height: params.height,
      fileSizeBytes,
      pngBase64: normalized,
    },
  });

  return toSummary(record);
}

export async function deleteTicketLogo(organisationId: number) {
  await prisma.ticketLogo.deleteMany({
    where: { organisationId },
  });
}

export async function getTicketLogoBase64(organisationId: number) {
  const record = await prisma.ticketLogo.findUnique({
    where: { organisationId },
    select: { pngBase64: true },
  });

  return record?.pngBase64 ?? null;
}
