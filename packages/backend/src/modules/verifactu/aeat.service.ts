import https from 'https';
import { Prisma } from '@prisma/client';
import { config } from '../../config';
import { getFiscalCertificateBundle } from './certificate.service';
import { formatDecimalForHash, formatDateForHash } from './hash.service';

const SOAP_ENV_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const SUMINISTRO_LR_NS = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const SUMINISTRO_INFO_NS = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

export interface VerifactuTaxBreakdown {
  vatRate: number;
  taxableBase: number;
  taxAmount: number;
}

export interface SubmitVerifactuRecordInput {
  organisationId: number;
  invoiceCode: string;
  issuedAt: Date;
  effectiveNif: string;
  effectiveName: string;
  description: string;
  invoiceKind: 'F1' | 'F2';
  total: number;
  vatAmount: number;
  hashSelf: string;
  previousRecord?: {
    invoiceCode: string;
    issuedAt: Date;
    hash: string;
  } | null;
  breakdown: VerifactuTaxBreakdown[];
  refExternal?: string;
}

export interface AeatSubmissionResult {
  code: string;
  message: string;
  globalStatus: 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto' | 'Simulado';
  lineStatus: 'Correcto' | 'AceptadoConErrores' | 'Incorrecto' | 'Simulado';
  csv?: string | null;
  requestXml: string;
  responseXml?: string;
  isSimulated: boolean;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cleanText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function toSiNo(value: string, fallback: 'S' | 'N') {
  return value === 'S' || value === 'N' ? value : fallback;
}

function formatDateTimeWithOffset(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const timeZoneName = lookup.timeZoneName ?? 'GMT+00:00';
  const offset = timeZoneName.replace('GMT', '') || '+00:00';

  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}${offset}`;
}

function getTagValue(xml: string, tagName: string) {
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  if (!match) return null;

  return match[1]
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .trim();
}

function buildSoapEnvelope(input: SubmitVerifactuRecordInput) {
  const developerNif = cleanText(config.aeat.software.developerNif || input.effectiveNif, 9);
  const softwareXml = [
    `<sum:NombreRazon>${escapeXml(cleanText(config.aeat.software.developerName, 120))}</sum:NombreRazon>`,
    `<sum:NIF>${escapeXml(developerNif)}</sum:NIF>`,
    `<sum:NombreSistemaInformatico>${escapeXml(cleanText(config.aeat.software.softwareName, 30))}</sum:NombreSistemaInformatico>`,
    `<sum:IdSistemaInformatico>${escapeXml(cleanText(config.aeat.software.softwareId, 2))}</sum:IdSistemaInformatico>`,
    `<sum:Version>${escapeXml(cleanText(config.aeat.software.softwareVersion, 50))}</sum:Version>`,
    `<sum:NumeroInstalacion>${escapeXml(cleanText(config.aeat.software.installationId, 100))}</sum:NumeroInstalacion>`,
    `<sum:TipoUsoPosibleSoloVerifactu>${toSiNo(config.aeat.software.onlyVerifactu, 'S')}</sum:TipoUsoPosibleSoloVerifactu>`,
    `<sum:TipoUsoPosibleMultiOT>${toSiNo(config.aeat.software.multiObligado, 'N')}</sum:TipoUsoPosibleMultiOT>`,
    `<sum:IndicadorMultiplesOT>${toSiNo(config.aeat.software.multipleObligadoIndicator, 'N')}</sum:IndicadorMultiplesOT>`,
  ].join('');

  const breakdownXml = input.breakdown
    .map((line) => {
      const vatRate = Math.round(line.vatRate * 100) / 100;
      return [
        '<sum:DetalleDesglose>',
        '<sum:Impuesto>01</sum:Impuesto>',
        '<sum:ClaveRegimen>01</sum:ClaveRegimen>',
        '<sum:CalificacionOperacion>S1</sum:CalificacionOperacion>',
        `<sum:TipoImpositivo>${formatDecimalForHash(vatRate)}</sum:TipoImpositivo>`,
        `<sum:BaseImponibleOimporteNoSujeto>${formatDecimalForHash(line.taxableBase)}</sum:BaseImponibleOimporteNoSujeto>`,
        `<sum:CuotaRepercutida>${formatDecimalForHash(line.taxAmount)}</sum:CuotaRepercutida>`,
        '</sum:DetalleDesglose>',
      ].join('');
    })
    .join('');

  const chainingXml = input.previousRecord
    ? [
        '<sum:RegistroAnterior>',
        `<sum:IDEmisorFactura>${escapeXml(input.effectiveNif)}</sum:IDEmisorFactura>`,
        `<sum:NumSerieFactura>${escapeXml(cleanText(input.previousRecord.invoiceCode, 60))}</sum:NumSerieFactura>`,
        `<sum:FechaExpedicionFactura>${formatDateForHash(input.previousRecord.issuedAt)}</sum:FechaExpedicionFactura>`,
        `<sum:Huella>${escapeXml(input.previousRecord.hash)}</sum:Huella>`,
        '</sum:RegistroAnterior>',
      ].join('')
    : '<sum:PrimerRegistro>S</sum:PrimerRegistro>';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<soapenv:Envelope xmlns:soapenv="${SOAP_ENV_NS}" xmlns:sumLR="${SUMINISTRO_LR_NS}" xmlns:sum="${SUMINISTRO_INFO_NS}">`,
    '<soapenv:Header/>',
    '<soapenv:Body>',
    '<sumLR:RegFactuSistemaFacturacion>',
    '<sumLR:Cabecera>',
    '<sum:ObligadoEmision>',
    `<sum:NombreRazon>${escapeXml(cleanText(input.effectiveName, 120))}</sum:NombreRazon>`,
    `<sum:NIF>${escapeXml(cleanText(input.effectiveNif, 9))}</sum:NIF>`,
    '</sum:ObligadoEmision>',
    '</sumLR:Cabecera>',
    '<sumLR:RegistroFactura>',
    '<sum:RegistroAlta>',
    '<sum:IDVersion>1.0</sum:IDVersion>',
    '<sum:IDFactura>',
    `<sum:IDEmisorFactura>${escapeXml(cleanText(input.effectiveNif, 9))}</sum:IDEmisorFactura>`,
    `<sum:NumSerieFactura>${escapeXml(cleanText(input.invoiceCode, 60))}</sum:NumSerieFactura>`,
    `<sum:FechaExpedicionFactura>${formatDateForHash(input.issuedAt)}</sum:FechaExpedicionFactura>`,
    '</sum:IDFactura>',
    input.refExternal ? `<sum:RefExterna>${escapeXml(cleanText(input.refExternal, 60))}</sum:RefExterna>` : '',
    `<sum:NombreRazonEmisor>${escapeXml(cleanText(input.effectiveName, 120))}</sum:NombreRazonEmisor>`,
    `<sum:TipoFactura>${input.invoiceKind}</sum:TipoFactura>`,
    `<sum:DescripcionOperacion>${escapeXml(cleanText(input.description, 500))}</sum:DescripcionOperacion>`,
    '<sum:Desglose>',
    breakdownXml,
    '</sum:Desglose>',
    `<sum:CuotaTotal>${formatDecimalForHash(input.vatAmount)}</sum:CuotaTotal>`,
    `<sum:ImporteTotal>${formatDecimalForHash(input.total)}</sum:ImporteTotal>`,
    '<sum:Encadenamiento>',
    chainingXml,
    '</sum:Encadenamiento>',
    `<sum:SistemaInformatico>${softwareXml}</sum:SistemaInformatico>`,
    `<sum:FechaHoraHusoGenRegistro>${formatDateTimeWithOffset(input.issuedAt, 'Europe/Madrid')}</sum:FechaHoraHusoGenRegistro>`,
    '<sum:TipoHuella>01</sum:TipoHuella>',
    `<sum:Huella>${escapeXml(input.hashSelf)}</sum:Huella>`,
    '</sum:RegistroAlta>',
    '</sumLR:RegistroFactura>',
    '</sumLR:RegFactuSistemaFacturacion>',
    '</soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('');
}

