import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ordersApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import type { KitchenQueueItem, KitchenQueueSummaryItem, ProductionStation } from '../types';

type KitchenFilter = 'ALL' | 'PENDING' | 'IN_PROGRESS';

export function KitchenPage() {
  const { currentVenue, currentVenueId } = useAppStore();
  const [items, setItems] = useState<KitchenQueueItem[]>([]);
  const [summary, setSummary] = useState<KitchenQueueSummaryItem[]>([]);
  const [stations, setStations] = useState<ProductionStation[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [completingOrderId, setCompletingOrderId] = useState<number | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<KitchenFilter>('ALL');
  const previousIdsRef = useRef<string[]>([]);

  // Estados añadidos para KDS Historial y Comanda Completa
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<KitchenQueueItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetailItems, setOrderDetailItems] = useState<KitchenQueueItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedKitchenItem, setSelectedKitchenItem] = useState<KitchenQueueItem | null>(null);

  const loadHistory = async (silent = false) => {
    if (!currentVenueId) return;
    try {
      if (!silent) setLoadingHistory(true);
      const data = await ordersApi.getKitchenHistory(currentVenueId, selectedStationId ?? undefined);
      setHistoryItems(data);
    } catch (error) {
      console.error('[Kitchen] Error cargando historial:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadOrderDetail = async (orderId: number, silent = false) => {
    try {
      if (!silent) setLoadingDetail(true);
      const data = await ordersApi.getKitchenOrder(orderId);
      setOrderDetailItems(data);
    } catch (error) {
      console.error('[Kitchen] Error cargando detalle de comanda:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const loadQueue = async (silent = false) => {
    if (!currentVenueId) return;
    try {
      const data = await ordersApi.getKitchenQueue(currentVenueId, selectedStationId ?? undefined);
      setItems(data.items);
      setSummary(data.summary);
      setLastRefresh(new Date());

      const nextIds = data.items.map((item) => item.id);
      const newIds = nextIds.filter((id) => !previousIdsRef.current.includes(id));
      if (previousIdsRef.current.length > 0 && newIds.length > 0) {
        toast.success(`Han entrado ${newIds.length} ${newIds.length === 1 ? 'nueva comanda' : 'nuevas comandas'}`);
        try {
          const audioCtx = new window.AudioContext();
          const oscillator = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          oscillator.type = 'triangle';
          oscillator.frequency.value = 880;
          gain.gain.value = 0.03;
          oscillator.connect(gain);
          gain.connect(audioCtx.destination);
          oscillator.start();
          oscillator.stop(audioCtx.currentTime + 0.18);
        } catch {
          if (!silent) console.debug('Audio de aviso no disponible');
        }
      }
      previousIdsRef.current = nextIds;
    } catch (error) {
      console.error('[Kitchen] Error cargando cola:', error);
      if (!silent) toast.error('No se pudo cargar la cola de cocina');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentVenueId) return;

    void Promise.all([
      ordersApi.getProductionStations(currentVenueId).then((data) => {
        setStations(data);
        if (data.length > 0 && selectedStationId === null) {
          setSelectedStationId(data[0].id);
        }
      }),
      loadQueue(),
    ]);

    const interval = window.setInterval(() => {
      void loadQueue(true);
      if (isHistoryOpen) {
        void loadHistory(true);
      }
    }, 12000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVenueId, selectedStationId, isHistoryOpen]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'ALL') return items;
    return items.filter((item) => item.status === activeFilter);
  }, [activeFilter, items]);

  const groupedByTable = useMemo(() => {
    const groups = new Map<string, { key: string; orderId: number; tableNumber: number; tableName?: string; waiterName: string; items: KitchenQueueItem[] }>();
    for (const item of filteredItems) {
      const key = `${item.orderId}`;
      const current = groups.get(key);
      if (current) {
        current.items.push(item);
      } else {
        groups.set(key, {
          key,
          orderId: item.orderId,
          tableNumber: item.tableNumber,
          tableName: item.tableName,
          waiterName: item.waiterName,
          items: [item],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => {
      const aOldest = Math.min(...a.items.map((item) => new Date(item.createdAt).getTime()));
      const bOldest = Math.min(...b.items.map((item) => new Date(item.createdAt).getTime()));
      if (aOldest !== bOldest) return aOldest - bOldest;
      return a.tableNumber - b.tableNumber;
    });
  }, [filteredItems]);

  const openTableOrders = useMemo(() => {
    const orderMap = new Map<number, {
      orderId: number;
      tableNumber: number;
      tableName?: string;
      waiterName: string;
      pendingCount: number;
      inProgressCount: number;
      readyCount: number;
      totalCount: number;
      lastActivityAt: number;
    }>();

    for (const item of items) {
      const current = orderMap.get(item.orderId) ?? {
        orderId: item.orderId,
        tableNumber: item.tableNumber,
        tableName: item.tableName,
        waiterName: item.waiterName,
        pendingCount: 0,
        inProgressCount: 0,
        readyCount: 0,
        totalCount: 0,
        lastActivityAt: 0,
      };

      if (item.status === 'PENDING') current.pendingCount += item.quantity;
      if (item.status === 'IN_PROGRESS') current.inProgressCount += item.quantity;
      current.totalCount += item.quantity;
      current.lastActivityAt = Math.max(current.lastActivityAt, new Date(item.createdAt).getTime());
      orderMap.set(item.orderId, current);
    }

    for (const item of historyItems) {
      const current = orderMap.get(item.orderId) ?? {
        orderId: item.orderId,
        tableNumber: item.tableNumber,
        tableName: item.tableName,
        waiterName: item.waiterName,
        pendingCount: 0,
        inProgressCount: 0,
        readyCount: 0,
        totalCount: 0,
        lastActivityAt: 0,
      };

      current.readyCount += item.quantity;
      current.totalCount += item.quantity;
      current.lastActivityAt = Math.max(
        current.lastActivityAt,
        new Date(item.readyAt ?? item.createdAt).getTime(),
      );
      orderMap.set(item.orderId, current);
    }

    return Array.from(orderMap.values()).sort((a, b) => {
      if (a.tableNumber !== b.tableNumber) return a.tableNumber - b.tableNumber;
      return a.orderId - b.orderId;
    });
  }, [historyItems, items]);

  const filterCounts = useMemo(() => ({
    ALL: items.length,
    PENDING: items.filter((item) => item.status === 'PENDING').length,
    IN_PROGRESS: items.filter((item) => item.status === 'IN_PROGRESS').length,
  }), [items]);

  const handleMarkReady = async (orderId: number) => {
    try {
      setCompletingOrderId(orderId);
      await ordersApi.markKitchenReady(orderId, selectedStationId ?? undefined);
      toast.success('Comanda marcada como lista');
      await loadQueue(true);
      if (isHistoryOpen) {
        await loadHistory(true);
      }
    } catch (error) {
      console.error('[Kitchen] Error marcando comanda lista:', error);
      toast.error('No se pudo marcar la comanda como lista');
    } finally {
      setCompletingOrderId(null);
    }
  };

  const handleMarkItemReady = async (itemId: number) => {
    try {
      setUpdatingItemId(itemId);
      await ordersApi.updateProductionItemStatus(itemId, 'READY');
      await loadQueue(true);
      if (isHistoryOpen) {
        await loadHistory(true);
      }
    } catch (error) {
      console.error('[Kitchen] Error marcando artículo listo:', error);
      toast.error('No se pudo marcar el artículo como listo');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleMarkItemInProgress = async (itemId: number) => {
    try {
      setUpdatingItemId(itemId);
      await ordersApi.updateProductionItemStatus(itemId, 'IN_PROGRESS');
      await loadQueue(true);
      if (isHistoryOpen) {
        await loadHistory(true);
      }
      if (selectedOrderId) {
        await loadOrderDetail(selectedOrderId, true);
      }
    } catch (error) {
      console.error('[Kitchen] Error marcando artículo en preparación:', error);
      toast.error('No se pudo marcar el artículo en preparación');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleMarkSummaryProductInProgress = async (productName: string) => {
    const pendingItems = items.filter((item) => item.productName === productName && item.status === 'PENDING');
    if (pendingItems.length === 0) {
      toast.error('No hay platos pendientes de ese producto');
      return;
    }

    try {
      setUpdatingItemId(-1);
      await Promise.all(
        pendingItems.map((item) => ordersApi.updateProductionItemStatus(item.productionItemId, 'IN_PROGRESS'))
      );
      toast.success(`${productName} en marcha`);
      await loadQueue(true);
      if (isHistoryOpen) {
        await loadHistory(true);
      }
      if (selectedOrderId) {
        await loadOrderDetail(selectedOrderId, true);
      }
    } catch (error) {
      console.error('[Kitchen] Error marcando acumulado en preparación:', error);
      toast.error('No se pudo poner el acumulado en marcha');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleRevertItem = async (itemId: number) => {
    try {
      await ordersApi.updateProductionItemStatus(itemId, 'PENDING');
      toast.success('Plato devuelto a cocina');
      await loadQueue(true);
      if (isHistoryOpen) {
        await loadHistory(true);
      }
      if (selectedOrderId) {
        await loadOrderDetail(selectedOrderId, true);
      }
    } catch (error) {
      console.error('[Kitchen] Error al recuperar preparación:', error);
      toast.error('No se pudo recuperar la preparación');
    }
  };

  if (loading) {
    return <div className="admin-loading">Cargando cocina...</div>;
  }

  return (
    <main className="kitchen-page">
      <div className="kitchen-page__header">
        <div className="kitchen-page__title-block">
          <div>
            <h1 className="admin-page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}>
              Cocina
            </h1>
            <p className="admin-page-subtitle" style={{ margin: 0, marginTop: 2 }}>
              {currentVenue?.name ?? 'Sin sede'} · {items.length} {items.length === 1 ? 'preparación pendiente' : 'preparaciones pendientes'}
            </p>
          </div>
        </div>
        <div className="kitchen-page__meta">
          <button
            type="button"
            className="btn btn-secondary kitchen-header-btn"
            onClick={() => {
              setIsHistoryOpen(true);
              void loadHistory();
            }}
          >
            Mesas abiertas
          </button>
          {stations.length > 0 && (
            <select
              className="form-select kitchen-station-select"
              value={selectedStationId ?? ''}
              onChange={(event) => setSelectedStationId(event.target.value ? Number(event.target.value) : null)}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          )}
          <span className="admin-badge admin-badge--info">
            {lastRefresh ? `Actualizado ${lastRefresh.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Sin actualizar'}
          </span>
        </div>
      </div>

      <div className="kitchen-filters">
        <button
          type="button"
          className={`kitchen-filter-chip ${activeFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => setActiveFilter('ALL')}
        >
          Todas
          <span>{filterCounts.ALL}</span>
        </button>
        <button
          type="button"
          className={`kitchen-filter-chip ${activeFilter === 'PENDING' ? 'active' : ''}`}
          onClick={() => setActiveFilter('PENDING')}
        >
          Pendientes
          <span>{filterCounts.PENDING}</span>
        </button>
        <button
          type="button"
          className={`kitchen-filter-chip ${activeFilter === 'IN_PROGRESS' ? 'active' : ''}`}
          onClick={() => setActiveFilter('IN_PROGRESS')}
        >
          En preparación
          <span>{filterCounts.IN_PROGRESS}</span>
        </button>
      </div>

      <div className="kitchen-layout">
        <section className="kitchen-summary">
          <h2 className="kitchen-summary__title">Acumulado por producto</h2>
          {summary.length === 0 ? (
            <div className="admin-modifier-empty">No hay nada pendiente ahora mismo.</div>
          ) : (
            <div className="kitchen-summary__list">
              {summary.map((entry) => (
                <article key={entry.productName} className="kitchen-summary__item">
                  <div className="kitchen-summary__row">
                    <div className="kitchen-summary__product">
                      <strong>{entry.productName}</strong>
                    </div>
                    <div className="kitchen-summary__row-actions">
                      <span className="kitchen-summary__count">{entry.totalQuantity} uds.</span>
                      <button
                        type="button"
                        className="btn btn-ghost kitchen-action-btn kitchen-action-btn--progress"
                        onClick={() => void handleMarkSummaryProductInProgress(entry.productName)}
                        disabled={updatingItemId === -1}
                      >
                        {updatingItemId === -1 ? '...' : 'En marcha'}
                      </button>
                    </div>
                  </div>
                  <div className="kitchen-summary__tables">
                    {entry.tables.map((table) => (
                      <span key={`${entry.productName}-${table.tableNumber}`} className="kitchen-summary__table-pill">
                        Mesa {table.tableNumber}: {table.quantity}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="kitchen-board">
          <h2 className="kitchen-summary__title">Comandas activas</h2>
          {groupedByTable.length === 0 ? (
            <div className="admin-modifier-empty">Sin comandas pendientes.</div>
          ) : (
            <div className="kitchen-board__grid">
              {groupedByTable.map((group) => (
                <article
                  key={group.key}
                  className={`kitchen-ticket ${getTicketUrgencyClass(group.items)}`}
                >
                  <div className="kitchen-ticket__header">
                    <div
                      onClick={() => {
                        setSelectedOrderId(group.orderId);
                        void loadOrderDetail(group.orderId);
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Ver Comanda Completa"
                    >
                      <h3 style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                        Mesa {group.tableNumber}{group.tableName ? ` · ${group.tableName}` : ''}
                      </h3>
                      <p>{group.waiterName}{group.items[0]?.stationName ? ` · ${group.items[0].stationName}` : ''}</p>
                    </div>
                    <div className="kitchen-ticket__header-actions">
                      <span className={`kitchen-ticket__age ${getAgeTone(getOldestMinutes(group.items))}`}>
                        {formatMinutes(getOldestMinutes(group.items))}
                      </span>
                      <span className="kitchen-ticket__count">
                        {group.items.reduce((sum, item) => sum + item.quantity, 0)} uds.
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleMarkReady(group.orderId)}
                        disabled={completingOrderId === group.orderId}
                      >
                        {completingOrderId === group.orderId ? 'Marcando...' : 'Lista'}
                      </button>
                    </div>
                  </div>
                  <div className="kitchen-ticket__items">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`kitchen-ticket__item kitchen-ticket__item--${item.status.toLowerCase()}`}
                        onClick={() => setSelectedKitchenItem(item)}
                      >
                        <div className="kitchen-ticket__item-top">
                          <div className="kitchen-ticket__item-main">
                            <strong className="kitchen-ticket__item-name">{item.quantity}x {item.productName}</strong>
                          </div>
                          <div className="kitchen-ticket__item-actions">
                            <div className="kitchen-ticket__item-badges">
                              <span className={`kitchen-ticket__status kitchen-ticket__status--${item.status.toLowerCase()}`}>
                                {item.status === 'PENDING' ? 'Pendiente' : item.status === 'IN_PROGRESS' ? 'En marcha' : 'Listo'}
                              </span>
                              {item.courseLabel && (
                                <span className="kitchen-ticket__course">{item.courseLabel}</span>
                              )}
                            </div>
                            <span className="kitchen-ticket__item-hint">Tocar para acciones</span>
                          </div>
                        </div>
                        {item.sourceMenuName && (
                          <div className="kitchen-ticket__meta-line">Menú: {item.sourceMenuName}</div>
                        )}
                        {item.description && (
                          <div className="kitchen-ticket__meta-line">{item.description}</div>
                        )}
                        {item.notes && (
                          <div className="kitchen-ticket__note">{item.notes}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Panel lateral de mesas abiertas */}
      {isHistoryOpen && (
        <div className="kitchen-drawer-shell">
          <div
            className="kitchen-history-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="kitchen-history-drawer__header">
              <div>
                <span className="cart__eyebrow kitchen-history-drawer__eyebrow">Mesas</span>
                <h3 className="modal__title kitchen-history-drawer__title">Mesas abiertas</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsHistoryOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="kitchen-history-drawer__description">
              Consulta lo ya marchado de cada mesa mientras su ticket siga abierto.
            </p>

            <div className="kitchen-history-drawer__body">
              {loadingHistory ? (
                <div className="kitchen-history-drawer__empty">Cargando mesas...</div>
              ) : openTableOrders.length === 0 ? (
                <div className="admin-modifier-empty kitchen-history-drawer__empty">No hay mesas activas en esta sección.</div>
              ) : (
                openTableOrders.map((order) => (
                  <button
                    key={order.orderId}
                    type="button"
                    className="kitchen-history-drawer__table"
                    onClick={() => {
                      setSelectedOrderId(order.orderId);
                      setIsHistoryOpen(false);
                      void loadOrderDetail(order.orderId);
                    }}
                  >
                    <div className="kitchen-history-drawer__table-top">
                      <div>
                        <div className="kitchen-history-drawer__table-name">
                          Mesa {order.tableNumber}{order.tableName ? ` · ${order.tableName}` : ''}
                        </div>
                        <div className="kitchen-history-drawer__table-meta">
                          {order.waiterName}
                        </div>
                      </div>
                      <div className="kitchen-history-drawer__table-total">
                        {order.totalCount} uds.
                      </div>
                    </div>

                    <div className="kitchen-history-drawer__table-badges">
                      {order.pendingCount > 0 && (
                        <span className="kitchen-history-drawer__badge kitchen-history-drawer__badge--pending">
                          Pendiente {order.pendingCount}
                        </span>
                      )}
                      {order.inProgressCount > 0 && (
                        <span className="kitchen-history-drawer__badge kitchen-history-drawer__badge--progress">
                          Marcha {order.inProgressCount}
                        </span>
                      )}
                      {order.readyCount > 0 && (
                        <span className="kitchen-history-drawer__badge kitchen-history-drawer__badge--ready">
                          Listo {order.readyCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          <button
            type="button"
            className="kitchen-drawer-shell__scrim"
            aria-label="Cerrar menú de mesas"
            onClick={() => setIsHistoryOpen(false)}
          />
        </div>
      )}

      {/* Modal de Comanda Completa */}
      {selectedOrderId !== null && (
        <div className="modal-overlay" onClick={() => setSelectedOrderId(null)} style={{ zIndex: 1110 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div>
                <span className="cart__eyebrow" style={{ fontSize: '0.72rem', letterSpacing: 1 }}>Comanda Completa</span>
                <h3 className="modal__title" style={{ margin: 0, fontSize: '1.35rem' }}>
                  Mesa {orderDetailItems[0]?.tableNumber ?? ''} {orderDetailItems[0]?.tableName ? `· ${orderDetailItems[0].tableName}` : ''}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedOrderId(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {loadingDetail ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>Cargando detalles...</div>
            ) : orderDetailItems.length === 0 ? (
              <div className="admin-modifier-empty">Sin detalles disponibles.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  Camarero: <strong>{orderDetailItems[0]?.waiterName}</strong>
                </p>

                <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingRight: 4 }}>
                  {orderDetailItems.map((item) => {
                    const isReady = item.status === 'READY';
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 'var(--space-3) var(--space-4)',
                          background: isReady ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                          border: isReady ? '1px solid var(--color-border)' : '1px solid var(--color-accent-dim)',
                          borderRadius: 'var(--radius-md)',
                          gap: 'var(--space-4)',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <strong style={{ fontSize: '1rem', color: isReady ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                              {item.quantity}x {item.productName}
                            </strong>
                            {item.courseLabel && (
                              <span className="kitchen-ticket__course" style={{ fontSize: '0.7rem' }}>{item.courseLabel}</span>
                            )}
                          </div>
                          {item.notes && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                              {item.notes}
                            </div>
                          )}
                        </div>

                        {/* Estado y Acciones */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {isReady ? (
                            <>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                ✓ Listo
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => void handleRevertItem(item.productionItemId)}
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                              >
                                Recuperar
                              </button>
                            </>
                          ) : (
                            <>
                              {item.status !== 'IN_PROGRESS' && (
                                <button
                                  type="button"
                                  className="btn btn-ghost kitchen-action-btn kitchen-action-btn--progress"
                                  onClick={async () => {
                                    await handleMarkItemInProgress(item.productionItemId);
                                    await loadOrderDetail(selectedOrderId, true);
                                  }}
                                  disabled={updatingItemId === item.productionItemId}
                                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                >
                                  {updatingItemId === item.productionItemId ? '...' : 'Marcha'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-secondary kitchen-action-btn kitchen-action-btn--ready"
                                onClick={async () => {
                                  await handleMarkItemReady(item.productionItemId);
                                  // Refrescar detalles del modal
                                  await loadOrderDetail(selectedOrderId, true);
                                }}
                                disabled={updatingItemId === item.productionItemId}
                                style={{ fontSize: '0.78rem', padding: '5px 10px', fontWeight: 700 }}
                              >
                                {updatingItemId === item.productionItemId ? '...' : 'Listo'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="modal__actions" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-full"
                    onClick={() => setSelectedOrderId(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedKitchenItem && (
        <div className="modal-overlay" onClick={() => setSelectedKitchenItem(null)} style={{ zIndex: 1120 }}>
          <div className="modal kitchen-item-action-modal" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <div>
                <span className="cart__eyebrow">Acciones</span>
                <h3 className="modal__title" style={{ margin: '4px 0 0' }}>
                  {selectedKitchenItem.quantity}x {selectedKitchenItem.productName}
                </h3>
                <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', fontSize: '0.84rem' }}>
                  Mesa {selectedKitchenItem.tableNumber}{selectedKitchenItem.tableName ? ` · ${selectedKitchenItem.tableName}` : ''}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelectedKitchenItem(null)}>×</button>
            </div>

            <div className="kitchen-item-action-modal__actions">
              {selectedKitchenItem.status !== 'IN_PROGRESS' && (
                <button
                  type="button"
                  className="btn btn-ghost kitchen-action-btn kitchen-action-btn--progress"
                  onClick={async () => {
                    await handleMarkItemInProgress(selectedKitchenItem.productionItemId);
                    setSelectedKitchenItem(null);
                  }}
                  disabled={updatingItemId === selectedKitchenItem.productionItemId}
                >
                  {updatingItemId === selectedKitchenItem.productionItemId ? '...' : 'En marcha'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary kitchen-action-btn kitchen-action-btn--ready"
                onClick={async () => {
                  await handleMarkItemReady(selectedKitchenItem.productionItemId);
                  setSelectedKitchenItem(null);
                }}
                disabled={updatingItemId === selectedKitchenItem.productionItemId}
              >
                {updatingItemId === selectedKitchenItem.productionItemId ? '...' : 'Listo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function getOldestMinutes(items: KitchenQueueItem[]) {
  const oldest = Math.min(...items.map((item) => new Date(item.createdAt).getTime()));
  return Math.max(0, Math.round((Date.now() - oldest) / 60000));
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest} min`;
}

function getAgeTone(minutes: number) {
  if (minutes >= 20) return 'kitchen-ticket__age--alert';
  if (minutes >= 10) return 'kitchen-ticket__age--warning';
  return 'kitchen-ticket__age--normal';
}

function getTicketUrgencyClass(items: KitchenQueueItem[]) {
  const minutes = getOldestMinutes(items);
  if (minutes >= 20) return 'kitchen-ticket--alert';
  if (minutes >= 10) return 'kitchen-ticket--warning';
  return '';
}
