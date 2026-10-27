import axios from 'axios';
import type { User, Product, LicenseStatus, FiscalConfig, TicketSummary, Venue, Category, ProductPayload } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tavolo_company_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const companyAdminApi = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data as { token: string; user: User };
  },

  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data.data as User;
  },

  getVenues: async () => {
    const res = await api.get('/admin/venues');
    return res.data.data as Venue[];
  },

  getLicenseStatus: async () => {
    const res = await api.get('/licensing/status');
    return res.data.data as LicenseStatus;
  },

  activateLicense: async (code: string) => {
    const res = await api.post('/licensing/activate', { code });
    return res.data.data as LicenseStatus;
  },

  getProducts: async (venueId: number) => {
    const res = await api.get(`/admin/venues/${venueId}/products`);
    return res.data.data as Product[];
  },

  getCategories: async (venueId: number) => {
    const res = await api.get(`/admin/venues/${venueId}/categories`);
    return res.data.data as Category[];
  },

  createProduct: async (venueId: number, product: ProductPayload) => {
    const res = await api.post(`/admin/venues/${venueId}/products`, product);
    return res.data.data as Product;
  },

  updateProduct: async (id: number, product: Partial<ProductPayload>) => {
    const res = await api.put(`/admin/products/${id}`, product);
    return res.data.data as Product;
  },

  deleteProduct: async (id: number) => {
    await api.delete(`/admin/products/${id}`);
  },

  updateStock: async (id: number, stockQuantity: number, isStockControlEnabled: boolean) => {
    const res = await api.put(`/admin/products/${id}`, { stockQuantity, isStockControlEnabled });
    return res.data.data as Product;
  },

  getTickets: async (venueId: number) => {
    const res = await api.get(`/admin/venues/${venueId}/tickets`);
    return res.data.data as TicketSummary[];
  },

  getFiscalConfig: async () => {
    const res = await api.get('/fiscal/config');
    return res.data.data as FiscalConfig;
  },

  getQuarterlyReport: async (year?: number, quarter?: number) => {
    const res = await api.get('/admin/reports/quarterly', { params: { year, quarter } });
    return res.data.data as import('./pdfExport').QuarterlyReportData;
  },

  getCashClosures: async () => {
    const res = await api.get('/admin/cash-closures');
    return res.data as { data: import('./pdfExport').CashClosureItem[]; totals: { billedTotal: number; ticketCount: number } };
  },
};