function validateRealModeConfiguration() {
  if (!config.aeat.software.developerNif) {
    throw new Error('Falta configurar AEAT_SOFTWARE_DEVELOPER_NIF para remisión real a AEAT');
  }
}

async function postSoapRequest(xml: string, pfx: Buffer, passphrase: string) {
  const url = new URL(config.aeat.endpointUrl);

  return new Promise<string>((resolve, reject) => {
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      pfx,
      passphrase,
      timeout: config.aeat.timeoutMs,
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction': '""',
        'Content-Length': Buffer.byteLength(xml),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`AEAT respondió HTTP ${response.statusCode}: ${body.slice(0, 1000)}`));
          return;
        }

        resolve(body);
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error(`Timeout remitiendo registro a AEAT tras ${config.aeat.timeoutMs} ms`));
    });

    request.on('error', reject);
    request.write(xml);
    request.end();
  });
}

function parseSoapResponse(responseXml: string, requestXml: string): AeatSubmissionResult {
  const faultString = getTagValue(responseXml, 'faultstring');
  if (faultString) {
    throw new Error(`SOAP Fault AEAT: ${faultString}`);
  }

  const globalStatus = (getTagValue(responseXml, 'EstadoEnvio') ?? 'Incorrecto') as AeatSubmissionResult['globalStatus'];
  const lineStatus = (getTagValue(responseXml, 'EstadoRegistro') ?? 'Incorrecto') as AeatSubmissionResult['lineStatus'];
  const csv = getTagValue(responseXml, 'CSV');
  const code = getTagValue(responseXml, 'CodigoErrorRegistro')
    ?? lineStatus
    ?? globalStatus;
  const message = getTagValue(responseXml, 'DescripcionErrorRegistro')
    ?? `${globalStatus}/${lineStatus}`;

  return {
    code,
    message,
    globalStatus,
    lineStatus,
    csv,
    requestXml,
    responseXml,
    isSimulated: false,
  };
}

