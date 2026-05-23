"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_PERMISSIONS = void 0;
exports.normalizePermissions = normalizePermissions;
exports.getEffectivePermissions = getEffectivePermissions;
exports.hasPermission = hasPermission;
exports.APP_PERMISSIONS = [
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
];
const DEFAULT_ROLE_PERMISSIONS = {
    ADMIN: [...exports.APP_PERMISSIONS],
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
function normalizePermissions(values) {
    if (!values || values.length === 0)
        return [];
    return values.filter((value) => exports.APP_PERMISSIONS.includes(value));
}
function getEffectivePermissions(role, userPermissions) {
    if (role === 'ADMIN') {
        return [...exports.APP_PERMISSIONS];
    }
    const normalized = normalizePermissions(userPermissions);
    if (normalized.length > 0) {
        return normalized;
    }
    return DEFAULT_ROLE_PERMISSIONS[role];
}
function hasPermission(permissions, permission) {
    return Array.isArray(permissions) && permissions.includes(permission);
}
//# sourceMappingURL=permissions.js.map