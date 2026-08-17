/// <reference types="vite/client" />
/**
 * ============================================================
 * TAVOLO POS — API Client v2 (con Auth JWT + venueId)
 * ============================================================
 */
import axios from 'axios';
import type { AuthResponse, Category, Venue, Organisation, Printer, Table, Order, KitchenQueueItem, KitchenQueueSummaryItem, TicketPreviewData, CashClosure, CashSummaryData, ProductionStation, ProductionItemStatus, LicenseRecord, LicenseStatus, LicenseStatusData, OwnerDashboardMetrics, FiscalCertificateSummary, QuarterlyReport, TicketLogoSummary } from '../types';
import { useAppStore } from '../store/useAppStore';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const apiClient = axios.create({ baseURL: BASE_URL });

/** Inyecta JWT y X-Venue-Id en cada petición */
apiClient.interceptors.request.use((cfg) => {
  const token   = localStorage.getItem('tavolo_token');
  const venueId = localStorage.getItem('tavolo_venue_id');
  if (token)   cfg.headers.Authorization = `Bearer ${token}`;
  if (venueId) cfg.headers['X-Venue-Id'] = venueId;
  return cfg;
});

/** Si el token expira, redirigir a login */
apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    const isAuthLogin = err.config?.url?.includes('auth/login');
    if (err.response?.status === 401 && !isAuthLogin) {
      useAppStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login:   (email: string, password: string) =>
    apiClient.post<AuthResponse>('/api/auth/login', { email, password }).then((r) => r.data),
  me:      () => apiClient.get('/api/auth/me').then((r) => r.data.data),
};

// ── Tables ────────────────────────────────────────────────────────────────────
export const tablesApi = {
  getAll:        (venueId: number) =>
    apiClient.get<{ data: Table[] }>('/api/tables', { params: { venueId } }).then((r) => r.data.data),
  getById:       (id: number) =>
    apiClient.get<{ data: Table }>(`/api/tables/${id}`).then((r) => r.data.data),
  getByTable:    (tableId: number, venueId: number) =>
    apiClient.get<{ data: Order | null }>(`/api/orders/table/${tableId}`, { params: { venueId } }).then((r) => r.data.data),
  updateStatus:  (id: number, status: string) =>
    apiClient.patch(`/api/tables/${id}/status`, { status }).then((r) => r.data.data),
  requestBill:   (id: number) =>
    apiClient.patch(`/api/tables/${id}/request-bill`).then((r) => r.data.data),
  merge:         (data: { venueId: number; targetTableId: number; sourceTableIds: number[] }) =>
    apiClient.post('/api/tables/merge', data).then((r) => r.data.data),
};

