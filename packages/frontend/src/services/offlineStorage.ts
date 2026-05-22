/**
 * ============================================================
 * TAVOLO POS — Almacenamiento Offline con Dexie (IndexedDB)
 * ============================================================
 *
 * Persiste comandas temporales localmente cuando el dispositivo
 * pierde conexión con el backend. Al recuperar la conexión,
 * el hook useOfflineSync sincroniza con el servidor.
 *
 * Datos persistidos offline:
 *   - pendingOrders: Pedidos creados sin conexión (items del carrito)
 *   - cachedTables: Último estado conocido de las mesas
 *   - cachedCategories: Catálogo de productos en caché
 * ============================================================
 */
import Dexie, { type Table } from 'dexie';
import type { CartItem, Category } from '../types';

// ─── ESQUEMA DE INDEXEDDB ────────────────────────────────────────────────────

export interface PendingOrder {
  id?: number;                  // Auto-generado por IndexedDB
  localId: string;              // UUID local para tracking
  tableId: number;
  tableNumber: number;
  userId: number;
  items: CartItem[];
  notes?: string;
  createdAt: string;            // ISO string
  syncStatus: 'PENDING' | 'SYNCING' | 'ERROR';
  syncError?: string;
}

export interface CachedTable {
  id: number;
  number: number;
  name?: string;
  seats: number;
  zone?: string;
  status: string;
}

class TavoloDB extends Dexie {
  pendingOrders!: Table<PendingOrder, number>;
  cachedTables!: Table<CachedTable, number>;
  cachedCategories!: Table<Category, number>;

  constructor() {
    super('TavoloPOS');

    this.version(1).stores({
      pendingOrders: '++id, localId, tableId, syncStatus, createdAt',
      cachedTables: 'id, number, status',
      cachedCategories: 'id, name',
    });
  }
}

export const db = new TavoloDB();

// ─── OPERACIONES ─────────────────────────────────────────────────────────────

/**
 * Guarda un pedido localmente cuando no hay conexión al backend.
 *
 * @param order - Datos del pedido a guardar offline
 * @returns ID local asignado por IndexedDB
 */
export async function saveOrderOffline(
  order: Omit<PendingOrder, 'id' | 'syncStatus'>
): Promise<number> {
  return db.pendingOrders.add({ ...order, syncStatus: 'PENDING' });
}

/**
 * Obtiene todos los pedidos pendientes de sincronizar.
 */
export async function getPendingOrders(): Promise<PendingOrder[]> {
  return db.pendingOrders.where('syncStatus').equals('PENDING').toArray();
}

/**
 * Actualiza el estado de sincronización de un pedido offline.
 */
export async function updateOrderSyncStatus(
  localId: string,
  status: PendingOrder['syncStatus'],
  error?: string
): Promise<void> {
  await db.pendingOrders.where('localId').equals(localId).modify({
    syncStatus: status,
    syncError: error,
  });
}

/**
 * Elimina un pedido offline una vez sincronizado con el backend.
 */
export async function removeSyncedOrder(localId: string): Promise<void> {
  await db.pendingOrders.where('localId').equals(localId).delete();
}

/**
 * Actualiza el caché local de mesas.
 */
export async function cacheTables(tables: CachedTable[]): Promise<void> {
  await db.cachedTables.bulkPut(tables);
}

/**
 * Obtiene las mesas del caché local (para modo offline).
 */
export async function getCachedTables(): Promise<CachedTable[]> {
  return db.cachedTables.orderBy('number').toArray();
}

/**
 * Actualiza el caché local del catálogo de productos.
 */
export async function cacheCategories(categories: Category[]): Promise<void> {
  await db.cachedCategories.bulkPut(categories);
}

/**
 * Obtiene el catálogo del caché local (para modo offline).
 */
export async function getCachedCategories(): Promise<Category[]> {
  return db.cachedCategories.orderBy('name').toArray();
}

/**
 * Cuenta los pedidos pendientes de sincronizar.
 * Útil para mostrar badge de "X comandas offline" al usuario.
 */
export async function countPendingOrders(): Promise<number> {
  return db.pendingOrders.where('syncStatus').equals('PENDING').count();
}
