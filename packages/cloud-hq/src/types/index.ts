export type LicenseStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type EffectiveLicenseState = 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'UNLICENSED';

export interface LicenseRecord {
  id: number;
  organisationId?: number | null;
  code: string;
  label?: string | null;
  planType?: string;
  maxScreens?: number;
  hasKitchenDisplay?: boolean;
  status: LicenseStatus;
  validFrom: string;
  validUntil: string;
  graceDays: number;
  graceUntil: string;
  activatedAt?: string | null;
  lastValidatedAt?: string | null;
  lastSeenAt?: string | null;
  notes?: string | null;
}

export interface FiscalConfig {
  id: number;
  organisationId: number;
  environment: 'TEST' | 'PRODUCTION';
  customEndpointUrl: string | null;
  developerName: string;
  developerNif: string | null;
  softwareName: string;
  softwareId: string;
  softwareVersion: string;
  installationId: string;
  onlyVerifactu: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalConnectionTestResult {
  ok: boolean;
  message: string;
  httpStatus?: number;
  detail?: string;
}

export interface SuperAdminOrganisation {
  id: number;
  name: string;
  nif: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  venues: Array<{ id: number; name: string; slug: string; isActive: boolean }>;
  fiscalConfig: FiscalConfig | null;
  hasCertificate: boolean;
  certificateSummary: {
    id: number;
    label: string | null;
    originalFilename: string;
    fileSizeBytes: number;
    uploadedAt: string;
  } | null;
  activeLicense: (LicenseRecord & {
    evaluation?: {
      canOperate: boolean;
      canWrite: boolean;
      effectiveState: EffectiveLicenseState;
      reason?: string;
      daysRemaining?: number;
    };
  }) | null;
  billingStats?: {
    totalBilled: number;
    totalTickets: number;
    pendingAeatCount: number;
    errorAeatCount: number;
  };
  issueTickets?: Array<{
    id: number;
    invoiceCode: string;
    total: number;
    aeatStatus: string;
    aeatResponseMsg: string | null;
    issuedAt: string;
    venueName: string;
  }>;
}

export interface SuperAdminUser {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN';
  isActive: boolean;
  mustChangePassword: boolean;
  venueUsers: Array<{ venueId: number }>;
}

export interface SuperAdminVenueInput {
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  timezone?: string;
  invoiceSeries?: string;
  kitchenEnabled?: boolean;
  isActive?: boolean;
}

export interface VenueDetailData {
  venue: {
    id: number;
    name: string;
    slug: string;
    invoiceSeries: string;
    organisationName: string;
    organisationNif: string;
  };
  stats: {
    totalBilled: number;
    totalTickets: number;
    acceptedCount: number;
    pendingCount: number;
    errorCount: number;
  };
  tickets: Array<{
    id: number;
    invoiceCode: string;
    invoiceSeries: string;
    invoiceNumber: number;
    subtotal: number;
    vatAmount: number;
    total: number;
    paymentMethod: string;
    aeatStatus: string;
    aeatResponseMsg: string | null;
    hashSelf: string;
    issuedAt: string;
    isRectified: boolean;
  }>;
}