// ── Products ──────────────────────────────────────────────────────────────────
export const productsApi = {
  getCategories: (venueId: number) =>
    apiClient.get<{ data: Category[] }>('/api/products', { params: { venueId } }).then((r) => r.data.data),
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const ordersApi = {
  create:      (data: { tableId: number; venueId: number; items: { productId: number; quantity: number; unitPrice?: number; notes?: string }[] }) =>
    apiClient.post<{ data: Order }>('/api/orders', data).then((r) => r.data.data),
  getByTable:  (tableId: number, venueId: number) =>
    apiClient.get<{ data: Order | null }>(`/api/orders/table/${tableId}`, { params: { venueId } }).then((r) => r.data.data),
  addItem:     (orderId: number, item: { productId: number; quantity: number; unitPrice?: number; notes?: string }) =>
    apiClient.post(`/api/orders/${orderId}/items`, item).then((r) => r.data.data),
  sendToKitchen: (orderId: number) =>
    apiClient.patch(`/api/orders/${orderId}/send-kitchen`).then((r) => r.data.data),
  cancelAndFree: (orderId: number) =>
    apiClient.patch(`/api/orders/${orderId}/cancel-and-free`).then((r) => r.data.data),
  sendKitchenNote: (data: { venueId: number; tableId?: number; reference?: string; message: string }) =>
    apiClient.post('/api/orders/kitchen-note', data).then((r) => r.data),
  getProductionStations: (venueId: number) =>
    apiClient.get<{ data: ProductionStation[] }>('/api/orders/production-stations', { params: { venueId } }).then((r) => r.data.data),
  getKitchenQueue: (venueId: number, stationId?: number) =>
    apiClient.get<{ data: { items: KitchenQueueItem[]; summary: KitchenQueueSummaryItem[] } }>('/api/orders/kitchen/queue', { params: { venueId, stationId } }).then((r) => r.data.data),
  updateProductionItemStatus: (itemId: number, status: ProductionItemStatus) =>
    apiClient.patch(`/api/orders/production-items/${itemId}/status`, { status }).then((r) => r.data.data),
  markKitchenReady: (orderId: number, stationId?: number) =>
    apiClient.patch(`/api/orders/${orderId}/kitchen-ready`, { stationId }).then((r) => r.data.data),
  getKitchenHistory: (venueId: number, stationId?: number) =>
    apiClient.get<{ data: KitchenQueueItem[] }>('/api/orders/kitchen/history', { params: { venueId, stationId } }).then((r) => r.data.data),
  getKitchenOrder: (orderId: number) =>
    apiClient.get<{ data: KitchenQueueItem[] }>(`/api/orders/kitchen/order/${orderId}`).then((r) => r.data.data),
};

// ── Tickets ───────────────────────────────────────────────────────────────────
export const ticketsApi = {
  close: (data: { orderId: number; venueId: number; printerIp?: string; printerPort?: number }) =>
    apiClient.post<{ data: { ticketId: number; invoiceCode: string; total: number; qrBase64?: string } }>
      ('/api/tickets/close', data).then((r) => r.data.data),
  closePartial: (data: {
    originalOrderId: number;
    venueId: number;
    items: Array<{ productId: number; quantity: number; unitPrice: number; vatRate: number; notes?: string | null }>;
    splitMode?: 'QUANTITY' | 'PRICE';
    printerIp?: string;
    printerPort?: number;
  }) =>
    apiClient.post<{ data: { ticketId: number; invoiceCode: string; total: number; qrBase64?: string } }>
      ('/api/tickets/close-partial', data).then((r) => r.data.data),
  getPreview: (ticketId: number) =>
    apiClient.get<{ data: TicketPreviewData }>(`/api/tickets/${ticketId}/preview`).then((r) => r.data.data),
  reprint: (ticketId: number) =>
    apiClient.post(`/api/tickets/${ticketId}/reprint`).then((r) => r.data.data),
  getCashSummary: (venueId: number) =>
    apiClient.get<{ data: CashSummaryData }>('/api/tickets/cash/summary', { params: { venueId } }).then((r) => r.data.data),
  openCash: (data: { venueId: number; openingAmount: number; notes?: string }) =>
    apiClient.post('/api/tickets/cash/open', data).then((r) => r.data.data),
  addCashMovement: (data: { venueId: number; type: 'CASH_IN' | 'CASH_OUT'; amount: number; description: string }) =>
    apiClient.post('/api/tickets/cash/movements', data).then((r) => r.data.data),
  closeCash: (data: { venueId: number; countedAmount: number; notes?: string }) =>
    apiClient.post('/api/tickets/cash/close', data).then((r) => r.data.data),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  // Organización
  getOrg:        () => apiClient.get<{ data: Organisation & { venues: Venue[] } }>('/api/admin/organisation').then((r) => r.data.data),
  updateOrg:     (data: Partial<Organisation>) => apiClient.put('/api/admin/organisation', data).then((r) => r.data.data),
  getOwnerMetrics: () => apiClient.get<{ data: OwnerDashboardMetrics }>('/api/admin/dashboard/owner-metrics').then((r) => r.data.data),
  getQuarterlyReport: (params?: { year?: number; quarter?: number; venueId?: number }) =>
    apiClient.get<{ data: QuarterlyReport }>('/api/admin/reports/quarterly', { params }).then((r) => r.data.data),
  getFiscalCertificate: () =>
    apiClient.get<{ data: FiscalCertificateSummary | null }>('/api/admin/fiscal/certificate').then((r) => r.data.data),
  saveFiscalCertificate: (data: { label?: string | null; filename: string; mimeType?: string | null; base64Content: string; passphrase: string }) =>
    apiClient.put<{ data: FiscalCertificateSummary }>('/api/admin/fiscal/certificate', data).then((r) => r.data.data),
  deleteFiscalCertificate: () =>
    apiClient.delete('/api/admin/fiscal/certificate').then((r) => r.data),
  getTicketLogo: () =>
    apiClient.get<{ data: TicketLogoSummary | null }>('/api/admin/branding/ticket-logo').then((r) => r.data.data),
  saveTicketLogo: (data: { label?: string | null; filename: string; mimeType?: string | null; pngBase64: string; width: number; height: number }) =>
    apiClient.put<{ data: TicketLogoSummary }>('/api/admin/branding/ticket-logo', data).then((r) => r.data.data),
  deleteTicketLogo: () =>
    apiClient.delete('/api/admin/branding/ticket-logo').then((r) => r.data),

  // Sedes
  getVenues:     () => apiClient.get<{ data: Venue[] }>('/api/admin/venues').then((r) => r.data.data),
  getVenue:      (id: number) => apiClient.get<{ data: Venue }>(`/api/admin/venues/${id}`).then((r) => r.data.data),
  createVenue:   (data: Partial<Venue>) => apiClient.post<{ data: Venue }>('/api/admin/venues', data).then((r) => r.data.data),
  updateVenue:   (id: number, data: Partial<Venue>) => apiClient.put(`/api/admin/venues/${id}`, data).then((r) => r.data.data),
  deleteVenue:   (id: number) => apiClient.delete(`/api/admin/venues/${id}`).then((r) => r.data),

  // Categorías
  getCategories: (venueId: number) => apiClient.get(`/api/admin/venues/${venueId}/categories`).then((r) => r.data.data),
  createCategory:(venueId: number, data: unknown) => apiClient.post(`/api/admin/venues/${venueId}/categories`, data).then((r) => r.data.data),
  updateCategory:(id: number, data: unknown) => apiClient.put(`/api/admin/categories/${id}`, data).then((r) => r.data.data),
  deleteCategory:(id: number) => apiClient.delete(`/api/admin/categories/${id}`).then((r) => r.data),

  // Productos
  getProducts:   (venueId: number) => apiClient.get(`/api/admin/venues/${venueId}/products`).then((r) => r.data.data),
  createProduct: (venueId: number, data: unknown) => apiClient.post(`/api/admin/venues/${venueId}/products`, data).then((r) => r.data.data),
  updateProduct: (id: number, data: unknown) => apiClient.put(`/api/admin/products/${id}`, data).then((r) => r.data.data),
  deleteProduct: (id: number) => apiClient.delete(`/api/admin/products/${id}`).then((r) => r.data),

  // Mesas
  getTables:     (venueId: number) => apiClient.get<{ data: Table[] }>(`/api/admin/venues/${venueId}/tables`).then((r) => r.data.data),
  createTable:   (venueId: number, data: Partial<Table>) => apiClient.post(`/api/admin/venues/${venueId}/tables`, data).then((r) => r.data.data),
  updateTable:   (id: number, data: Partial<Table>) => apiClient.put(`/api/admin/tables/${id}`, data).then((r) => r.data.data),
  deleteTable:   (id: number) => apiClient.delete(`/api/admin/tables/${id}`).then((r) => r.data),

  // Impresoras
  getPrinters:   (venueId: number) => apiClient.get<{ data: Printer[] }>(`/api/admin/venues/${venueId}/printers`).then((r) => r.data.data),
  createPrinter: (venueId: number, data: Partial<Printer>) => apiClient.post(`/api/admin/venues/${venueId}/printers`, data).then((r) => r.data.data),
  updatePrinter: (id: number, data: Partial<Printer>) => apiClient.put(`/api/admin/printers/${id}`, data).then((r) => r.data.data),
  deletePrinter: (id: number) => apiClient.delete(`/api/admin/printers/${id}`).then((r) => r.data),

  // Secciones de producción
  getProductionStations: (venueId: number) =>
    apiClient.get<{ data: ProductionStation[] }>(`/api/admin/venues/${venueId}/production-stations`).then((r) => r.data.data),
  createProductionStation: (venueId: number, data: Partial<ProductionStation>) =>
    apiClient.post(`/api/admin/venues/${venueId}/production-stations`, data).then((r) => r.data.data),
  updateProductionStation: (id: number, data: Partial<ProductionStation>) =>
    apiClient.put(`/api/admin/production-stations/${id}`, data).then((r) => r.data.data),
  deleteProductionStation: (id: number) =>
    apiClient.delete(`/api/admin/production-stations/${id}`).then((r) => r.data),

  // Usuarios
  getUsers:      () => apiClient.get('/api/admin/users').then((r) => r.data.data),
  createUser:    (data: unknown) => apiClient.post('/api/admin/users', data).then((r) => r.data.data),
  updateUser:    (id: number, data: unknown) => apiClient.put(`/api/admin/users/${id}`, data).then((r) => r.data),

  // Tickets
  getTickets:    (venueId: number, params?: { limit?: number; offset?: number; aeatStatus?: string }) =>
    apiClient.get(`/api/admin/venues/${venueId}/tickets`, { params }).then((r) => r.data),
  getCashClosures: (venueId: number) =>
    apiClient.get<{ data: CashClosure[]; totals: { billedTotal: number; ticketCount: number } }>(`/api/admin/venues/${venueId}/cash-closures`).then((r) => r.data),
};

export const printersApi = {
  openDrawer: (venueId: number) =>
    apiClient.post('/api/printers/open-drawer', { venueId }).then((r) => r.data),
  getPreviewSamples: (venueId: number) =>
    apiClient.get('/api/printers/preview-samples', { params: { venueId } }).then((r) => r.data.data),
  getSystemPrinters: () =>
    apiClient.get<{ data: string[] }>('/api/printers/system').then((r) => r.data.data),
};

export const licensingApi = {
  getStatus: () =>
    apiClient.get<{ data: LicenseStatusData }>('/api/licensing/status').then((r) => r.data.data),
  getCurrent: () =>
    apiClient.get<{ data: LicenseStatusData }>('/api/licensing/current').then((r) => r.data.data),
  activate: (code: string) =>
    apiClient.post<{ data: LicenseStatusData }>('/api/licensing/activate', { code }).then((r) => r.data.data),
  getLicenseCenterList: (masterKey: string) =>
    apiClient.get<{ data: LicenseRecord[] }>('/api/licensing/center/licenses', {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),
  generateLicense: (masterKey: string, data: { organisationId?: number; label?: string; validityDays?: number; graceDays?: number; notes?: string }) =>
    apiClient.post<{ data: LicenseRecord }>('/api/licensing/center/licenses/generate', data, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),
  refreshLicense: (masterKey: string, id: number, validityDays?: number) =>
    apiClient.post<{ data: LicenseRecord }>(`/api/licensing/center/licenses/${id}/refresh`, { validityDays }, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),
  updateLicenseStatus: (masterKey: string, id: number, status: LicenseStatus) =>
    apiClient.patch<{ data: LicenseRecord }>(`/api/licensing/center/licenses/${id}/status`, { status }, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),
};
