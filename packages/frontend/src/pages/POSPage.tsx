/**
 * TAVOLO POS — Página Pantalla de Venta (POS)
 * Layout de 3 columnas: Categorías | Productos | Carrito
 */
/// <reference types="vite/client" />
import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore, useCartSummary } from '../store/useAppStore';
import { productsApi, ordersApi, ticketsApi, tablesApi, apiClient, printersApi } from '../services/api';
import { cacheCategories, getCachedCategories, saveOrderOffline } from '../services/offlineStorage';
import { CategorySidebar } from '../components/pos/CategorySidebar';
import { ProductGrid } from '../components/pos/ProductGrid';
import { Cart } from '../components/pos/Cart';
import { ProductConfiguratorModal } from '../components/pos/ProductConfiguratorModal';
import { KitchenNoteModal } from '../components/pos/KitchenNoteModal';
import { MenuConfiguratorModal } from '../components/pos/MenuConfiguratorModal';
import { MenuCoursePickerModal } from '../components/pos/MenuCoursePickerModal';
import { MenuSendPromptModal } from '../components/pos/MenuSendPromptModal';
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
    currentVenueId,
  } = useAppStore();

  const cartSummary = useCartSummary();
  const [isClosingTicket, setIsClosingTicket] = useState(false);
  const [closedTicket, setClosedTicket] = useState<{
    invoiceCode: string;
    total: number;
    qrBase64?: string;
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
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const products: Product[] = selectedCategory?.products ?? [];
  const allCatalogProducts = categories.flatMap((category) => category.products ?? []);
  const selectedCategoryAccent = getCategoryAccent(selectedCategory);

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
  const handleSendOrder = async () => {
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
            notes: i.notes
          }))
        });
        setActiveOrder(order);
        toast.success('Comanda enviada a cocina');
      } else {
        // Agregar items al pedido existente
        for (const item of pendingItems) {
          await ordersApi.addItem(order.id, item);
        }
        toast.success('Items añadidos al pedido');
      }

      // Enviar a cocina
      await ordersApi.sendToKitchen(order.id);
      
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
  };

  // ── Cerrar ticket / Cobrar ────────────────────────────────────────────────
  const handleCloseTicket = async () => {
    if (!activeOrder) {
      // Si hay items en carrito pero no pedido activo, crear primero
      if (cartItems.length === 0) {
        toast.error('No hay pedido activo');
        return;
      }
      await handleSendOrder();
      return;
    }

    setIsClosingTicket(true);

    try {
      const result = await ticketsApi.close({
        orderId: activeOrder.id,
        venueId: currentVenueId!,
        printerIp: selectedPrinterIp || undefined,
      });

      setClosedTicket({
        invoiceCode: result.invoiceCode,
        total: result.total,
        qrBase64: result.qrBase64,
      });

      clearCart();
      setActiveOrder(null);
      toast.success(`Ticket ${result.invoiceCode} emitido`);
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
        onSendOrder={handleSendOrder}
        onCloseTicket={handleCloseTicket}
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
              <span className="product-area__table-badge">
                Mesa {activeTable?.number ?? tableId}
              </span>
              {activeOrder && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Pedido #{activeOrder.id} activo
                </span>
              )}
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
              <button
                className="btn btn-send-kitchen"
                onClick={() => setIsKitchenNoteModalOpen(true)}
                type="button"
                style={{ fontSize: '0.85rem' }}
              >
                Avisar a cocina
              </button>
              <button
                id="btn-back-tables"
                className="btn btn-ghost"
                onClick={() => navigate('/')}
                style={{ fontSize: '0.85rem' }}
              >
                Volver a mesas
              </button>
            </div>
          </div>

          <ProductGrid
            products={products}
            accentColor={selectedCategoryAccent}
            onProductClick={handleProductClick}
          />
        </div>

        {/* Columna 3: Sidebar de categorías */}
        <CategorySidebar
          categories={categories}
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

      {isKitchenNoteModalOpen && (
        <KitchenNoteModal
          tables={tables}
          initialTableId={activeTable?.id}
          isSubmitting={isSendingKitchenNote}
          onClose={() => setIsKitchenNoteModalOpen(false)}
          onSubmit={handleSendKitchenNote}
        />
      )}
    </div>
  );
}
