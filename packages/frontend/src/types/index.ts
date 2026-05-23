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
export type OrderStatus = 'OPEN' | 'SENT_TO_KITCHEN' | 'READY' | 'CLOSED' | 'CANCELLED';
export type ProductType = 'NORMAL' | 'MENU';
export type MenuCourseTag = 'FIRST' | 'SECOND' | 'DESSERT' | 'COFFEE';
export type MenuFinalMode = 'DESSERT_ONLY' | 'DESSERT_OR_COFFEE' | 'DESSERT_AND_COFFEE';
export type ProductionItemStatus = 'PENDING' | 'IN_PROGRESS' | 'READY';

export interface Organisation {
  id: number;
  name: string;
  nif: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
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
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  organisation: { id: number; name: string; nif: string };
  venueUsers: Array<{ venue: Venue }>;
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

export interface CashSummaryTicket {
  id: number;
  invoiceCode: string;
  issuedAt: string;
  total: number | string;
}

export interface CashSummaryData {
  periodStart: string;
  periodEnd: string;
  ticketCount: number;
  billedTotal: number;
  tickets: CashSummaryTicket[];
}

export interface CashClosure {
  id: number;
  periodStart: string;
  periodEnd: string;
  ticketCount: number;
  billedTotal: number | string;
  notes?: string | null;
  createdAt: string;
  user: {
    id: number;
    name: string;
  };
}

// ── Impresoras ────────────────────────────────────────────────────────────────

export interface Printer {
  id: number;
  venueId: number;
  name: string;
  ipAddress: string;
  port: number;
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
