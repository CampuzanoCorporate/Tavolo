import type { Role } from '@prisma/client';
export declare const APP_PERMISSIONS: readonly ["VIEW_OWNER_DASHBOARD", "VIEW_FINANCIALS", "MANAGE_VENUES", "MANAGE_TABLES", "MANAGE_PRINTERS", "MANAGE_CATALOG", "MANAGE_USERS", "CLOSE_CASH", "OPEN_DRAWER", "SEND_KITCHEN_NOTE", "MERGE_TABLES", "EDIT_OPEN_ORDERS", "CANCEL_SENT_ITEMS", "REPRINT_TICKETS"];
export type AppPermission = typeof APP_PERMISSIONS[number];
export declare function normalizePermissions(values?: string[] | null): AppPermission[];
export declare function getEffectivePermissions(role: Role, userPermissions?: string[] | null): AppPermission[];
export declare function hasPermission(permissions: string[] | undefined, permission: AppPermission): boolean;
//# sourceMappingURL=permissions.d.ts.map