/**
 * ============================================================
 * TAVOLO POS — Types v2 (Multi-sede + Auth)
 * ============================================================
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN';
export type TableStatus = 'FREE' | 'OCCUPIED' | 'ORDERING' | 'BILL_REQUESTED';
export type AeatStatus = 'PENDING' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'ERROR';
export type PrinterType = 'RECEIPT' | 'KITCHEN' | 'BAR';
export type PrinterConnectionType = 'NETWORK' | 'SYSTEM';
export type LocalPrinterMode = 'NONE' | 'QZ_TRAY';
export type OrderStatus = 'OPEN' | 'SENT_TO_KITCHEN' | 'READY' | 'CLOSED' | 'CANCELLED';
export type ProductType = 'NORMAL' | 'MENU';
export type MenuCourseTag = 'FIRST' | 'SECOND' | 'DESSERT' | 'COFFEE';
export type MenuFinalMode = 'DESSERT_ONLY' | 'DESSERT_OR_COFFEE' | 'DESSERT_AND_COFFEE';
export type ProductionItemStatus = 'PENDING' | 'IN_PROGRESS' | 'READY';
export type LicenseStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type EffectiveLicenseState = 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'UNLICENSED';
export type AppPermission =
  | 'VIEW_OWNER_DASHBOARD'
  | 'VIEW_FINANCIALS'
  | 'MANAGE_VENUES'
  | 'MANAGE_TABLES'
  | 'MANAGE_PRINTERS'
  | 'MANAGE_CATALOG'
  | 'MANAGE_USERS'
  | 'CLOSE_CASH'
  | 'OPEN_DRAWER'
  | 'SEND_KITCHEN_NOTE'
  | 'MERGE_TABLES'
  | 'EDIT_OPEN_ORDERS'
  | 'CANCEL_SENT_ITEMS'
  | 'REPRINT_TICKETS';

export interface Organisation {
  id: number;
  name: string;
  nif: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

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

export interface PreBillRawData {
  tableId: number;
  orderId: number;
  preview: string;
  rawBase64: string;
}

export interface Venue {
  id: number;
  organisationId: number;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  timezone: string;
  isActive: boolean;
  useOrgNif: boolean;
  nifOverride?: string;
  nameOverride?: string;
  invoiceSeries: string;
  kitchenEnabled: boolean;
}

export interface LicenseRecord {
  id: number;
  organisationId?: number | null;
  code: string;
  label?: string | null;
  status: LicenseStatus;
  validFrom: string;
  validUntil: string;
  graceDays: number;
  graceUntil: string;
  activatedAt?: string | null;
  lastValidatedAt?: string | null;
  lastSeenAt?: string | null;
  notes?: string | null;
  organisation?: { id: number; name: string; nif: string } | null;
}

export interface LicenseStatusData {
  effectiveState: EffectiveLicenseState;
  canWrite: boolean;
  reason: string;
  license: LicenseRecord | null;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  permissions: AppPermission[];
  organisation: { id: number; name: string; nif: string };
  venueUsers: Array<{ venue: Venue }>;
}

export interface OwnerDashboardMetrics {
  today: {
    billedTotal: number;
    ticketCount: number;
    avgTicket: number;
  };
  month: {
    billedTotal: number;
    ticketCount: number;
  };
  quarter: {
    year: number;
    quarter: number;
    billedTotal: number;
    ticketCount: number;
  };
  organisation: {
    billedTotal: number;
    venueCount: number;
  };
  hourlySales: Array<{ hour: number; total: number }>;
  venueTotals: Array<{ venueId: number; venueName: string; ticketCount: number; billedTotal: number }>;
  topProducts: Array<{ productName: string; quantity: number; revenue: number }>;
  fiscalCertificate: FiscalCertificateSummary | null;
  ticketLogo: TicketLogoSummary | null;
}

export interface FiscalCertificateSummary {
  id: number;
  organisationId: number;
  label: string | null;
  originalFilename: string;
  mimeType: string | null;
  fileSizeBytes: number;
  fileSha256: string;
  uploadedAt: string;
  updatedAt: string;
}

export interface QuarterlyReport {
  year: number;
  quarter: number;
  start: string;
  end: string;
  ticketCount: number;
  billedTotal: number;
  netTotal: number;
  vatAmount: number;
  monthlyBreakdown: Array<{
    label: string;
    billedTotal: number;
    ticketCount: number;
    vatAmount: number;
  }>;
  venueBreakdown: Array<{
    venueId: number;
    venueName: string;
    billedTotal: number;
    ticketCount: number;
    vatAmount: number;
  }>;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  venueIds: number[];
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  venueId: number;
  name: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  preparationStationId?: number | null;
  modifierGroups?: ModifierGroup[];
  products?: Product[];
}

export interface ModifierGroup {
  id: number;
  categoryId: number;
  name: string;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  isActive: boolean;
  options: ModifierOption[];
}

export interface ModifierOption {
  id: number;
  groupId: number;
  name: string;
  priceDelta: number;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  id: number;
  venueId: number;
  name: string;
  description?: string;
  price: number;
  vatRate: number;
  categoryId: number;
  productType: ProductType;
  menuCourseTags: MenuCourseTag[];
  menuConfig?: MenuConfig | null;
  preparationStationId?: number | null;
  isAvailable: boolean;
  sortOrder: number;
}

export interface ProductionStation {
  id: number;
  venueId: number;
  name: string;
  code?: string | null;
  printerId?: number | null;
  printer?: Printer | null;
  isActive: boolean;
  sortOrder: number;
}

export interface MenuConfig {
  includeFirst: boolean;
  includeSecond: boolean;
  finalMode: MenuFinalMode;
}

// ── Mesas ─────────────────────────────────────────────────────────────────────

export interface Table {
  id: number;
  venueId: number;
  number: number;
  name?: string;
  seats: number;
  zone?: string;
  status: TableStatus;
  posX: number;
  posY: number;
  objectType: string;
  width?: number;
  height?: number;
  activeOrderId?: number | null;
  activeOrderStatus?: OrderStatus | null;
  kitchenReady?: boolean;
}

// ── Pedidos ───────────────────────────────────────────────────────────────────

export interface CartItem {
  cartKey: string;
  productId: number;
  name: string;
  price: number;
  vatRate: number;
  quantity: number;
  notes?: string;
  displayNotes?: string;
  modifierSummary?: string;
  sent?: boolean;
  orderItemId?: number;
}

export interface CartSummary {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  vatAmount: number;
  total: number;
}

export interface Order {
  id: number;
  venueId: number;
  tableId: number;
  status: OrderStatus;
  items: OrderItem[];
}

export interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  notes?: string;
  product: Product;
}

export interface KitchenQueueItem {
  id: string;
  productionItemId: number;
  orderId: number;
  orderItemId: number;
  tableId: number;
  tableNumber: number;
  tableName?: string;
  waiterName: string;
  stationId?: number | null;
  stationName?: string;
  productName: string;
  quantity: number;
  description?: string;
  notes?: string;
  courseLabel?: string;
  sourceMenuName?: string;
  status: ProductionItemStatus;
  createdAt: string;
  readyAt?: string;
}

export interface KitchenQueueSummaryItem {
  productName: string;
  totalQuantity: number;
  tables: Array<{ tableNumber: number; quantity: number }>;
}

export interface TicketPreviewData {
  ticket: {
    id: number;
    invoiceCode: string;
    issuedAt: string;
    total: number | string;
    businessName: string;
    businessNif: string;
    businessAddress: string;
    qrBase64?: string | null;
  };
  preview: string;
}

export interface TicketRawData {
  ticket: {
    id: number;
    invoiceCode: string;
    issuedAt: string;
    total: number | string;
    businessName: string;
  };
  rawBase64: string;
  preview: string;
}

export interface CashSummaryTicket {
  id: number;
  invoiceCode: string;
  issuedAt: string;
  total: number | string;
}

export interface CashSummaryData {
  activeSession: {
    id: number;
    status: 'OPEN' | 'CLOSED';
    openedAt: string;
    openingAmount: number;
    openingNotes?: string | null;
    openedBy: {
      id: number;
      name: string;
    };
  } | null;
  periodStart: string;
  periodEnd: string;
  ticketCount: number;
  billedTotal: number;
  openingAmount: number;
  manualInTotal: number;
  manualOutTotal: number;
  cashSalesTotal: number;
  cardSalesTotal: number;
  vatTotal: number;
  expectedAmount: number;
  tickets: CashSummaryTicket[];
  movements: CashMovement[];
}

export interface CashMovement {
  id: number;
  type: 'OPENING' | 'CASH_IN' | 'CASH_OUT' | 'TICKET';
  amount: number;
  description?: string | null;
  createdAt: string;
  user: {
    id: number;
    name: string;
  };
  ticket?: {
    id: number;
    invoiceCode: string;
  } | null;
}

export interface CashClosure {
  id: number;
  sessionId?: number | null;
  periodStart: string;
  periodEnd: string;
  ticketCount: number;
  billedTotal: number | string;
  openingAmount: number | string;
  manualInTotal: number | string;
  manualOutTotal: number | string;
  cashSalesTotal?: number | string;
  cardSalesTotal?: number | string;
  vatTotal?: number | string;
  expectedAmount: number | string;
  countedAmount: number | string;
  discrepancyAmount: number | string;
  notes?: string | null;
  createdAt: string;
  user: {
    id: number;
    name: string;
  };
  preview?: string;
  rawBase64?: string;
}

// ── Impresoras ────────────────────────────────────────────────────────────────

export interface Printer {
  id: number;
  venueId: number;
  name: string;
  connectionType: PrinterConnectionType;
  ipAddress?: string | null;
  port?: number | null;
  systemName?: string | null;
  type: PrinterType;
  isActive: boolean;
}

// ── Offline ───────────────────────────────────────────────────────────────────

export interface PendingOrder {
  localId: string;
  tableId: number;
  tableNumber: number;
  userId: number;
  venueId: number;
  items: CartItem[];
  createdAt: string;
}
