/**
 * TAVOLO POS — Página Pantalla de Venta (POS)
 * Layout de 3 columnas: Categorías | Productos | Carrito
 */
/// <reference types="vite/client" />
import { useEffect, useState, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore, useCartSummary } from '../store/useAppStore';
import { productsApi, ordersApi, ticketsApi, tablesApi, apiClient, printersApi } from '../services/api';
import { cacheCategories, getCachedCategories, saveOrderOffline } from '../services/offlineStorage';
import { ensureQzTrayConnection, listQzTrayPrinters, printRawBase64WithQzTray } from '../services/qzTray';
import { CategorySidebar } from '../components/pos/CategorySidebar';
import { ProductGrid } from '../components/pos/ProductGrid';
import { Cart } from '../components/pos/Cart';
import { ProductConfiguratorModal } from '../components/pos/ProductConfiguratorModal';
import { KitchenNoteModal } from '../components/pos/KitchenNoteModal';
import { MenuConfiguratorModal } from '../components/pos/MenuConfiguratorModal';
import { MenuCoursePickerModal } from '../components/pos/MenuCoursePickerModal';
import { MenuSendPromptModal } from '../components/pos/MenuSendPromptModal';
import { PaymentModal } from '../components/pos/PaymentModal';
import { SplitBillModal } from '../components/pos/SplitBillModal';
import type { CartItem, Category, MenuCourseTag, Product } from '../types';
import { decodeMenuSelection, getProductCourseTag, getVisibleNotes } from '../utils/menuSelection';
import axios from 'axios';

function getCategoryAccent(category?: Category | null) {
  if (category?.color) return category.color;

  const categoryName = category?.name.toLowerCase() ?? '';

  if (/(bebida|vino|cerveza|refresco|cocktail|coctel|cafe|té|te)/.test(categoryName)) {
    return '#2563EB';
  }

  if (/(carne|parrilla|hamburguesa|ib[eé]rico|pollo)/.test(categoryName)) {
    return '#92400E';
  }

  if (/(postre|dulce|tarta|helado|desayuno)/.test(categoryName)) {
    return '#A21CAF';
  }

  return '#0F172A';
}

const FAVORITES_CATEGORY_ID = -999;

function getFavoritesStorageKey(venueId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return `tavolo-favorites-${venueId}-${today}`;
}

function readFavoriteCounts(venueId: number) {
  try {
    const raw = localStorage.getItem(getFavoritesStorageKey(venueId));
    if (!raw) return {} as Record<number, number>;
    return JSON.parse(raw) as Record<number, number>;
  } catch {
    return {} as Record<number, number>;
  }
}

function storeFavoriteCounts(venueId: number, counts: Record<number, number>) {
  localStorage.setItem(getFavoritesStorageKey(venueId), JSON.stringify(counts));
}

