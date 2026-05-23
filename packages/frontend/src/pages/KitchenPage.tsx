import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ordersApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import type { KitchenQueueItem, KitchenQueueSummaryItem, ProductionStation } from '../types';

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
  const previousIdsRef = useRef<string[]>([]);

  // Estados añadidos para KDS Historial y Comanda Completa
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<KitchenQueueItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetailItems, setOrderDetailItems] = useState<KitchenQueueItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  const groupedByTable = useMemo(() => {
    const groups = new Map<string, { key: string; orderId: number; tableNumber: number; tableName?: string; waiterName: string; items: KitchenQueueItem[] }>();
    for (const item of items) {
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
    return Array.from(groups.values()).sort((a, b) => a.tableNumber - b.tableNumber);
  }, [items]);

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
      <style>{`
        @keyframes slideRight {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <div className="kitchen-page__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setIsHistoryOpen(true);
              void loadHistory();
            }}
            style={{
              width: 44,
              height: 44,
              padding: 0,
              fontSize: '1.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
            title="Ver Historial"
          >
            ☰
          </button>
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
          {stations.length > 0 && (
            <select
              className="form-select"
              value={selectedStationId ?? ''}
              onChange={(event) => setSelectedStationId(event.target.value ? Number(event.target.value) : null)}
              style={{ minWidth: 220 }}
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
                    <strong>{entry.productName}</strong>
                    <span>{entry.totalQuantity} uds.</span>
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
                <article key={group.key} className="kitchen-ticket">
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
                      <div key={item.id} className="kitchen-ticket__item">
                        <div className="kitchen-ticket__item-top">
                          <strong style={{ fontSize: '0.98rem' }}>{item.quantity}x {item.productName}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            {item.courseLabel && (
                              <span className="kitchen-ticket__course">{item.courseLabel}</span>
                            )}
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => void handleMarkItemReady(item.productionItemId)}
                              disabled={updatingItemId === item.productionItemId}
                            >
                              {updatingItemId === item.productionItemId ? '...' : 'Listo'}
                            </button>
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
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Drawer del Historial (Menú Lateral Izquierdo Deslizante) */}
      {isHistoryOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsHistoryOpen(false)}
          style={{
            zIndex: 1100,
            background: 'rgba(0, 0, 0, 0.4)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            className="kitchen-history-drawer"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              height: '100vh',
              width: 360,
              maxWidth: '85vw',
              background: 'var(--color-surface-1)',
              borderRight: '1px solid var(--color-border)',
              boxShadow: '8px 0 32px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              padding: 'var(--space-5)',
              animation: 'slideRight 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div>
                <span className="cart__eyebrow" style={{ fontSize: '0.72rem', letterSpacing: 1 }}>KDS Historial</span>
                <h3 className="modal__title" style={{ margin: 0, fontSize: '1.25rem' }}>Platos Listos</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsHistoryOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', lineHeight: 1.4 }}>
              Historial de platos marcados como listos recientemente. Los platos desaparecen automáticamente al cobrarse la mesa.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>Cargando historial...</div>
              ) : historyItems.length === 0 ? (
                <div className="admin-modifier-empty" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>No hay platos listos en mesas activas.</div>
              ) : (
                historyItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3) var(--space-4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Mesa {item.tableNumber}</span>
                        {item.readyAt && (
                          <span style={{ fontWeight: 500, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {new Date(item.readyAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.92rem', color: 'var(--color-text-primary)', marginTop: 2, fontWeight: 700 }}>
                        {item.quantity}x {item.productName}
                      </div>
                      {item.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                          {item.notes}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleRevertItem(item.productionItemId)}
                      style={{ fontSize: '0.8rem', padding: '6px 10px', height: 'fit-content' }}
                    >
                      Recuperar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
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
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
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
    </main>
  );
}
