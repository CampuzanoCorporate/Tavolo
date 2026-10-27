import https from 'https';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { config } from '../../config';
import { getFiscalCertificateBundle } from './certificate.service';
import { formatDecimalForHash, formatDateForHash } from './hash.service';

const SOAP_ENV_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const SUMINISTRO_LR_NS = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const SUMINISTRO_INFO_NS = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

export const OFFICIAL_AEAT_ENDPOINTS = {
  TEST: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  PRODUCTION: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
} as const;

export interface VerifactuTaxBreakdown {
  vatRate: number;
  taxableBase: number;
  taxAmount: number;
}

export interface EffectiveFiscalConfig {
  environment: 'TEST' | 'PRODUCTION';
  endpointUrl: string;
  developerName: string;
  developerNif: string;
  softwareName: string;
  softwareId: string;
  softwareVersion: string;
  installationId: string;
  onlyVerifactu: boolean;
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

function toSiNo(value: boolean | string | undefined, fallback: 'S' | 'N') {
  if (value === true || value === 'S') return 'S';
  if (value === false || value === 'N') return 'N';
  return fallback;
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

export async function getEffectiveFiscalConfig(organisationId: number): Promise<EffectiveFiscalConfig> {
  const custom = await prisma.fiscalConfig.findUnique({
    where: { organisationId },
  });

  const environment = (custom?.environment === 'PRODUCTION' ? 'PRODUCTION' : 'TEST') as 'TEST' | 'PRODUCTION';
  const defaultEndpoint = OFFICIAL_AEAT_ENDPOINTS[environment];
  const endpointUrl = custom?.customEndpointUrl?.trim() || config.aeat.endpointUrl || defaultEndpoint;

  return {
    environment,
    endpointUrl,
    developerName: custom?.developerName?.trim() || config.aeat.software.developerName || 'Tavolo POS',
    developerNif: custom?.developerNif?.trim() || config.aeat.software.developerNif || '',
    softwareName: custom?.softwareName?.trim() || config.aeat.software.softwareName || 'TAVOLOPOS',
    softwareId: custom?.softwareId?.trim() || config.aeat.software.softwareId || '01',
    softwareVersion: custom?.softwareVersion?.trim() || config.aeat.software.softwareVersion || '1.0.0',
    installationId: custom?.installationId?.trim() || config.aeat.software.installationId || 'default',
    onlyVerifactu: custom?.onlyVerifactu ?? (config.aeat.software.onlyVerifactu === 'S'),
  };
}

function buildSoapEnvelope(input: SubmitVerifactuRecordInput, fiscalConfig: EffectiveFiscalConfig) {
  const developerNif = cleanText(fiscalConfig.developerNif || input.effectiveNif, 9);
  const softwareXml = [
    `<sum:NombreRazon>${escapeXml(cleanText(fiscalConfig.developerName, 120))}</sum:NombreRazon>`,
    `<sum:NIF>${escapeXml(developerNif)}</sum:NIF>`,
    `<sum:NombreSistemaInformatico>${escapeXml(cleanText(fiscalConfig.softwareName, 30))}</sum:NombreSistemaInformatico>`,
    `<sum:IdSistemaInformatico>${escapeXml(cleanText(fiscalConfig.softwareId, 2))}</sum:IdSistemaInformatico>`,
    `<sum:Version>${escapeXml(cleanText(fiscalConfig.softwareVersion, 50))}</sum:Version>`,
    `<sum:NumeroInstalacion>${escapeXml(cleanText(fiscalConfig.installationId, 100))}</sum:NumeroInstalacion>`,
    `<sum:TipoUsoPosibleSoloVerifactu>${toSiNo(fiscalConfig.onlyVerifactu, 'S')}</sum:TipoUsoPosibleSoloVerifactu>`,
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
    '<sum:RemisionVoluntaria>',
    '<sum:Incidencia>N</sum:Incidencia>',
    '</sum:RemisionVoluntaria>',
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

async function postSoapRequest(xml: string, pfx: Buffer, passphrase: string, endpointUrl: string) {
  const url = new URL(endpointUrl);

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
    ?? (lineStatus === 'Correcto' ? 'CORRECTO' : lineStatus)
    ?? globalStatus;
  const rawMessage = getTagValue(responseXml, 'DescripcionErrorRegistro');
  const message = rawMessage
    || (lineStatus === 'Correcto' ? 'Factura aceptada correctamente por la AEAT' : `${globalStatus}/${lineStatus}`);

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
  const fiscalConfig = await getEffectiveFiscalConfig(input.organisationId);
  const requestXml = buildSoapEnvelope(input, fiscalConfig);

  const certificate = await getFiscalCertificateBundle(input.organisationId);
  if (!certificate) {
    throw new Error('No hay certificado fiscal digital (.p12/.pfx) cargado en Administración > Fiscal para remitir a Hacienda');
  }

  const responseXml = await postSoapRequest(requestXml, certificate.fileBuffer, certificate.passphrase, fiscalConfig.endpointUrl);
  return parseSoapResponse(responseXml, requestXml);
}

export async function testAeatConnection(organisationId: number): Promise<{
  success: boolean;
  endpointUrl: string;
  environment: 'TEST' | 'PRODUCTION';
  certificateLabel: string | null;
  certificateFilename: string;
  message: string;
  httpStatus?: number;
  rawResponse?: string;
}> {
  const fiscalConfig = await getEffectiveFiscalConfig(organisationId);
  const certificate = await getFiscalCertificateBundle(organisationId);

  if (!certificate) {
    return {
      success: false,
      endpointUrl: fiscalConfig.endpointUrl,
      environment: fiscalConfig.environment,
      certificateLabel: null,
      certificateFilename: '',
      message: 'No hay certificado fiscal digital (.p12/.pfx) subido en el sistema. Debes cargar el certificado primero.',
    };
  }

  // Comprobar handshake TLS mTLS contra el endpoint de la AEAT con el certificado
  const probeEnvelope = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<soapenv:Envelope xmlns:soapenv="${SOAP_ENV_NS}" xmlns:sumLR="${SUMINISTRO_LR_NS}">`,
    '<soapenv:Header/>',
    '<soapenv:Body>',
    '<sumLR:RegFactuSistemaFacturacion>',
    '<sumLR:Cabecera>',
    '<sum:ObligadoEmision xmlns:sum="' + SUMINISTRO_INFO_NS + '">',
    '<sum:NombreRazon>TEST_CONNECTION</sum:NombreRazon>',
    '<sum:NIF>00000000T</sum:NIF>',
    '</sum:ObligadoEmision>',
    '<sum:RemisionVoluntaria xmlns:sum="' + SUMINISTRO_INFO_NS + '">',
    '<sum:Incidencia>N</sum:Incidencia>',
    '</sum:RemisionVoluntaria>',
    '</sumLR:Cabecera>',
    '</sumLR:RegFactuSistemaFacturacion>',
    '</soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('');

  try {
    const responseBody = await postSoapRequest(
      probeEnvelope,
      certificate.fileBuffer,
      certificate.passphrase,
      fiscalConfig.endpointUrl
    );

    return {
      success: true,
      endpointUrl: fiscalConfig.endpointUrl,
      environment: fiscalConfig.environment,
      certificateLabel: certificate.filename,
      certificateFilename: certificate.filename,
      message: 'Conexión mTLS con AEAT establecida con éxito. El certificado y el endpoint responden correctamente.',
      rawResponse: responseBody.slice(0, 500),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // Si la AEAT respondió HTTP 500 con un SOAP fault (ej. schema validation porque es un probe),
    // significa que el handshake TLS mTLS fue EXITOSO y el certificado es reconocido por la AEAT.
    if (errorMsg.includes('AEAT respondió HTTP') && (errorMsg.includes('fault') || errorMsg.includes('Fault') || errorMsg.includes('4102') || errorMsg.includes('schema'))) {
      return {
        success: true,
        endpointUrl: fiscalConfig.endpointUrl,
        environment: fiscalConfig.environment,
        certificateLabel: certificate.filename,
        certificateFilename: certificate.filename,
        message: 'Conexión mTLS con AEAT verificada con éxito. El servidor de Hacienda reconoció y aceptó el certificado digital.',
        rawResponse: errorMsg,
      };
    }

    return {
      success: false,
      endpointUrl: fiscalConfig.endpointUrl,
      environment: fiscalConfig.environment,
      certificateLabel: certificate.filename,
      certificateFilename: certificate.filename,
      message: `Fallo en la comunicación con la AEAT: ${errorMsg}`,
    };
  }
}

export function buildTicketBreakdown(items: Array<{
  quantity?: number;
  unitPrice?: Prisma.Decimal | number;
  vatRate: Prisma.Decimal | number;
  total?: number;
  subtotal?: number;
  vatAmount?: number;
}>) {
  const grouped = new Map<string, VerifactuTaxBreakdown>();

  for (const item of items) {
    const vatRate = parseFloat(item.vatRate.toString());
    let base = 0;
    let tax = 0;
    if (item.subtotal !== undefined && item.vatAmount !== undefined) {
      base = item.subtotal;
      tax = item.vatAmount;
    } else {
      const gross = (item.unitPrice ? parseFloat(item.unitPrice.toString()) : 0) * (item.quantity ?? 1);
      const divisor = 1 + (vatRate / 100);
      base = divisor > 0 ? gross / divisor : gross;
      tax = gross - base;
    }
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