export async function submitVerifactuRecord(input: SubmitVerifactuRecordInput): Promise<AeatSubmissionResult> {
  const requestXml = buildSoapEnvelope(input);

  if (config.aeat.deliveryMode !== 'real') {
    return {
      code: 'SIMULATED',
      message: 'Remisión AEAT simulada. Configura AEAT_DELIVERY_MODE=real para envío real.',
      globalStatus: 'Simulado',
      lineStatus: 'Simulado',
      csv: null,
      requestXml,
      responseXml: undefined,
      isSimulated: true,
    };
  }

  validateRealModeConfiguration();

  const certificate = await getFiscalCertificateBundle(input.organisationId);
  if (!certificate) {
    throw new Error('No hay certificado fiscal cargado en administración para remitir a AEAT');
  }

  const responseXml = await postSoapRequest(requestXml, certificate.fileBuffer, certificate.passphrase);
  return parseSoapResponse(responseXml, requestXml);
}

export function buildTicketBreakdown(items: Array<{
  quantity: number;
  unitPrice: Prisma.Decimal;
  vatRate: Prisma.Decimal;
}>) {
  const grouped = new Map<string, VerifactuTaxBreakdown>();

  for (const item of items) {
    const vatRate = parseFloat(item.vatRate.toString());
    const gross = parseFloat(item.unitPrice.toString()) * item.quantity;
    const divisor = 1 + (vatRate / 100);
    const base = divisor > 0 ? gross / divisor : gross;
    const tax = gross - base;
    const key = vatRate.toFixed(2);
    const current = grouped.get(key) ?? { vatRate, taxableBase: 0, taxAmount: 0 };

    current.taxableBase += base;
    current.taxAmount += tax;
    grouped.set(key, current);
  }

  return [...grouped.values()].map((line) => ({
    vatRate: line.vatRate,
    taxableBase: Math.round(line.taxableBase * 100) / 100,
    taxAmount: Math.round(line.taxAmount * 100) / 100,
  }));
}
