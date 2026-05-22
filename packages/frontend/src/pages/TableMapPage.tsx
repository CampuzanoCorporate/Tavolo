/**
 * TAVOLO POS — Página Plano de Mesas Interactivo
 * Vista principal con plano de planta premium, selector de zonas y estados de color.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStore } from '../store/useAppStore';
import { ordersApi, printersApi, tablesApi } from '../services/api';
import { cacheTables, getCachedTables } from '../services/offlineStorage';
import { KitchenNoteModal } from '../components/pos/KitchenNoteModal';
import type { Table } from '../types';

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

export function TableMapPage() {
  const navigate = useNavigate();
  const { tables, setTables, setActiveTable, isOnline, currentVenueId } = useAppStore();
  const [activeZone, setActiveZone] = useState<string>('');
  const [isKitchenNoteModalOpen, setIsKitchenNoteModalOpen] = useState(false);
  const [isSendingKitchenNote, setIsSendingKitchenNote] = useState(false);
  const [isOpeningDrawer, setIsOpeningDrawer] = useState(false);

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

  return (
    <main className="table-map-page">
      <div className="table-map-toolbar">
        {zones.length > 0 && (
          <section className="table-map-toolbar__panel table-map-toolbar__panel--zones" aria-label="Salones">
            <span className="table-map-toolbar__label">Salones</span>
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
          </section>
        )}

        <section className="table-map-toolbar__panel table-map-toolbar__panel--legend" aria-label="Estados de mesa">
          <span className="table-map-toolbar__label">Estado de las mesas</span>
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
        </section>

        <section className="table-map-toolbar__panel table-map-toolbar__panel--service" aria-label="Acciones de servicio">
          <span className="table-map-toolbar__label">Servicio</span>
          <div className="service-panel__actions">
            <button
              className="btn btn-secondary"
              onClick={handleOpenDrawer}
              type="button"
              disabled={isOpeningDrawer}
            >
              {isOpeningDrawer ? 'Abriendo...' : 'Abrir cajón'}
            </button>
            <button
              className="btn btn-send-kitchen"
              onClick={() => setIsKitchenNoteModalOpen(true)}
              type="button"
            >
              Avisar a cocina
            </button>
          </div>
        </section>
      </div>

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
          <div className="floor-plan-canvas">
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
                        left: `${table.posX}%`,
                        top: `${table.posY}%`,
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

                return (
                  <button
                    key={table.id}
                    id={`table-map-node-${table.id}`}
                    className={`positioned-table ${shapeClass} ${statusClass}`}
                    style={{
                      left: `${table.posX}%`,
                      top: `${table.posY}%`,
                      ...(table.width && table.width > 0 ? { width: `${table.width}px` } : {}),
                      ...(table.height && table.height > 0 ? { height: `${table.height}px` } : {}),
                    }}
                    onClick={() => handleTableClick(table)}
                    title={`Mesa ${table.number} (${table.seats} pax) - ${statusLabels[table.status]}`}
                  >
                    <span className="positioned-table__halo" aria-hidden="true" />
                    <span className="positioned-table__number">
                      {table.number}
                    </span>
                    {table.name && (
                      <span className="positioned-table__label">
                        {table.name}
                      </span>
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
    </main>
  );
}
