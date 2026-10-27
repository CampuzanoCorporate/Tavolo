export type Role = 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN';

export interface User {
  id: number;
  organisationId: number;
  venueId?: number;
  name: string;
  email: string;
  role: Role;
  pinCode?: string | null;
  isActive: boolean;
  venueUsers?: Array<{ venue: Venue }>;
}

export interface Venue {
  id: number;
  organisationId: number;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface Product {
  id: number;
  venueId: number;
  categoryId: number;
  name: string;
  description?: string | null;
  price: number;
  vatRate: number;
  stockQuantity: number;
  isStockControlEnabled: boolean;
  isAvailable: boolean;
  category?: { name: string };
}

export interface Category {
  id: number;
  venueId: number;
  name: string;
  color?: string | null;
  isActive: boolean;
}

export interface ProductPayload {
  name: string;
  description?: string | null;
  price: number;
  vatRate: number;
  categoryId: number;
  isAvailable: boolean;
  stockQuantity?: number;
  isStockControlEnabled?: boolean;
}

export interface LicenseStatus {
  canOperate: boolean;
  canWrite: boolean;
  effectiveState: 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'UNLICENSED';
  daysRemaining?: number;
  validUntil?: string;
  notes?: string;
}

export interface FiscalConfig {
  id: number;
  organisationId: number;
  environment: 'TEST' | 'PRODUCTION';
  developerName: string;
  developerNif?: string | null;
  softwareName: string;
  softwareVersion: string;
  onlyVerifactu: boolean;
}

export interface TicketSummary {
  id: number;
  invoiceCode: string;
  total: number;
  paymentMethod: string;
  aeatStatus: 'PENDING' | 'ACCEPTED' | 'ERROR' | 'REJECTED';
  aeatResponseMsg?: string | null;
  issuedAt: string;
}
