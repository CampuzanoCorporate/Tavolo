/// <reference types="vite/client" />
import axios from 'axios';
import type { SuperAdminOrganisation, LicenseRecord, LicenseStatus, FiscalConfig, FiscalConnectionTestResult, SuperAdminUser, SuperAdminVenueInput } from '../types';

const rawUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const BASE_URL = rawUrl.replace(/\/api\/?$/, '');

export const cloudClient = axios.create({ baseURL: BASE_URL });

export const cloudApi = {
  loginCloudHQ: (email: string, password: string, masterKey: string, reset2FA?: boolean) =>
    cloudClient.post<{ data: { requires2FA: boolean; isSetupRequired: boolean; challengeToken: string; qrCodeUrl?: string; secret?: string } }>('/api/cloud-hq/auth/login', {
      email,
      password,
      masterKey,
      reset2FA,
    }).then((r) => r.data.data),

  setup2FA: (challengeToken: string, confirmCode: string) =>
    cloudClient.post<{ data: { success: boolean; masterKey: string; email: string } }>('/api/cloud-hq/auth/setup-2fa', {
      challengeToken,
      confirmCode,
    }).then((r) => r.data.data),

  verify2FA: (challengeToken: string, code: string) =>
    cloudClient.post<{ data: { success: boolean; masterKey: string; email: string } }>('/api/cloud-hq/auth/verify-2fa', {
      challengeToken,
      code,
    }).then((r) => r.data.data),
  getOrganisations: (masterKey: string) =>
    cloudClient.get<{ data: SuperAdminOrganisation[] }>('/api/licensing/center/organisations', {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  provisionOrganisation: (masterKey: string, data: { name: string; nif: string; email: string; provisionalPassword: string; venueName?: string; planType?: string; maxScreens?: number; hasKitchenDisplay?: boolean }) =>
    cloudClient.post<{ data: any }>('/api/licensing/center/organisations/provision', data, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  updateOrganisationStatus: (masterKey: string, id: number, isActive: boolean) =>
    cloudClient.patch<{ data: any }>(`/api/licensing/center/organisations/${id}/status`, { isActive }, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  updateOrganisation: (masterKey: string, id: number, data: Pick<SuperAdminOrganisation, 'name' | 'nif' | 'address' | 'phone' | 'email'>) =>
    cloudClient.put(`/api/licensing/center/organisations/${id}`, data, { headers: { 'X-License-Master-Key': masterKey } }).then((r) => r.data.data),

  createVenue: (masterKey: string, organisationId: number, data: SuperAdminVenueInput) =>
    cloudClient.post(`/api/licensing/center/organisations/${organisationId}/venues`, data, { headers: { 'X-License-Master-Key': masterKey } }).then((r) => r.data.data),

  updateVenue: (masterKey: string, venueId: number, data: Partial<SuperAdminVenueInput>) =>
    cloudClient.put(`/api/licensing/center/venues/${venueId}`, data, { headers: { 'X-License-Master-Key': masterKey } }).then((r) => r.data.data),

  getOrganisationUsers: (masterKey: string, organisationId: number) =>
    cloudClient.get<{ data: SuperAdminUser[] }>(`/api/licensing/center/organisations/${organisationId}/users`, { headers: { 'X-License-Master-Key': masterKey } }).then((r) => r.data.data),

  createOrganisationUser: (masterKey: string, organisationId: number, data: Omit<SuperAdminUser, 'id' | 'mustChangePassword' | 'venueUsers'> & { password: string; venueIds: number[] }) =>
    cloudClient.post(`/api/licensing/center/organisations/${organisationId}/users`, data, { headers: { 'X-License-Master-Key': masterKey } }).then((r) => r.data.data),

  updateOrganisationUser: (masterKey: string, userId: number, data: Partial<Omit<SuperAdminUser, 'id' | 'mustChangePassword' | 'venueUsers'>> & { venueIds?: number[] }) =>
    cloudClient.put(`/api/licensing/center/users/${userId}`, data, { headers: { 'X-License-Master-Key': masterKey } }).then((r) => r.data.data),

  resetOrganisationUserPassword: (masterKey: string, userId: number, password: string) =>
    cloudClient.post(`/api/licensing/center/users/${userId}/reset-password`, { password }, { headers: { 'X-License-Master-Key': masterKey } }).then((r) => r.data.data),

  getLicenses: (masterKey: string) =>
    cloudClient.get<{ data: LicenseRecord[] }>('/api/licensing/center/licenses', {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  generateLicense: (masterKey: string, data: { organisationId?: number; label?: string; planType?: string; maxScreens?: number; hasKitchenDisplay?: boolean; validityDays?: number; graceDays?: number; notes?: string }) =>
    cloudClient.post<{ data: LicenseRecord }>('/api/licensing/center/licenses/generate', data, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  refreshLicense: (masterKey: string, id: number, validityDays?: number) =>
    cloudClient.post<{ data: LicenseRecord }>(`/api/licensing/center/licenses/${id}/refresh`, { validityDays }, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  updateLicenseStatus: (masterKey: string, id: number, status: LicenseStatus) =>
    cloudClient.patch<{ data: LicenseRecord }>(`/api/licensing/center/licenses/${id}/status`, { status }, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  updateOrgFiscalConfig: (masterKey: string, organisationId: number, data: Partial<Omit<FiscalConfig, 'id' | 'organisationId' | 'createdAt' | 'updatedAt'>>) =>
    cloudClient.put<{ data: FiscalConfig }>(`/api/licensing/center/organisations/${organisationId}/fiscal`, data, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  testOrgAeatConnection: (masterKey: string, organisationId: number) =>
    cloudClient.post<{ data: FiscalConnectionTestResult }>(`/api/licensing/center/organisations/${organisationId}/test-aeat`, {}, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),

  getVenueTickets: (masterKey: string, venueId: number) =>
    cloudClient.get<{ data: import('../types').VenueDetailData }>(`/api/licensing/center/venues/${venueId}/tickets`, {
      headers: { 'X-License-Master-Key': masterKey },
    }).then((r) => r.data.data),
};
