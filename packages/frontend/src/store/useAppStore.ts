/**
 * ============================================================
 * TAVOLO POS — Zustand Store v2 (Auth + Multi-sede)
 * ============================================================
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, CartItem, CartSummary, Category, LicenseStatusData, Order, Table, Venue } from '../types';

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  isAuthenticated: boolean;
  token: string | null;
  currentUser: AuthUser | null;
  availableVenueIds: number[];

  // ── Sede activa ───────────────────────────────────────────────────────────
  currentVenueId: number | null;
  currentVenue: Venue | null;

  // ── Conexión ──────────────────────────────────────────────────────────────
  isOnline: boolean;
  pendingOrdersCount: number;
  licenseStatus: LicenseStatusData | null;

  // ── Mesas ─────────────────────────────────────────────────────────────────
  tables: Table[];
  activeTable: Table | null;

  // ── POS ───────────────────────────────────────────────────────────────────
  categories: Category[];
  selectedCategoryId: number | null;
  cartItems: CartItem[];
  activeOrder: Order | null;
  selectedPrinterIp: string | null;
  selectedLocalPrinterName: string | null;

  // ── Acciones Auth ─────────────────────────────────────────────────────────
  login: (token: string, user: AuthUser, venueIds: number[]) => void;
  logout: () => void;

  // ── Acciones Sede ─────────────────────────────────────────────────────────
  setCurrentVenue: (venue: Venue) => void;

  // ── Acciones Estado ───────────────────────────────────────────────────────
  setIsOnline: (online: boolean) => void;
  setPendingOrdersCount: (count: number) => void;
  setLicenseStatus: (status: LicenseStatusData | null) => void;

  // ── Acciones Mesas ────────────────────────────────────────────────────────
  setTables: (tables: Table[]) => void;
  setActiveTable: (table: Table | null) => void;

  // ── Acciones POS ─────────────────────────────────────────────────────────
  setCategories: (categories: Category[]) => void;
  setSelectedCategoryId: (id: number | null) => void;
  setActiveOrder: (order: Order | null) => void;
  setSelectedPrinterIp: (ip: string | null) => void;
  setSelectedLocalPrinterName: (name: string | null) => void;

  // ── Carrito ───────────────────────────────────────────────────────────────
  addToCart: (item: Omit<CartItem, 'cartKey' | 'quantity'> & { quantity?: number; mergeKey?: string }) => void;
  updateQuantity: (cartKey: string, quantity: number) => void;
  removeFromCart: (cartKey: string) => void;
  updateNotes: (cartKey: string, notes: string) => void;
  clearCart: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Defaults
      isAuthenticated: false,
      token: null,
      currentUser: null,
      availableVenueIds: [],
      currentVenueId: null,
      currentVenue: null,
      isOnline: navigator.onLine,
      pendingOrdersCount: 0,
      licenseStatus: null,
      tables: [],
      activeTable: null,
      categories: [],
      selectedCategoryId: null,
      cartItems: [],
      activeOrder: null,
      selectedPrinterIp: null,
      selectedLocalPrinterName: null,

      // ── Auth ────────────────────────────────────────────────────────────
      login: (token, user, venueIds) => {
        localStorage.setItem('tavolo_token', token);
        set({
          isAuthenticated: true,
          token,
          currentUser: user,
          availableVenueIds: venueIds,
          // Si solo hay una sede, seleccionarla automáticamente
          currentVenueId: venueIds.length === 1 ? venueIds[0] : null,
        });
        if (venueIds.length === 1) {
          localStorage.setItem('tavolo_venue_id', String(venueIds[0]));
        }
      },

      logout: () => {
        localStorage.removeItem('tavolo_token');
        localStorage.removeItem('tavolo_venue_id');
        set({
          isAuthenticated: false,
          token: null,
          currentUser: null,
          availableVenueIds: [],
          currentVenueId: null,
          currentVenue: null,
          licenseStatus: null,
          tables: [],
          categories: [],
          cartItems: [],
          activeOrder: null,
          activeTable: null,
        });
      },

      // ── Sede ────────────────────────────────────────────────────────────
      setCurrentVenue: (venue) => {
        localStorage.setItem('tavolo_venue_id', String(venue.id));
        set({ currentVenueId: venue.id, currentVenue: venue });
      },

      // ── Estado ──────────────────────────────────────────────────────────
      setIsOnline:           (isOnline) => set({ isOnline }),
      setPendingOrdersCount: (pendingOrdersCount) => set({ pendingOrdersCount }),
      setLicenseStatus:      (licenseStatus) => set({ licenseStatus }),

      // ── Mesas ────────────────────────────────────────────────────────────
      setTables:     (tables) => set({ tables }),
      setActiveTable:(activeTable) => set({ activeTable }),

      // ── POS ──────────────────────────────────────────────────────────────
      setCategories:         (categories) => set({ categories }),
      setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
      setActiveOrder:        (activeOrder) => set({ activeOrder }),
      setSelectedPrinterIp:  (selectedPrinterIp) => set({ selectedPrinterIp }),
      setSelectedLocalPrinterName: (selectedLocalPrinterName) => set({ selectedLocalPrinterName }),

      // ── Carrito ─────────────────────────────────────────────────────────
      addToCart: (newItem) => {
        const items = get().cartItems;
        const mergeKey = newItem.mergeKey ?? `${newItem.productId}::${newItem.notes ?? ''}::${newItem.price}`;
        const existing = items.find((i) => !i.sent && `${i.productId}::${i.notes ?? ''}::${i.price}` === mergeKey);
        if (existing) {
          set({
            cartItems: items.map((i) => (
              i.cartKey === existing.cartKey
                ? { ...i, quantity: i.quantity + (newItem.quantity ?? 1) }
                : i
            )),
          });
        } else {
          set({
            cartItems: [
              ...items,
              {
                ...newItem,
                cartKey: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                quantity: newItem.quantity ?? 1,
                sent: false,
              },
            ],
          });
        }
      },

      updateQuantity: (cartKey, quantity) => {
        const items = get().cartItems;
        if (quantity <= 0) {
          set({ cartItems: items.filter((i) => !(i.cartKey === cartKey && !i.sent)) });
        } else {
          set({ cartItems: items.map((i) => (i.cartKey === cartKey && !i.sent) ? { ...i, quantity } : i) });
        }
      },

      removeFromCart: (cartKey) => {
        const items = get().cartItems;
        set({ cartItems: items.filter((i) => !(i.cartKey === cartKey && !i.sent)) });
      },

      updateNotes: (cartKey, notes) => {
        const items = get().cartItems;
        set({ cartItems: items.map((i) => (i.cartKey === cartKey && !i.sent) ? { ...i, notes } : i) });
      },

      clearCart: () => set({ cartItems: [] }),
    }),
    {
      name: 'tavolo-store-v2',
      partialize: (state) => ({
        // Solo persistir sesión, sede y carrito
        token:             state.token,
        currentUser:       state.currentUser,
        isAuthenticated:   state.isAuthenticated,
        availableVenueIds: state.availableVenueIds,
        currentVenueId:    state.currentVenueId,
        currentVenue:      state.currentVenue,
        cartItems:         state.cartItems,
        selectedPrinterIp: state.selectedPrinterIp,
        selectedLocalPrinterName: state.selectedLocalPrinterName,
      }),
    }
  )
);

/** Selector computado del carrito */
export const useCartSummary = (): CartSummary => {
  const items = useAppStore((s) => s.cartItems);
  const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const subtotal = items.reduce((sum, item) => {
    const gross = Number(item.price) * item.quantity;
    const divisor = 1 + (Number(item.vatRate) / 100);
    return sum + (divisor > 0 ? gross / divisor : gross);
  }, 0);
  const vatAmount = total - subtotal;

  return {
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal:  Math.round(subtotal  * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    total:     Math.round(total * 100) / 100,
  };
};