export function POSPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();

  const {
    activeTable,
    tables,
    setTables,
    setActiveTable,
    activeOrder,
    setActiveOrder,
    categories,
    setCategories,
    selectedCategoryId,
    setSelectedCategoryId,
    cartItems,
    addToCart,
    clearCart,
    currentUser,
    isOnline,
    selectedPrinterIp,
    selectedLocalPrinterName,
    setSelectedLocalPrinterName,
    currentVenueId,
    currentVenue,
  } = useAppStore();

  const cartSummary = useCartSummary();
  const [isClosingTicket, setIsClosingTicket] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSplitBillModalOpen, setIsSplitBillModalOpen] = useState(false);
  const [splitBillSelection, setSplitBillSelection] = useState<Array<{
    productId: number;
    quantity: number;
    notes?: string | null;
    unitPrice: number;
    vatRate: number;
    name: string;
  }> | null>(null);
  const [splitBillMode, setSplitBillMode] = useState<'QUANTITY' | 'PRICE'>('QUANTITY');
  const [splitPeopleTotalCount, setSplitPeopleTotalCount] = useState<number>(0);
  const [splitPeopleRemaining, setSplitPeopleRemaining] = useState<number>(0);
  const [lastSplitPayment, setLastSplitPayment] = useState<{
    invoiceCode: string;
    total: number;
    change?: number;
  } | null>(null);
  const paymentTotal = useMemo(() => {
    if (splitBillSelection) {
      return splitBillSelection.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
    }
    return Number(cartSummary.total);
  }, [splitBillSelection, cartSummary.total]);
  const [closedTicket, setClosedTicket] = useState<{
    invoiceCode: string;
    total: number;
    qrBase64?: string;
    isPartial?: boolean;
  } | null>(null);
  const [configuringProduct, setConfiguringProduct] = useState<Product | null>(null);
  const [configuringMenuProduct, setConfiguringMenuProduct] = useState<Product | null>(null);
  const [menuCourseRequest, setMenuCourseRequest] = useState<{
    item: CartItem;
    course: MenuCourseTag;
    allowedTags: MenuCourseTag[];
    title: string;
  } | null>(null);
  const [menuSendPromptItems, setMenuSendPromptItems] = useState<CartItem[]>([]);
  const [isKitchenNoteModalOpen, setIsKitchenNoteModalOpen] = useState(false);
  const [isSendingKitchenNote, setIsSendingKitchenNote] = useState(false);
  const [isOpenTablesModalOpen, setIsOpenTablesModalOpen] = useState(false);
  const [favoriteCategory, setFavoriteCategory] = useState<Category | null>(null);
  const [availableLocalPrinters, setAvailableLocalPrinters] = useState<string[]>([]);
  const [isQzTrayReady, setIsQzTrayReady] = useState(false);
  const [isLoadingLocalPrinters, setIsLoadingLocalPrinters] = useState(false);

  // Vista activa en móvil/tablet pequeña: 'catalog' o 'ticket'
  const [mobileView, setMobileView] = useState<'catalog' | 'ticket'>('catalog');

  // ── Cargar catálogo de productos ────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    const venueId = currentVenueId ?? parseInt(localStorage.getItem('tavolo_venue_id') ?? '0', 10);
    if (!venueId) return;

    if (!isOnline) {
      const cached = await getCachedCategories();
      if (cached.length > 0) {
        setCategories(cached);
        if (!selectedCategoryId && cached[0]) setSelectedCategoryId(cached[0].id);
      }
      return;
    }

    try {
      const data = await productsApi.getCategories(venueId);
      setCategories(data);
      await cacheCategories(data);
      if (!selectedCategoryId && data[0]) setSelectedCategoryId(data[0].id);
    } catch {
      const cached = await getCachedCategories();
      if (cached.length > 0) setCategories(cached);
      toast.error('Error cargando productos. Usando caché.');
    }
  }, [isOnline, setCategories, setSelectedCategoryId, selectedCategoryId, currentVenueId]);

  // ── Cargar pedido activo de la mesa ─────────────────────────────────────
  const loadActiveOrder = useCallback(async () => {
    if (!tableId || !isOnline) return;
    const venueId = currentVenueId ?? parseInt(localStorage.getItem('tavolo_venue_id') ?? '0', 10);
    if (!venueId) return;

    try {
      const order = await ordersApi.getByTable(parseInt(tableId, 10), venueId);
      setActiveOrder(order);
      if (order && order.items) {
        const activeItems = order.items.map((oi) => ({
          cartKey: `sent-${oi.id}`,
          productId: oi.productId,
          name: oi.product.name,
          price: Number(oi.unitPrice),
          vatRate: Number(oi.vatRate),
          quantity: oi.quantity,
          notes: oi.notes || undefined,
          displayNotes: getVisibleNotes(oi.notes),
          modifierSummary: getVisibleNotes(oi.notes),
          sent: true,
          orderItemId: oi.id,
        }));
        
        // Conservar los items pendientes (sent !== true) que ya pudiera tener el usuario clicados
        const pendingItems = useAppStore.getState().cartItems.filter(i => !i.sent);
        useAppStore.setState({ cartItems: [...activeItems, ...pendingItems] });
      } else {
        const pendingItems = useAppStore.getState().cartItems.filter(i => !i.sent);
        useAppStore.setState({ cartItems: pendingItems });
      }
    } catch {
      // No crítico — puede no haber pedido activo aún
    }
  }, [tableId, isOnline, setActiveOrder, currentVenueId]);

  // ── Cargar mesa si activeTable es null o no coincide ─────────────────────
  const loadTableDetails = useCallback(async () => {
    if (!tableId) return;
    const tid = parseInt(tableId, 10);
    if (!activeTable || activeTable.id !== tid) {
      try {
        const table = await tablesApi.getById(tid);
        setActiveTable(table);
      } catch (err) {
        console.error('[POS] Error cargando mesa:', err);
        // Si no está online o falla, usar mesa placeholder
        if (!activeTable) {
          setActiveTable({
            id: tid,
            venueId: currentVenueId ?? parseInt(localStorage.getItem('tavolo_venue_id') ?? '0', 10),
            number: tid,
            seats: 4,
            zone: 'General',
            status: 'FREE',
            posX: 50,
            posY: 50,
            objectType: 'TABLE'
          });
        }
      }
    }
  }, [tableId, activeTable, setActiveTable, currentVenueId]);

  useEffect(() => {
    loadTableDetails();
    loadCategories();
    loadActiveOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, currentVenueId]);

  // ── Productos de la categoría seleccionada ───────────────────────────────
  const displayedCategories = useMemo(() => (
    favoriteCategory ? [favoriteCategory, ...categories] : categories
  ), [categories, favoriteCategory]);

  const selectedCategory = displayedCategories.find((c) => c.id === selectedCategoryId)
    ?? displayedCategories.find((c) => c.id !== FAVORITES_CATEGORY_ID)
    ?? null;
  const products: Product[] = selectedCategory?.products ?? [];
  const allCatalogProducts = categories.flatMap((category) => category.products ?? []);
  const selectedCategoryAccent = getCategoryAccent(selectedCategory);

  const refreshFavoriteCategory = useCallback(() => {
    if (!currentVenueId || categories.length === 0) return;
    const counts = readFavoriteCounts(currentVenueId);
    const topProducts = Object.entries(counts)
      .map(([productId, count]) => ({
        product: allCatalogProducts.find((item) => item.id === Number(productId)),
        count,
      }))
      .filter((entry): entry is { product: Product; count: number } => Boolean(entry.product))
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 8)
      .map((entry) => entry.product);

    if (topProducts.length === 0) {
      setFavoriteCategory(null);
      return;
    }

    setFavoriteCategory({
      id: FAVORITES_CATEGORY_ID,
      venueId: currentVenueId,
      name: 'Favoritos',
      color: '#9A6B3F',
      icon: '',
      sortOrder: -1,
      isActive: true,
      products: topProducts,
    });
  }, [allCatalogProducts, categories, currentVenueId]);

  useEffect(() => {
    refreshFavoriteCategory();
  }, [refreshFavoriteCategory]);

  const loadLocalPrinters = useCallback(async () => {
    try {
      setIsLoadingLocalPrinters(true);
      await ensureQzTrayConnection();
      const printers = await listQzTrayPrinters();
      setAvailableLocalPrinters(printers);
      setIsQzTrayReady(true);

      if (selectedLocalPrinterName && !printers.includes(selectedLocalPrinterName)) {
        setSelectedLocalPrinterName(null);
      }

      if (!selectedLocalPrinterName && printers.length === 1) {
        setSelectedLocalPrinterName(printers[0]);
      }
    } catch (error) {
      console.error('[POS] Error cargando impresoras locales:', error);
      setIsQzTrayReady(false);
      setAvailableLocalPrinters([]);
    } finally {
      setIsLoadingLocalPrinters(false);
    }
  }, [selectedLocalPrinterName, setSelectedLocalPrinterName]);

  useEffect(() => {
    if (isPaymentModalOpen) {
      void loadLocalPrinters();
    }
  }, [isPaymentModalOpen, loadLocalPrinters]);

  const handleLocalTicketPrint = useCallback(async (ticketId: number) => {
    if (!selectedLocalPrinterName) return false;

    const rawTicket = await ticketsApi.getRaw(ticketId);
    await printRawBase64WithQzTray(selectedLocalPrinterName, rawTicket.rawBase64);
    return true;
  }, [selectedLocalPrinterName]);

  const handleLocalPreBillPrint = useCallback(async (tableIdToPrint: number) => {
    if (!selectedLocalPrinterName) return false;

    const rawPreBill = await ticketsApi.getPreBillRaw(tableIdToPrint);
    await printRawBase64WithQzTray(selectedLocalPrinterName, rawPreBill.rawBase64);
    return true;
  }, [selectedLocalPrinterName]);

  // ── Añadir producto al carrito ───────────────────────────────────────────
  const addConfiguredProductToCart = async (product: Product, payload?: { price?: number; notes?: string; displayNotes?: string; modifierSummary?: string }) => {
    addToCart({
      productId: product.id,
      name: product.name,
      price: payload?.price ?? product.price,
      vatRate: product.vatRate,
      quantity: 1,
      notes: payload?.notes,
      displayNotes: payload?.displayNotes ?? payload?.modifierSummary,
      modifierSummary: payload?.modifierSummary,
      mergeKey: `${product.id}::${payload?.notes ?? ''}::${payload?.price ?? product.price}`,
    });

    toast.success(`${product.name} añadido`, { duration: 800 });

    if (activeTable && activeTable.status === 'FREE') {
      try {
        const updatedTable = await tablesApi.updateStatus(activeTable.id, 'OCCUPIED');
        setActiveTable(updatedTable);
        setTables(tables.map((table) => (
          table.id === updatedTable.id ? updatedTable : table
        )));
      } catch (err) {
        console.error('[POS] Error al ocupar mesa:', err);
      }
    }
  };

  const handleProductClick = async (product: Product) => {
    if (product.productType === 'MENU' && product.menuConfig) {
      setConfiguringMenuProduct(product);
      return;
    }

    if (selectedCategory?.modifierGroups && selectedCategory.modifierGroups.length > 0) {
      setConfiguringProduct(product);
      return;
    }

    await addConfiguredProductToCart(product);
  };

  // ── Cancelar item enviado a cocina ───────────────────────────────────────
  const handleCancelSentItem = async (_productId: number, orderItemId: number, quantityToCancel: number) => {
    if (!activeOrder) return;
    try {
      await apiClient.post(`/api/orders/${activeOrder.id}/items/${orderItemId}/cancel`, { quantity: quantityToCancel });
      toast.success('Artículo cancelado en cocina');
      await loadActiveOrder();
    } catch (err) {
      console.error('[POS] Error al cancelar artículo:', err);
      toast.error('Error al cancelar artículo');
    }
  };

  // ── Cancelar pedido completo y liberar mesa sin mandar comanda a cocina ────
  const handleCancelAndFreeTable = async () => {
    try {
      if (activeOrder) {
        await ordersApi.cancelAndFree(activeOrder.id);
        toast.success('Mesa liberada y ticket anulado');
      } else if (activeTable) {
        if (activeTable.status !== 'FREE') {
          await tablesApi.updateStatus(activeTable.id, 'FREE');
        }
        toast.success('Mesa liberada');
      }
      clearCart();
      setActiveOrder(null);
      if (activeTable) {
        const freedTable = { ...activeTable, status: 'FREE' as const };
        setActiveTable(freedTable);
        setTables(tables.map((table) => (
          table.id === freedTable.id ? freedTable : table
        )));
      }
      navigate('/');
    } catch (err) {
      console.error('[POS] Error al liberar mesa:', err);
      toast.error('Error al liberar la mesa');
    }
  };

  const handleSendKitchenNote = async ({ tableId, message }: { tableId: number; message: string }) => {
    if (!currentVenueId) {
      toast.error('No hay sede activa');
      return;
    }

    try {
      setIsSendingKitchenNote(true);
      await ordersApi.sendKitchenNote({
        venueId: currentVenueId,
        tableId,
        message,
      });
      toast.success('Aviso enviado a cocina');
      setIsKitchenNoteModalOpen(false);
    } catch (error) {
      console.error('[POS] Error enviando aviso a cocina:', error);
      toast.error('No se pudo enviar el aviso a cocina');
    } finally {
      setIsSendingKitchenNote(false);
    }
  };

  const handleOpenDrawer = async () => {
    if (!currentVenueId) {
      toast.error('No hay sede activa');
      return;
    }

    try {
      await printersApi.openDrawer(currentVenueId);
      toast.success('Cajón abierto');
    } catch (error) {
      console.error('[POS] Error abriendo cajón:', error);
      toast.error('No se pudo abrir el cajón');
    }
  };

  const handleSendMenuCourse = async (item: CartItem, course: MenuCourseTag, selectedProductId?: number) => {
    if (!activeOrder || !item.orderItemId) return;

    try {
      await apiClient.post(`/api/orders/${activeOrder.id}/items/${item.orderItemId}/send-menu-course`, {
        course,
        productId: selectedProductId,
      });
      toast.success('Pase enviado a cocina');
      setMenuCourseRequest(null);
      await loadActiveOrder();
    } catch (error) {
      console.error('[POS] Error enviando pase de menú:', error);
      toast.error('No se pudo enviar el pase del menú');
    }
  };

  const handleRequestMenuCourse = (item: CartItem, course: MenuCourseTag) => {
    const menuSelection = decodeMenuSelection(item.notes);
    if (!menuSelection) return;

    const selectedCourse = menuSelection.courses[course];
    if (selectedCourse?.productId) {
      void handleSendMenuCourse(item, course, selectedCourse.productId);
      return;
    }

    const pickerConfig = course === 'DESSERT'
      ? {
          allowedTags: menuSelection.finalMode === 'DESSERT_OR_COFFEE' ? ['DESSERT', 'COFFEE'] as MenuCourseTag[] : ['DESSERT'] as MenuCourseTag[],
          title: menuSelection.finalMode === 'DESSERT_OR_COFFEE' ? 'Elegir postre o café' : 'Elegir postre',
        }
      : {
          allowedTags: ['COFFEE'] as MenuCourseTag[],
          title: 'Elegir café',
        };

    setMenuCourseRequest({
      item,
      course,
      allowedTags: pickerConfig.allowedTags,
      title: pickerConfig.title,
    });
  };

  // ── Enviar comanda ────────────────────────────────────────────────────────
  const handleSendOrder = useCallback(async () => {
    const pendingItems = cartItems.filter(i => !i.sent);
    if (pendingItems.length === 0) {
      toast.error('No hay artículos nuevos para enviar');
      return;
    }

    const tid = parseInt(tableId ?? '0', 10);
    const userId = currentUser?.id ?? 1; // Fallback para MVP sin auth

    if (!isOnline) {
      // Guardar comanda offline
      await saveOrderOffline({
        localId: `local-${Date.now()}`,
        tableId: tid,
        tableNumber: activeTable?.number ?? 0,
        userId,
        items: pendingItems,
        createdAt: new Date().toISOString(),
      });
      toast.success('Comanda guardada offline. Se sincronizará al reconectar.');
      return;
    }

    try {
      let order = activeOrder;
      const pendingMenuItems = pendingItems.filter((item) => !!decodeMenuSelection(item.notes));

      if (!order) {
        // Crear nuevo pedido
        order = await ordersApi.create({
          tableId: tid,
          venueId: currentVenueId!,
          items: pendingItems.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.price,
            notes: i.notes
          }))
        });
        setActiveOrder(order);
        toast.success('Comanda enviada a cocina');
      } else {
        // Agregar items al pedido existente
        for (const item of pendingItems) {
          await ordersApi.addItem(order.id, {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.price,
            notes: item.notes,
          });
        }
        toast.success('Items añadidos al pedido');
      }

      // Enviar a cocina
      await ordersApi.sendToKitchen(order.id);

      if (currentVenueId) {
        const counts = readFavoriteCounts(currentVenueId);
        for (const item of pendingItems) {
          counts[item.productId] = (counts[item.productId] ?? 0) + item.quantity;
        }
        storeFavoriteCounts(currentVenueId, counts);
        refreshFavoriteCategory();
      }
      
      // Limpiar del carrito local los productos no enviados que acaban de procesarse con éxito
      useAppStore.setState({
        cartItems: useAppStore.getState().cartItems.filter(i => i.sent)
      });

      await loadActiveOrder();
      const refreshedItems = useAppStore.getState().cartItems.filter((item) => item.sent);
      const refreshedMenuItems = refreshedItems.filter((item) => !!decodeMenuSelection(item.notes));
      if (pendingMenuItems.length > 0 && refreshedMenuItems.length > 0) {
        setMenuSendPromptItems(refreshedMenuItems);
      }
      // Volver a catálogo tras enviar comanda
      setMobileView('catalog');
    } catch (error) {
      console.error('[POS] Error enviando comanda:', error);
      if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
        toast.error(error.response.data.message);
      } else {
        toast.error('Error al enviar la comanda');
      }
    }
  }, [activeOrder, activeTable, cartItems, currentUser?.id, currentVenueId, isOnline, loadActiveOrder, refreshFavoriteCategory, setActiveOrder, tableId]);

  // ── Emitir pre-ticket / Pedir la cuenta ────────────────────────────────────
  const handleRequestBill = async () => {
    if (!activeTable) return;
    try {
      const pendingItems = cartItems.filter((item) => !item.sent);
      if (pendingItems.length > 0) {
        if (!isOnline) {
          toast.error('No se puede emitir el pre-ticket con artículos pendientes sin conexión');
          return;
        }
        if (!currentVenueId) {
          toast.error('No hay sede activa');
          return;
        }

        let order = activeOrder;
        if (!order) {
          order = await ordersApi.create({
            tableId: activeTable.id,
            venueId: currentVenueId,
            items: pendingItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.price,
              notes: item.notes,
            })),
          });
          setActiveOrder(order);
        } else {
          for (const item of pendingItems) {
            await ordersApi.addItem(order.id, {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.price,
              notes: item.notes,
            });
          }
        }

        if (currentVenue?.kitchenEnabled !== false) {
          await ordersApi.sendToKitchen(order.id);
        }

        useAppStore.setState({
          cartItems: useAppStore.getState().cartItems.filter((item) => item.sent),
        });
        await loadActiveOrder();
      }

      const updatedTable = await tablesApi.requestBill(activeTable.id);
      setActiveTable(updatedTable);
      setTables(tables.map((t) => (t.id === updatedTable.id ? updatedTable : t)));
      try {
        if (selectedLocalPrinterName) {
          await handleLocalPreBillPrint(activeTable.id);
        } else if (selectedPrinterIp) {
          await ticketsApi.reprintPreBill(activeTable.id);
        } else {
          toast('Pre-ticket emitido sin impresión automática. Configura una impresora local o una impresora de servidor.', {
            icon: '🖨️',
          });
        }
      } catch (printError) {
        console.error('[POS] Error imprimiendo pre-ticket:', printError);
        toast.error('El pre-ticket se ha marcado en la mesa, pero no se pudo imprimir');
      }
      toast.success('Pre-ticket emitido. Mesa en estado Cuenta.');
    } catch (error) {
      console.error('[POS] Error al emitir pre-ticket:', error);
      if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
        toast.error(error.response.data.message);
      } else {
        toast.error('No se pudo emitir el pre-ticket');
      }
    }
  };

  // ── Cerrar ticket / Cobrar (Abre el modal de método de pago) ────────────────
  const handleCloseTicket = () => {
    if (!activeOrder) {
      if (cartItems.length === 0) {
        toast.error('No hay pedido activo');
        return;
      }
      if (currentVenue?.kitchenEnabled === false) {
        setIsPaymentModalOpen(true);
        return;
      }
      toast.error('Primero debes enviar a cocina antes de cobrar');
      return;
    }
    setIsPaymentModalOpen(true);
  };

  const handleSplitBill = () => {
    setIsSplitBillModalOpen(true);
  };

  const handleCobrarSeleccion = (selection: Array<{
    productId: number;
    quantity: number;
    notes?: string | null;
    unitPrice: number;
    vatRate: number;
    name: string;
  }>, mode: 'QUANTITY' | 'PRICE', partsCount?: number) => {
    setSplitBillSelection(selection);
    setSplitBillMode(mode);

    if (mode === 'PRICE' && partsCount) {
      setSplitPeopleTotalCount(partsCount);
      setSplitPeopleRemaining(partsCount);
    } else {
      setSplitPeopleTotalCount(0);
      setSplitPeopleRemaining(0);
    }

    setIsSplitBillModalOpen(false);
    setIsPaymentModalOpen(true);
  };

  const handleCobrarSiguienteParte = async () => {
    setClosedTicket(null); // Cerrar pantalla de éxito del ticket anterior

    if (splitPeopleRemaining <= 1) {
      // Última persona: paga el importe restante de la comanda normal
      setSplitBillSelection(null);
      setIsPaymentModalOpen(true);
    } else {
      // Comensal intermedio: paga 1 / splitPeopleRemaining de lo que queda de comanda
      const activeItems = useAppStore.getState().cartItems.filter((i) => i.sent);
      const nextSelection = activeItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || null,
        unitPrice: Number(item.price) / splitPeopleRemaining,
        vatRate: Number(item.vatRate),
        name: item.name,
      }));

      setSplitBillSelection(nextSelection);
      setSplitBillMode('PRICE');
      setIsPaymentModalOpen(true);
    }
  };

  const handleConfirmPayment = async (method: 'CASH' | 'CARD', print: boolean, cashDetails?: { delivered: number; change: number }) => {
    setIsClosingTicket(true);

    try {
      let orderToCharge = activeOrder;
      if (!orderToCharge) {
        if (currentVenue?.kitchenEnabled !== false || !activeTable || !currentVenueId) {
          return;
        }

        const pendingItems = cartItems.filter((item) => !item.sent);
        if (pendingItems.length === 0) {
          toast.error('No hay artículos para cobrar');
          return;
        }

        orderToCharge = await ordersApi.create({
          tableId: activeTable.id,
          venueId: currentVenueId,
          items: pendingItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.price,
            notes: item.notes,
          })),
        });
        setActiveOrder(orderToCharge);
      }

      const useLocalPrinting = print && !!selectedLocalPrinterName;
      const useServerPrinting = print && !useLocalPrinting && !!selectedPrinterIp;
      let result;
      if (splitBillSelection) {
        result = await ticketsApi.closePartial({
          originalOrderId: orderToCharge.id,
          venueId: currentVenueId!,
          paymentMethod: method,
          items: splitBillSelection.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            notes: item.notes,
          })),
          splitMode: splitBillMode,
          printerIp: useServerPrinting ? (selectedPrinterIp || undefined) : undefined,
        });
      } else {
        result = await ticketsApi.close({
          orderId: orderToCharge.id,
          venueId: currentVenueId!,
          paymentMethod: method,
          printerIp: useServerPrinting ? (selectedPrinterIp || undefined) : undefined,
        });
      }

      if (useLocalPrinting) {
        try {
          await handleLocalTicketPrint(result.ticketId);
        } catch (printError) {
          console.error('[POS] Error imprimiendo en QZ Tray:', printError);
          toast.error('El ticket se ha emitido, pero no se pudo imprimir en la impresora local');
        }
      } else if (print && !useServerPrinting) {
        toast('Ticket emitido sin impresión automática. Configura una impresora local o una impresora de servidor.', {
          icon: '🖨️',
        });
      }

      const methodLabel = method === 'CASH' ? 'Efectivo' : 'Tarjeta';
      let msg = `Ticket ${result.invoiceCode} cobrado (${methodLabel})`;
      if (method === 'CASH' && cashDetails) {
        msg += ` - Cambio: ${cashDetails.change.toFixed(2)} €`;
      }
      toast.success(msg, { duration: 6000 });

      // Verificación de flujo consecutivo en división por personas (PRICE)
      if (splitBillSelection && splitBillMode === 'PRICE') {
        const nextRemaining = splitPeopleRemaining - 1;
        setSplitPeopleRemaining(nextRemaining);

        if (nextRemaining > 0) {
          // Aún quedan personas por pagar
          setLastSplitPayment({
            invoiceCode: result.invoiceCode,
            total: result.total,
            change: method === 'CASH' && cashDetails ? cashDetails.change : undefined,
          });

          // Limpiar la selección anterior y cargar el estado actualizado
          setSplitBillSelection(null);
          await loadActiveOrder();

          if (nextRemaining === 1) {
            // Último comensal: paga el resto en cierre estándar
            setSplitBillSelection(null);
          } else {
            // Comensal intermedio: recalculamos con el precio restante
            const activeItems = useAppStore.getState().cartItems.filter((i) => i.sent);
            const nextSelection = activeItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              notes: item.notes || null,
              unitPrice: Number(item.price) / nextRemaining,
              vatRate: Number(item.vatRate),
              name: item.name,
            }));
            setSplitBillSelection(nextSelection);
          }
        } else {
          // Último comensal pagado
          clearCart();
          setActiveOrder(null);
          setSplitPeopleRemaining(0);
          setSplitPeopleTotalCount(0);
          setLastSplitPayment(null);
          setIsPaymentModalOpen(false);

          setClosedTicket({
            invoiceCode: result.invoiceCode,
            total: result.total,
            qrBase64: result.qrBase64,
            isPartial: false,
          });
        }
      } else {
        // Cierre estándar o división por artículos
        setClosedTicket({
          invoiceCode: result.invoiceCode,
          total: result.total,
          qrBase64: result.qrBase64,
          isPartial: !!splitBillSelection,
        });

        if (splitBillSelection) {
          setSplitBillSelection(null);
          await loadActiveOrder();
        } else {
          clearCart();
          setActiveOrder(null);
          setSplitPeopleRemaining(0);
          setSplitPeopleTotalCount(0);
        }
        setIsPaymentModalOpen(false);
      }
    } catch (error) {
      console.error('[POS] Error cerrando ticket:', error);
      if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
        toast.error(error.response.data.message);
      } else {
        toast.error('Error al cerrar el ticket');
      }
    } finally {
      setIsClosingTicket(false);
    }
  };

  // ── Vista de ticket cerrado exitosamente ─────────────────────────────────
  if (closedTicket) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
      }}>
        <div className="ticket-success modal">
          <h2 style={{ fontSize: '1.25rem' }}>Ticket Emitido</h2>
          <div className="ticket-success__code">{closedTicket.invoiceCode}</div>
          <div className="ticket-success__total">{Number(closedTicket.total).toFixed(2)} €</div>

          {closedTicket.qrBase64 && (
            <img
              src={`data:image/png;base64,${closedTicket.qrBase64}`}
              alt="QR de verificación Veri*factu"
              style={{ width: 160, height: 160, borderRadius: 'var(--radius-md)' }}
            />
          )}

          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Veri*factu — verificable en sede.agenciatributaria.gob.es
          </p>

          {closedTicket.isPartial ? (
            <button
              id="btn-continue-table"
              className="btn btn-primary btn-full"
              onClick={
                splitPeopleRemaining > 0
                  ? handleCobrarSiguienteParte
                  : () => setClosedTicket(null)
              }
              style={{ fontWeight: 800 }}
            >
              {splitPeopleRemaining > 0
                ? splitPeopleRemaining === 1
                  ? `Cobrar Última Parte (Persona ${splitPeopleTotalCount - splitPeopleRemaining + 1} de ${splitPeopleTotalCount})`
                  : `Cobrar Siguiente Parte (Persona ${splitPeopleTotalCount - splitPeopleRemaining + 1} de ${splitPeopleTotalCount})`
                : `Continuar cobrando Mesa ${activeTable?.number ?? 0}`}
            </button>
          ) : (
            <button
              id="btn-new-order"
              className="btn btn-primary btn-full"
              onClick={() => {
                setClosedTicket(null);
                navigate('/');
              }}
            >
              Nueva Mesa
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`pos-page pos-page--mobile-${mobileView}`}>
      {/* Selector de vista en dispositivos móviles (Oculto en PC y Tablets horizontales) */}
      <div className="pos-mobile-nav">
        <button
          className={`pos-mobile-nav__btn ${mobileView === 'catalog' ? 'active' : ''}`}
          onClick={() => setMobileView('catalog')}
          aria-label="Ver Catálogo"
        >
          Catálogo
        </button>
        <button
          className={`pos-mobile-nav__btn ${mobileView === 'ticket' ? 'active' : ''}`}
          onClick={() => setMobileView('ticket')}
          aria-label="Ver Ticket"
        >
          Ticket ({cartSummary.itemCount})
          {cartSummary.total > 0 && ` · ${Number(cartSummary.total).toFixed(2)} €`}
        </button>
      </div>

      {/* Columna 1: Carrito / ticket */}
      <Cart
        summary={cartSummary}
        kitchenEnabled={currentVenue?.kitchenEnabled !== false}
        onSendOrder={handleSendOrder}
        onCloseTicket={handleCloseTicket}
        onRequestBill={handleRequestBill}
        onSplitBill={handleSplitBill}
        isClosingTicket={isClosingTicket}
        hasActiveOrder={!!activeOrder || !!activeTable}
        onCancelSentItem={handleCancelSentItem}
        onCancelAndFreeTable={handleCancelAndFreeTable}
        onRequestMenuCourse={handleRequestMenuCourse}
      />

      <div className="pos-workspace">
        {/* Columna 2: Grid de productos */}
        <div
          className="product-area"
          style={{ ['--product-family-color' as const]: selectedCategoryAccent } as CSSProperties}
        >
          <div className="product-area__header">
            <div className="product-area__table-info">
              <span className="product-area__eyebrow">Servicio en curso</span>
              <div className="product-area__table-line">
                <span className="product-area__table-badge">
                  Mesa {activeTable?.number ?? tableId}
                </span>
                {activeTable?.zone && (
                  <span className="product-area__zone-pill">{activeTable.zone}</span>
                )}
                {activeOrder && (
                  <span className="product-area__order-pill">
                    Pedido #{activeOrder.id}
                  </span>
                )}
              </div>
              <p className="product-area__subtitle">
                Selecciona una categoría y añade artículos al ticket.
              </p>
            </div>

            <div className="product-area__actions">
              <button
                className="btn btn-secondary"
                onClick={handleOpenDrawer}
                type="button"
                style={{ fontSize: '0.85rem' }}
              >
                Abrir cajón
              </button>
              {currentVenue?.kitchenEnabled !== false && (
                <button
                  className="btn btn-send-kitchen"
                  onClick={() => setIsKitchenNoteModalOpen(true)}
                  type="button"
                  style={{ fontSize: '0.85rem' }}
                >
                  Avisar a cocina
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setIsOpenTablesModalOpen(true)}
                style={{ fontSize: '0.85rem' }}
              >
                Mesas abiertas
              </button>
              <button
                id="btn-back-tables"
                className="btn btn-ghost"
                onClick={() => navigate('/')}
                style={{ fontSize: '0.85rem' }}
              >
                Volver a mesas
              </button>
              <span className="product-area__hint-badge">
                {selectedCategory?.name ?? 'Categoría'}
              </span>
            </div>
          </div>

          <ProductGrid
            products={products}
            accentColor={selectedCategoryAccent}
            categoryName={selectedCategory?.name}
            onProductClick={handleProductClick}
          />
        </div>

        {/* Columna 3: Sidebar de categorías */}
        <CategorySidebar
          categories={displayedCategories}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          getCategoryAccent={getCategoryAccent}
        />
      </div>

      {configuringProduct && selectedCategory?.modifierGroups && (
        <ProductConfiguratorModal
          product={configuringProduct}
          groups={selectedCategory.modifierGroups}
          onClose={() => setConfiguringProduct(null)}
          onConfirm={async (payload) => {
            await addConfiguredProductToCart(configuringProduct, payload);
            setConfiguringProduct(null);
          }}
        />
      )}

      {configuringMenuProduct && configuringMenuProduct.menuConfig && (
        <MenuConfiguratorModal
          product={configuringMenuProduct}
          menuConfig={configuringMenuProduct.menuConfig}
          products={allCatalogProducts}
          onClose={() => setConfiguringMenuProduct(null)}
          onConfirm={async (payload) => {
            await addConfiguredProductToCart(configuringMenuProduct, payload);
            setConfiguringMenuProduct(null);
          }}
        />
      )}

      {menuCourseRequest && (
        <MenuCoursePickerModal
          title={menuCourseRequest.title}
          allowedTags={menuCourseRequest.allowedTags}
          products={allCatalogProducts}
          onClose={() => setMenuCourseRequest(null)}
          onConfirm={(selectedProduct) => {
            const actualCourse = getProductCourseTag(selectedProduct, menuCourseRequest.allowedTags) ?? menuCourseRequest.course;
            void handleSendMenuCourse(menuCourseRequest.item, actualCourse, selectedProduct.id);
          }}
        />
      )}

      {menuSendPromptItems.length > 0 && (
        <MenuSendPromptModal
          items={menuSendPromptItems}
          onClose={() => setMenuSendPromptItems([])}
          onRequestCourse={(item, course) => {
            setMenuSendPromptItems([]);
            handleRequestMenuCourse(item, course);
          }}
        />
      )}

      {currentVenue?.kitchenEnabled !== false && isKitchenNoteModalOpen && (
        <KitchenNoteModal
          tables={tables}
          initialTableId={activeTable?.id}
          isSubmitting={isSendingKitchenNote}
          onClose={() => setIsKitchenNoteModalOpen(false)}
          onSubmit={handleSendKitchenNote}
        />
      )}

      {isOpenTablesModalOpen && (
        <div className="modal-overlay" onClick={() => setIsOpenTablesModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="modal__title">Mesas abiertas</h3>
            <div className="pos-open-tables-list">
              {tables.filter((table) => table.objectType === 'TABLE' && table.status !== 'FREE').length === 0 ? (
                <div className="admin-modifier-empty">No hay mesas abiertas ahora mismo.</div>
              ) : (
                tables
                  .filter((table) => table.objectType === 'TABLE' && table.status !== 'FREE')
                  .sort((a, b) => a.number - b.number)
                  .map((table) => (
                    <button
                      key={table.id}
                      className="pos-open-tables-list__item"
                      onClick={() => {
                        setIsOpenTablesModalOpen(false);
                        setActiveTable(table);
                        navigate(`/pos/${table.id}`);
                      }}
                    >
                      <strong>Mesa {table.number}</strong>
                      <span>{table.name ?? 'Sala'}</span>
                    </button>
                  ))
              )}
            </div>
            <div className="modal__actions">
              <button className="btn btn-secondary" onClick={() => setIsOpenTablesModalOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {isSplitBillModalOpen && (
        <SplitBillModal
          isOpen={isSplitBillModalOpen}
          onClose={() => setIsSplitBillModalOpen(false)}
          tableNumber={activeTable?.number ?? 0}
          sentItems={cartSummary.items.filter((i) => i.sent)}
          onCobrarSeleccion={handleCobrarSeleccion}
        />
      )}

      {isPaymentModalOpen && (
        <PaymentModal
          key={`payment-table-${activeTable?.id}-person-${splitPeopleTotalCount - splitPeopleRemaining + 1}`}
          total={paymentTotal}
          tableNumber={activeTable?.number ?? 0}
          isClosing={isClosingTicket}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSplitBillSelection(null);
            setLastSplitPayment(null);
          }}
          onConfirm={handleConfirmPayment}
          splitInfo={
            splitPeopleTotalCount > 0
              ? {
                  current: splitPeopleTotalCount - splitPeopleRemaining + 1,
                  total: splitPeopleTotalCount,
                }
              : undefined
          }
          lastPayment={lastSplitPayment}
          localPrinting={{
            enabled: isQzTrayReady,
            printerName: selectedLocalPrinterName,
            availablePrinters: availableLocalPrinters,
            connecting: isLoadingLocalPrinters,
            onRefresh: () => { void loadLocalPrinters(); },
            onChange: (printerName) => setSelectedLocalPrinterName(printerName),
          }}
        />
      )}
    </div>
  );
}
