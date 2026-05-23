import type { Role } from '@prisma/client';

export const APP_PERMISSIONS = [
  'VIEW_OWNER_DASHBOARD',
  'VIEW_FINANCIALS',
  'MANAGE_VENUES',
  'MANAGE_TABLES',
  'MANAGE_PRINTERS',
  'MANAGE_CATALOG',
  'MANAGE_USERS',
  'CLOSE_CASH',
  'OPEN_DRAWER',
  'SEND_KITCHEN_NOTE',
  'MERGE_TABLES',
  'EDIT_OPEN_ORDERS',
  'CANCEL_SENT_ITEMS',
  'REPRINT_TICKETS',
] as const;

export type AppPermission = typeof APP_PERMISSIONS[number];

const DEFAULT_ROLE_PERMISSIONS: Record<Role, AppPermission[]> = {
  ADMIN: [...APP_PERMISSIONS],
  MANAGER: [
    'VIEW_OWNER_DASHBOARD',
    'VIEW_FINANCIALS',
    'MANAGE_TABLES',
    'MANAGE_PRINTERS',
    'MANAGE_CATALOG',
    'CLOSE_CASH',
    'OPEN_DRAWER',
    'SEND_KITCHEN_NOTE',
    'MERGE_TABLES',
    'EDIT_OPEN_ORDERS',
    'CANCEL_SENT_ITEMS',
    'REPRINT_TICKETS',
  ],
  WAITER: [
    'OPEN_DRAWER',
    'SEND_KITCHEN_NOTE',
    'MERGE_TABLES',
    'EDIT_OPEN_ORDERS',
  ],
  KITCHEN: [],
};

export function normalizePermissions(values?: string[] | null): AppPermission[] {
  if (!values || values.length === 0) return [];
  return values.filter((value): value is AppPermission => APP_PERMISSIONS.includes(value as AppPermission));
}

export function getEffectivePermissions(role: Role, userPermissions?: string[] | null): AppPermission[] {
  if (role === 'ADMIN') {
    return [...APP_PERMISSIONS];
  }

  const normalized = normalizePermissions(userPermissions);
  if (normalized.length > 0) {
    return normalized;
  }

  return DEFAULT_ROLE_PERMISSIONS[role];
}

export function hasPermission(permissions: string[] | undefined, permission: AppPermission) {
  return Array.isArray(permissions) && permissions.includes(permission);
}
