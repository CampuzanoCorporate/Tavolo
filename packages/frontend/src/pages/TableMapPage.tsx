/**
 * TAVOLO POS — Página Plano de Mesas Interactivo
 * Vista principal con plano de planta premium, selector de zonas y estados de color.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore } from '../store/useAppStore';
import { ordersApi, printersApi, tablesApi, ticketsApi } from '../services/api';
import { cacheTables, getCachedTables } from '../services/offlineStorage';
import { KitchenNoteModal } from '../components/pos/KitchenNoteModal';
import type { CashSummaryData, Table } from '../types';

const LEGACY_POSITION_THRESHOLD = 100;
const FLOOR_PLAN_VIRTUAL_WIDTH = 1200;
const FLOOR_PLAN_VIRTUAL_HEIGHT = 720;

function resolveCanvasPosition(value: number, canvasSize: number, virtualSize: number) {
  if (value <= LEGACY_POSITION_THRESHOLD) {
    return Math.round((value / 100) * canvasSize);
  }
  return Math.round((value / virtualSize) * canvasSize);
}

function getTableShape(table: Table, activeZone: string) {
  const zoneLower = activeZone.toLowerCase();
  const nameLower = (table.name ?? '').toLowerCase();

  const isBar =
    zoneLower.includes('barra') ||
    nameLower.includes('barra') ||
    nameLower.includes('taburete');

  const isRound =
    zoneLower.includes('terraza') ||
    zoneLower.includes('calle') ||
    nameLower.includes('redonda') ||
    nameLower.includes('circular') ||
    nameLower.includes('mesa r');

  const isLarge =
    table.seats >= 6 ||
    nameLower.includes('grupo') ||
    nameLower.includes('comunal') ||
    nameLower.includes('reservad');

  if (isBar) return 'positioned-table--high-top';
  if (isLarge) return 'positioned-table--communal';
  if (isRound) return 'positioned-table--round';
  return 'positioned-table--square';
}

function getObjectVariant(table: Table) {
  const objectType = table.objectType?.toUpperCase() ?? '';
  const nameLower = (table.name ?? '').toLowerCase();

  if (objectType === 'BAR') return { className: 'positioned-table--bar-object', icon: '' };
  if (objectType === 'PLANT') return { className: 'positioned-table--plant-object', icon: '' };
  if (objectType === 'COLUMN') return { className: 'positioned-table--column-object', icon: '' };
  if (objectType === 'WALL') return { className: 'positioned-table--wall-object', icon: '' };
  if (nameLower.includes('caja')) return { className: 'positioned-table--host-object', icon: '' };
  return { className: `positioned-table--${table.objectType.toLowerCase()}-object`, icon: '' };
}

function ServiceIcon({ type }: { type: 'tables' | 'cash' | 'merge' | 'drawer' | 'kitchen' }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (type) {
    case 'tables':
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="8" height="6" rx="1.5" />
          <rect x="13" y="4" width="8" height="6" rx="1.5" />
          <rect x="3" y="14" width="8" height="6" rx="1.5" />
          <rect x="13" y="14" width="8" height="6" rx="1.5" />
        </svg>
      );
    case 'cash':
      return (
        <svg {...commonProps}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 10h10" />
          <path d="M7 14h5" />
          <circle cx="17" cy="14" r="1.5" />
        </svg>
      );
    case 'merge':
      return (
        <svg {...commonProps}>
          <path d="M7 7h5a4 4 0 0 1 4 4v6" />
          <path d="M7 17h5a4 4 0 0 0 4-4V7" />
          <path d="m14 9 2-2 2 2" />
          <path d="m14 15 2 2 2-2" />
        </svg>
      );
    case 'drawer':
      return (
        <svg {...commonProps}>
          <path d="M4 8h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
          <path d="M7 8V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V8" />
          <path d="M9 13h6" />
        </svg>
      );
    case 'kitchen':
      return (
        <svg {...commonProps}>
          <path d="M4 5v8" />
          <path d="M7 5v8" />
          <path d="M4 9h3" />
          <path d="M6 13v6" />
          <path d="M14 5c0 3 0 5 3 7v7" />
          <path d="M14 5v14" />
        </svg>
      );
  }
}

export function TableMapPage() {
  const navigate = useNavigate();
  const { tables, setTables, setActiveTable, isOnline, currentVenueId } = useAppStore();
  const [activeZone, setActiveZone] = useState<string>('');
  const [isKitchenNoteModalOpen, setIsKitchenNoteModalOpen] = useState(false);
  const [isSendingKitchenNote, setIsSendingKitchenNote] = useState(false);
  const [isOpeningDrawer, setIsOpeningDrawer] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourceTableId, setMergeSourceTableId] = useState<number | null>(null);
  const [mergeTargetTableId, setMergeTargetTableId] = useState<number | null>(null);
  const [isMergingTables, setIsMergingTables] = useState(false);
  const [isOpenTablesModalOpen, setIsOpenTablesModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashSummary, setCashSummary] = useState<CashSummaryData | null>(null);
  const [cashOpeningAmount, setCashOpeningAmount] = useState('0');
  const [cashOpeningNotes, setCashOpeningNotes] = useState('');
  const [cashCountedAmount, setCashCountedAmount] = useState('');
  const [cashNotes, setCashNotes] = useState('');
  const [cashMovementType, setCashMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [cashMovementAmount, setCashMovementAmount] = useState('');
  const [cashMovementDescription, setCashMovementDescription] = useState('');
  const [isLoadingCashSummary, setIsLoadingCashSummary] = useState(false);
  const [isOpeningCash, setIsOpeningCash] = useState(false);
  const [isSavingCashMovement, setIsSavingCashMovement] = useState(false);
  const [isClosingCash, setIsClosingCash] = useState(false);
  const previousReadyTablesRef = useRef<number[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Cargar mesas al montar el componente
  const loadTables = useCallback(async () => {
    if (!currentVenueId) return;

    if (!isOnline) {
      // Modo offline: usar caché local
      const cached = await getCachedTables();
      if (cached.length > 0) {
        setTables(cached as Table[]);
        toast.success('Modo offline: mostrando datos en caché');
      }
      return;
    }

    try {
      const data = await tablesApi.getAll(currentVenueId);
      setTables(data);
      const nextReadyTableIds = data.filter((table) => table.kitchenReady).map((table) => table.id);
      const newReadyTableIds = nextReadyTableIds.filter((id) => !previousReadyTablesRef.current.includes(id));
      if (previousReadyTablesRef.current.length > 0 && newReadyTableIds.length > 0) {
        const readyTables = data.filter((table) => newReadyTableIds.includes(table.id));
        toast.success(`Cocina lista en ${readyTables.map((table) => `mesa ${table.number}`).join(', ')}`);
      }
      previousReadyTablesRef.current = nextReadyTableIds;
      // Actualizar caché local
      await cacheTables(data);
    } catch (error) {
      console.error('[TableMap] Error cargando mesas:', error);
      const cached = await getCachedTables();
      if (cached.length > 0) setTables(cached as Table[]);
      toast.error('Error al cargar mesas. Usando datos locales.');
    }
  }, [isOnline, setTables, currentVenueId]);

  useEffect(() => {
    loadTables();
    const interval = setInterval(loadTables, 30_000);
    return () => clearInterval(interval);
  }, [loadTables]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    updateCanvasSize();

    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [tables.length, activeZone]);

  // Obtener zonas únicas de las mesas
  const zones = Array.from(new Set(tables.map((t) => t.zone ?? 'Principal')));

  // Inicializar zona activa si no está configurada o ya no existe
  useEffect(() => {
    if (zones.length > 0) {
      if (!activeZone || !zones.includes(activeZone)) {
        setActiveZone(zones[0]);
      }
    }
  }, [tables, activeZone]);

  const handleTableClick = (table: Table) => {
    setActiveTable(table);
    navigate(`/pos/${table.id}`);
  };

  // Filtrar mesas por la zona activa
  const filteredTables = tables.filter((t) => (t.zone ?? 'Principal') === activeZone);

  const statusColors: Record<Table['status'], string> = {
    FREE: 'var(--color-free)',
    OCCUPIED: 'var(--color-occupied)',
    ORDERING: 'var(--color-ordering)',
    BILL_REQUESTED: 'var(--color-bill)',
  };

  const statusLabels: Record<Table['status'], string> = {
    FREE: 'Libre',
    OCCUPIED: 'Ocupada',
    ORDERING: 'Comanda',
    BILL_REQUESTED: 'Cuenta',
  };

  const counts = tables.reduce<Partial<Record<Table['status'], number>>>(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }),
    {}
  );

  const handleSendKitchenNote = async ({ tableId, message }: { tableId: number; message: string }) => {
    if (!currentVenueId) return;

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
      console.error('[TableMap] Error enviando aviso a cocina:', error);
      toast.error('No se pudo enviar el aviso a cocina');
    } finally {
      setIsSendingKitchenNote(false);
    }
  };

  const handleOpenDrawer = async () => {
    if (!currentVenueId) return;

    try {
      setIsOpeningDrawer(true);
      await printersApi.openDrawer(currentVenueId);
      toast.success('Cajón abierto');
    } catch (error) {
      console.error('[TableMap] Error abriendo cajón:', error);
      toast.error('No se pudo abrir el cajón');
    } finally {
      setIsOpeningDrawer(false);
    }
  };

  const mergeCandidates = tables.filter((table) => table.objectType === 'TABLE' && table.status !== 'FREE');

  const handleMergeTables = async () => {
    if (!currentVenueId || !mergeSourceTableId || !mergeTargetTableId) {
      toast.error('Selecciona la mesa origen y la mesa destino');
      return;
    }

    if (mergeSourceTableId === mergeTargetTableId) {
      toast.error('La mesa origen y la destino deben ser distintas');
      return;
    }

    try {
      setIsMergingTables(true);
      await tablesApi.merge({
        venueId: currentVenueId,
        targetTableId: mergeTargetTableId,
        sourceTableIds: [mergeSourceTableId],
      });
      toast.success('Mesas unidas correctamente');
      setIsMergeModalOpen(false);
      setMergeSourceTableId(null);
      setMergeTargetTableId(null);
      await loadTables();
    } catch (error) {
      console.error('[TableMap] Error uniendo mesas:', error);
      toast.error('No se pudieron unir las mesas');
    } finally {
      setIsMergingTables(false);
    }
  };

  const openCashModal = async () => {
    if (!currentVenueId) return;

    try {
      setIsLoadingCashSummary(true);
      setIsCashModalOpen(true);
      const summary = await ticketsApi.getCashSummary(currentVenueId);
      setCashSummary(summary);
      setCashCountedAmount(summary.activeSession ? summary.expectedAmount.toFixed(2) : '');
    } catch (error) {
      console.error('[TableMap] Error cargando movimientos de caja:', error);
      toast.error('No se pudieron cargar los movimientos de caja');
      setIsCashModalOpen(false);
    } finally {
      setIsLoadingCashSummary(false);
    }
  };

  const refreshCashSummary = async () => {
    if (!currentVenueId) return;
    const summary = await ticketsApi.getCashSummary(currentVenueId);
    setCashSummary(summary);
    if (summary.activeSession) {
      setCashCountedAmount(summary.expectedAmount.toFixed(2));
    } else {
      setCashCountedAmount('');
    }
  };

  const handleOpenCash = async () => {
    if (!currentVenueId) return;
    const openingAmount = Number(cashOpeningAmount);
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      toast.error('Indica un importe de apertura valido');
      return;
    }

    try {
      setIsOpeningCash(true);
      await ticketsApi.openCash({
        venueId: currentVenueId,
        openingAmount,
        notes: cashOpeningNotes || undefined,
      });
      toast.success('Caja abierta correctamente');
      setCashOpeningAmount('0');
      setCashOpeningNotes('');
      await refreshCashSummary();
    } catch (error) {
      console.error('[TableMap] Error abriendo caja:', error);
      toast.error('No se pudo abrir la caja');
    } finally {
      setIsOpeningCash(false);
    }
  };

  const handleSaveCashMovement = async () => {
    if (!currentVenueId) return;
    const amount = Number(cashMovementAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Indica un importe valido');
      return;
    }
    if (!cashMovementDescription.trim()) {
      toast.error('Indica un concepto para el movimiento');
      return;
    }

    try {
      setIsSavingCashMovement(true);
      await ticketsApi.addCashMovement({
        venueId: currentVenueId,
        type: cashMovementType,
        amount,
        description: cashMovementDescription.trim(),
      });
      toast.success(cashMovementType === 'CASH_IN' ? 'Entrada de caja registrada' : 'Salida de caja registrada');
      setCashMovementAmount('');
      setCashMovementDescription('');
      await refreshCashSummary();
    } catch (error) {
      console.error('[TableMap] Error guardando movimiento de caja:', error);
      toast.error('No se pudo registrar el movimiento');
    } finally {
      setIsSavingCashMovement(false);
    }
  };

  const handleCloseCash = async () => {
    if (!currentVenueId) return;
    const countedAmount = Number(cashCountedAmount);
    if (!Number.isFinite(countedAmount) || countedAmount < 0) {
      toast.error('Indica el efectivo contado correctamente');
      return;
    }

    try {
      setIsClosingCash(true);
      await ticketsApi.closeCash({ venueId: currentVenueId, countedAmount, notes: cashNotes || undefined });
      toast.success('Cierre de caja registrado');
      setCashNotes('');
      setCashCountedAmount('');
      setIsCashModalOpen(false);
    } catch (error) {
      console.error('[TableMap] Error cerrando caja:', error);
      toast.error('No se pudo registrar el cierre de caja');
    } finally {
      setIsClosingCash(false);
    }
  };

  return (
    <main className="table-map-page">
      <aside className="table-map-service-rail" aria-label="Servicio de sala">
        <div className="table-map-service-rail__header">
          <span className="table-map-service-rail__eyebrow">Servicio</span>
          <strong className="table-map-service-rail__title">Sala</strong>
        </div>
        <button className="table-map-service-rail__btn" onClick={() => setIsOpenTablesModalOpen(true)}>
          <span className="table-map-service-rail__icon"><ServiceIcon type="tables" /></span>
          <span className="table-map-service-rail__btn-label">Mesas abiertas</span>
        </button>
        <button className="table-map-service-rail__btn" onClick={() => void openCashModal()}>
          <span className="table-map-service-rail__icon"><ServiceIcon type="cash" /></span>
          <span className="table-map-service-rail__btn-label">Movimientos caja</span>
        </button>
        <button className="table-map-service-rail__btn" onClick={() => setIsMergeModalOpen(true)}>
          <span className="table-map-service-rail__icon"><ServiceIcon type="merge" /></span>
          <span className="table-map-service-rail__btn-label">Unir mesas</span>
        </button>
        <button
          className="table-map-service-rail__btn"
          onClick={handleOpenDrawer}
          disabled={isOpeningDrawer}
        >
          <span className="table-map-service-rail__icon"><ServiceIcon type="drawer" /></span>
          <span className="table-map-service-rail__btn-label">{isOpeningDrawer ? 'Abriendo...' : 'Abrir cajon'}</span>
        </button>
        <button className="table-map-service-rail__btn table-map-service-rail__btn--accent" onClick={() => setIsKitchenNoteModalOpen(true)}>
          <span className="table-map-service-rail__icon"><ServiceIcon type="kitchen" /></span>
          <span className="table-map-service-rail__btn-label">Avisar a cocina</span>
        </button>
      </aside>

      <div className="table-map-content">
        {/* Contenedor del Mapa / Plano */}
        {tables.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 350,
            color: 'var(--color-text-muted)',
            gap: 'var(--space-4)',
            background: 'var(--color-surface-2)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-xl)'
          }}>
            <h3 style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>No hay mesas cargadas</h3>
            <p style={{ fontSize: '0.85rem' }}>Carga o añade mesas desde el panel de administración.</p>
          </div>
        ) : (
          <div className="floor-plan-container">
            <div ref={canvasRef} className="floor-plan-canvas">
              {/* Marca de agua del logo de fondo */}
              <div className="floor-plan-watermark" aria-hidden="true" />
              {zones.length > 0 && (
                <div className="floor-plan-overlay floor-plan-overlay--zones" aria-label="Salones">
                  <div className="zone-tabs">
                    {zones.map((zone) => (
                      <button
                        key={zone}
                        id={`tab-zone-${zone.replace(/\s+/g, '-').toLowerCase()}`}
                        className={`zone-tab ${activeZone === zone ? 'active' : ''}`}
                        onClick={() => setActiveZone(zone)}
                      >
                        {zone}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="floor-plan-overlay floor-plan-overlay--legend" aria-label="Estados de mesa">
                <div className="floor-plan-legend-card">
                  <span className="floor-plan-legend-card__label">Estado de las mesas</span>
                  <div className="table-map-page__legend">
                    {(Object.keys(statusLabels) as Table['status'][]).map((status) => (
                      <div className="legend-item" key={status}>
                        <div
                          className="legend-dot"
                          style={{
                            backgroundColor: statusColors[status],
                            boxShadow: status === 'BILL_REQUESTED' ? '0 0 10px var(--color-bill)' : 'none',
                            animation: status === 'BILL_REQUESTED' ? 'pulse-red 2s infinite ease-in-out' : 'none'
                          }}
                        />
                        <span className="legend-item__label">{statusLabels[status]}</span>
                        {counts[status] !== undefined && (
                          <span className="legend-item__count">({counts[status]})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            {filteredTables.length === 0 ? (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.9rem'
              }}>
                Ninguna mesa configurada en la zona "{activeZone}".
              </div>
            ) : (
              filteredTables.map((table) => {
                if (table.objectType && table.objectType !== 'TABLE') {
                  const objectVariant = getObjectVariant(table);
                  return (
                    <div
                      key={table.id}
                      className={`positioned-table-object ${objectVariant.className}`}
                      style={{
                        left: `${resolveCanvasPosition(table.posX, canvasSize.width || FLOOR_PLAN_VIRTUAL_WIDTH, FLOOR_PLAN_VIRTUAL_WIDTH)}px`,
                        top: `${resolveCanvasPosition(table.posY, canvasSize.height || FLOOR_PLAN_VIRTUAL_HEIGHT, FLOOR_PLAN_VIRTUAL_HEIGHT)}px`,
                        ...(table.width && table.width > 0 ? { width: `${table.width}px` } : {}),
                        ...(table.height && table.height > 0 ? { height: `${table.height}px` } : {}),
                      }}
                      title={table.name || table.objectType}
                    >
                      {objectVariant.icon && (
                        <span className="positioned-table-object__icon" aria-hidden="true">
                          {objectVariant.icon}
                        </span>
                      )}
                      {table.name && (
                        <span className="positioned-table-object__label">
                          {table.name}
                        </span>
                      )}
                    </div>
                  );
                }

                const shapeClass = getTableShape(table, activeZone);
                const statusClass = `positioned-table--${table.status.toLowerCase()}`;
                const readyClass = table.kitchenReady ? 'positioned-table--kitchen-ready' : '';
                const displayName = table.name?.trim() || `Mesa ${table.number}`;

                return (
                  <button
                    key={table.id}
                    id={`table-map-node-${table.id}`}
                    className={`positioned-table ${shapeClass} ${statusClass} ${readyClass}`}
                    style={{
                      left: `${resolveCanvasPosition(table.posX, canvasSize.width || FLOOR_PLAN_VIRTUAL_WIDTH, FLOOR_PLAN_VIRTUAL_WIDTH)}px`,
                      top: `${resolveCanvasPosition(table.posY, canvasSize.height || FLOOR_PLAN_VIRTUAL_HEIGHT, FLOOR_PLAN_VIRTUAL_HEIGHT)}px`,
                      ...(table.width && table.width > 0 ? { width: `${table.width}px` } : {}),
                      ...(table.height && table.height > 0 ? { height: `${table.height}px` } : {}),
                    }}
                    onClick={() => handleTableClick(table)}
                    title={`Mesa ${table.number} (${table.seats} pax) - ${statusLabels[table.status]}`}
                  >
                    <span className="positioned-table__halo" aria-hidden="true" />
                    <span className="positioned-table__label positioned-table__label--primary">
                      {displayName}
                    </span>
                    <span className="positioned-table__number positioned-table__number--secondary">
                      #{table.number}
                    </span>
                    {table.kitchenReady && (
                      <span className="positioned-table__ready-badge">Lista</span>
                    )}
                    <span className="positioned-table__seats">
                      {table.seats} pax
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        )}

      {isKitchenNoteModalOpen && (
        <KitchenNoteModal
          tables={tables}
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
              {mergeCandidates.length === 0 ? (
                <div className="admin-modifier-empty">No hay mesas abiertas ahora mismo.</div>
              ) : (
                mergeCandidates
                  .sort((a, b) => a.number - b.number)
                  .map((table) => (
                    <button
                      key={table.id}
                      className="pos-open-tables-list__item"
                      onClick={() => {
                        setIsOpenTablesModalOpen(false);
                        handleTableClick(table);
                      }}
                    >
                      <strong>Mesa {table.number}</strong>
                      <span>{table.name ?? table.zone ?? 'Sala'}</span>
                    </button>
                  ))
              )}
            </div>
            <div className="modal__actions">
              <button className="btn btn-secondary" onClick={() => setIsOpenTablesModalOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {isCashModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCashModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 980, width: '100%' }} onClick={(event) => event.stopPropagation()}>
            <h3 className="modal__title">Movimientos de caja</h3>
            {isLoadingCashSummary || !cashSummary ? (
              <div className="admin-loading">Cargando movimientos...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {!cashSummary.activeSession ? (
                  <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: 6 }}>No hay caja abierta</strong>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.86rem' }}>
                        Abre caja antes de registrar movimientos y cierres.
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) minmax(0, 1fr)', gap: 'var(--space-4)' }}>
                      <div>
                        <label className="form-label" htmlFor="cash-opening-amount">Fondo inicial</label>
                        <input
                          id="cash-opening-amount"
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashOpeningAmount}
                          onChange={(event) => setCashOpeningAmount(event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label" htmlFor="cash-opening-notes">Notas de apertura</label>
                        <textarea
                          id="cash-opening-notes"
                          className="modal__textarea"
                          value={cashOpeningNotes}
                          onChange={(event) => setCashOpeningNotes(event.target.value)}
                          placeholder="Cambio inicial, observaciones..."
                        />
                      </div>
                    </div>
                    <div className="modal__actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={() => void handleOpenCash()} disabled={isOpeningCash}>
                        {isOpeningCash ? 'Abriendo...' : 'Abrir caja'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="admin-summary-grid">
                  <article className="admin-summary-card">
                    <span className="admin-summary-card__label">Fondo inicial</span>
                    <strong className="admin-summary-card__value">{Number(cashSummary.openingAmount).toFixed(2)} €</strong>
                  </article>
                  <article className="admin-summary-card">
                    <span className="admin-summary-card__label">Total facturado</span>
                    <strong className="admin-summary-card__value">{Number(cashSummary.billedTotal).toFixed(2)} €</strong>
                  </article>
                  <article className="admin-summary-card">
                    <span className="admin-summary-card__label">Entradas manuales</span>
                    <strong className="admin-summary-card__value">{Number(cashSummary.manualInTotal).toFixed(2)} €</strong>
                  </article>
                  <article className="admin-summary-card">
                    <span className="admin-summary-card__label">Salidas manuales</span>
                    <strong className="admin-summary-card__value">{Number(cashSummary.manualOutTotal).toFixed(2)} €</strong>
                  </article>
                  <article className="admin-summary-card">
                    <span className="admin-summary-card__label">Tickets desde último cierre</span>
                    <strong className="admin-summary-card__value">{cashSummary.ticketCount}</strong>
                  </article>
                  <article className="admin-summary-card">
                    <span className="admin-summary-card__label">Esperado en caja</span>
                    <strong className="admin-summary-card__value">{Number(cashSummary.expectedAmount).toFixed(2)} €</strong>
                  </article>
                </div>

                <div className="print-preview">
                  <div className="print-preview__paper">
                    Caja abierta por: {cashSummary.activeSession.openedBy.name}
                    {'\n'}
                    Apertura: {new Date(cashSummary.activeSession.openedAt).toLocaleString('es-ES')}
                    {'\n'}
                    Desde: {new Date(cashSummary.periodStart).toLocaleString('es-ES')}
                    {'\n'}
                    Hasta: {new Date(cashSummary.periodEnd).toLocaleString('es-ES')}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 360px)', gap: 'var(--space-4)' }}>
                  <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                      <strong>Movimientos manuales</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Entradas y salidas</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 140px minmax(0, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                      <select className="form-select" value={cashMovementType} onChange={(event) => setCashMovementType(event.target.value as 'CASH_IN' | 'CASH_OUT')}>
                        <option value="CASH_IN">Entrada</option>
                        <option value="CASH_OUT">Salida</option>
                      </select>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Importe"
                        value={cashMovementAmount}
                        onChange={(event) => setCashMovementAmount(event.target.value)}
                      />
                      <input
                        className="form-input"
                        type="text"
                        placeholder="Concepto"
                        value={cashMovementDescription}
                        onChange={(event) => setCashMovementDescription(event.target.value)}
                      />
                    </div>
                    <div className="modal__actions" style={{ justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
                      <button className="btn btn-secondary" onClick={() => void handleSaveCashMovement()} disabled={isSavingCashMovement}>
                        {isSavingCashMovement ? 'Guardando...' : 'Registrar movimiento'}
                      </button>
                    </div>
                    <div className="pos-open-tables-list">
                      {cashSummary.movements.length === 0 ? (
                        <div className="admin-modifier-empty">Sin movimientos todavía.</div>
                      ) : (
                        cashSummary.movements
                          .filter((movement) => movement.type !== 'TICKET')
                          .map((movement) => (
                            <div key={movement.id} className="pos-open-tables-list__item" style={{ cursor: 'default' }}>
                              <strong>{movement.type === 'OPENING' ? 'Apertura' : movement.type === 'CASH_IN' ? 'Entrada' : 'Salida'}</strong>
                              <span>
                                {new Date(movement.createdAt).toLocaleString('es-ES')} · {movement.user.name} · {Number(movement.amount).toFixed(2)} €
                              </span>
                              {movement.description ? <span>{movement.description}</span> : null}
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                    <strong style={{ display: 'block', marginBottom: 'var(--space-3)' }}>Cierre y arqueo</strong>
                    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                      <div>
                        <label className="form-label" htmlFor="cash-counted-amount">Efectivo contado</label>
                        <input
                          id="cash-counted-amount"
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashCountedAmount}
                          onChange={(event) => setCashCountedAmount(event.target.value)}
                        />
                      </div>
                      <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: '#fffdf9', border: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: '0.86rem' }}>
                          <span>Esperado</span>
                          <strong>{Number(cashSummary.expectedAmount).toFixed(2)} €</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: '0.9rem', marginTop: 8 }}>
                          <span>Descuadre</span>
                          <strong style={{ color: Number(cashCountedAmount || 0) - Number(cashSummary.expectedAmount) === 0 ? 'var(--color-text-primary)' : 'var(--color-danger)' }}>
                            {(Number(cashCountedAmount || 0) - Number(cashSummary.expectedAmount)).toFixed(2)} €
                          </strong>
                        </div>
                      </div>
                      <div>
                        <label className="form-label" htmlFor="cash-close-notes">Notas del cierre</label>
                        <textarea
                          id="cash-close-notes"
                          className="modal__textarea"
                          value={cashNotes}
                          onChange={(event) => setCashNotes(event.target.value)}
                          placeholder="Observaciones del cierre"
                        />
                      </div>
                      <button className="btn btn-primary" onClick={() => void handleCloseCash()} disabled={isClosingCash}>
                        {isClosingCash ? 'Registrando...' : 'Realizar cierre de caja'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pos-open-tables-list">
                  {cashSummary.tickets.length === 0 ? (
                    <div className="admin-modifier-empty">No hay movimientos desde el último cierre.</div>
                  ) : (
                    cashSummary.tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        className="pos-open-tables-list__item"
                        onClick={() => navigate('/admin/tickets')}
                      >
                        <strong>{ticket.invoiceCode}</strong>
                        <span>
                          {new Date(ticket.issuedAt).toLocaleString('es-ES')} · {Number(ticket.total).toFixed(2)} €
                        </span>
                      </button>
                    ))
                  )}
                </div>
                  </>
                )}

                <div className="modal__actions">
                  <button className="btn btn-secondary" onClick={() => setIsCashModalOpen(false)}>Cerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {isMergeModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMergeModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="modal__title">Unir mesas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="form-label" htmlFor="merge-source-table">Mesa origen</label>
                <select
                  id="merge-source-table"
                  className="input"
                  value={mergeSourceTableId ?? ''}
                  onChange={(event) => setMergeSourceTableId(Number(event.target.value) || null)}
                >
                  <option value="">Selecciona mesa origen</option>
                  {mergeCandidates.map((table) => (
                    <option key={`source-${table.id}`} value={table.id}>
                      Mesa {table.number}{table.name ? ` · ${table.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="merge-target-table">Mesa destino</label>
                <select
                  id="merge-target-table"
                  className="input"
                  value={mergeTargetTableId ?? ''}
                  onChange={(event) => setMergeTargetTableId(Number(event.target.value) || null)}
                >
                  <option value="">Selecciona mesa destino</option>
                  {mergeCandidates.map((table) => (
                    <option key={`target-${table.id}`} value={table.id}>
                      Mesa {table.number}{table.name ? ` · ${table.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal__actions">
                <button className="btn btn-ghost" onClick={() => setIsMergeModalOpen(false)}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={() => void handleMergeTables()} disabled={isMergingTables}>
                  {isMergingTables ? 'Uniendo...' : 'Unir mesas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
