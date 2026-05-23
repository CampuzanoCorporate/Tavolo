/**
 * TAVOLO POS — Admin: Gestión de Mesas y Plano de Distribución
 * Permite listar y posicionar de forma interactiva (Drag & Drop) las mesas por zona.
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import type { Table, Venue } from '../../types';

const LEGACY_POSITION_THRESHOLD = 100;
const FLOOR_PLAN_VIRTUAL_WIDTH = 1200;
const FLOOR_PLAN_VIRTUAL_HEIGHT = 720;

function resolveCanvasPosition(value: number, canvasSize: number, virtualSize: number) {
  if (value <= LEGACY_POSITION_THRESHOLD) {
    return Math.round((value / 100) * canvasSize);
  }
  return Math.round((value / virtualSize) * canvasSize);
}

export function TablesAdminPage() {
  const { id: venueIdStr } = useParams<{ id: string }>();
  const venueId = parseInt(venueIdStr!, 10);
  const navigate = useNavigate();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // View States & Refs
  const [activeZone, setActiveZone] = useState<string>('Principal');
  const [draggingTable, setDraggingTable] = useState<Table | null>(null);
  const [selectedMenuTableId, setSelectedMenuTableId] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Form State
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [number, setNumber] = useState<number>(1);
  const [name, setName] = useState('');
  const [seats, setSeats] = useState<number>(4);
  const [zone, setZone] = useState('Principal');
  const [objectType, setObjectType] = useState<string>('TABLE');
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);

  const loadData = async () => {
    try {
      const v = await adminApi.getVenue(venueId);
      setVenue(v);
      const t = await adminApi.getTables(venueId);
      setTables(t);
      
      // Auto-set active zone if not yet configured or no tables exist
      if (t.length > 0) {
        const uniqueZones = Array.from(new Set(t.map((table: Table) => table.zone ?? 'Principal')));
        if (uniqueZones.length > 0 && !uniqueZones.includes(activeZone)) {
          setActiveZone(uniqueZones[0]);
        }
      }
    } catch {
      toast.error('Error cargando mesas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [venueId]);

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
  }, [loading, activeZone, tables.length]);

  const openNewTableModal = () => {
    setSelectedTableId(null);
    const maxNum = tables.reduce((max, t) => (t.number > max ? t.number : max), 0);
    setNumber(maxNum + 1);
    setName('');
    setSeats(4);
    setZone(activeZone || 'Principal');
    setObjectType('TABLE');
    setWidth(0);
    setHeight(0);
    setModalOpen(true);
  };

  const openEditTableModal = (t: Table) => {
    setSelectedTableId(t.id);
    setNumber(t.number);
    setName(t.name ?? '');
    setSeats(t.seats);
    setZone(t.zone ?? 'Principal');
    setObjectType(t.objectType || 'TABLE');
    setWidth(t.width ?? 0);
    setHeight(t.height ?? 0);
    setModalOpen(true);
  };

  const handleDelete = async (tableId: number) => {
    if (!window.confirm('¿Seguro que quieres eliminar este elemento?')) return;
    try {
      await adminApi.deleteTable(tableId);
      toast.success('Elemento eliminado');
      loadData();
    } catch {
      toast.error('Error eliminando el elemento');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isTable = objectType === 'TABLE';
      const trimmedName = name.trim();

      if (isTable && !trimmedName) {
        toast.error('La mesa debe tener un nombre visible');
        setSaving(false);
        return;
      }

      const assignedSeats = isTable ? seats : 0;
      
      let assignedNumber = number;
      if (!isTable) {
        if (selectedTableId) {
          const currentTable = tables.find(t => t.id === selectedTableId);
          assignedNumber = currentTable?.number ?? (tables.reduce((max, t) => (t.number > max ? t.number : max), 0) + 1);
        } else {
          assignedNumber = tables.reduce((max, t) => (t.number > max ? t.number : max), 0) + 1;
        }
      }

      const payload = {
        number: assignedNumber,
        name: trimmedName || undefined,
        seats: assignedSeats,
        zone: zone || undefined,
        objectType,
        width,
        height,
      };

      const fallbackCenterX = Math.round(FLOOR_PLAN_VIRTUAL_WIDTH / 2);
      const fallbackCenterY = Math.round(FLOOR_PLAN_VIRTUAL_HEIGHT / 2);

      if (selectedTableId) {
        // Conservar coordenadas previas al editar en el formulario
        const prevTable = tables.find(t => t.id === selectedTableId);
        await adminApi.updateTable(selectedTableId, {
          ...payload,
          posX: prevTable?.posX ?? fallbackCenterX,
          posY: prevTable?.posY ?? fallbackCenterY,
        });
        toast.success(`${isTable ? 'Mesa' : 'Objeto'} actualizado`);
      } else {
        // Nuevos elementos nacen en el centro del lienzo de diseño
        await adminApi.createTable(venueId, {
          ...payload,
          posX: fallbackCenterX,
          posY: fallbackCenterY,
        });
        toast.success(`${isTable ? 'Mesa' : 'Objeto'} creado`);
      }
      setModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error guardando';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Drag & Drop Handlers (Visual Planner) ───────────────────────────────────

  const tablesRef = useRef(tables);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const handleStartDrag = (table: Table, e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartPos.current = { x: clientX, y: clientY };

    if ('clientX' in e) {
      e.preventDefault();
    }
    setDraggingTable(table);
  };

  useEffect(() => {
    if (!draggingTable) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();

      // Guardamos coordenadas absolutas del lienzo para que no cambien al variar el tamaño visible.
      const xPx = Math.max(
        0,
        Math.min(
          FLOOR_PLAN_VIRTUAL_WIDTH,
          Math.round(((clientX - rect.left) / rect.width) * FLOOR_PLAN_VIRTUAL_WIDTH),
        ),
      );
      const yPx = Math.max(
        0,
        Math.min(
          FLOOR_PLAN_VIRTUAL_HEIGHT,
          Math.round(((clientY - rect.top) / rect.height) * FLOOR_PLAN_VIRTUAL_HEIGHT),
        ),
      );

      // Usamos callback funcional para evitar depender del estado 'tables'
      setTables((prevTables) =>
        prevTables.map((t) =>
          t.id === draggingTable.id ? { ...t, posX: xPx, posY: yPx } : t
        )
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleEnd = async (e: MouseEvent | TouchEvent) => {
      const latestTables = tablesRef.current;
      const targetTable = latestTables.find((t) => t.id === draggingTable.id);
      
      setDraggingTable(null);

      let isClick = false;
      if (dragStartPos.current) {
        const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : (e as MouseEvent).clientY;
        const dx = clientX - dragStartPos.current.x;
        const dy = clientY - dragStartPos.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 6) {
          isClick = true;
        }
      }

      if (isClick && targetTable) {
        setSelectedMenuTableId((prev) => (prev === targetTable.id ? null : targetTable.id));
      } else if (targetTable) {
        try {
          await adminApi.updateTable(targetTable.id, {
            number: targetTable.number,
            name: targetTable.name || undefined,
            seats: targetTable.seats,
            zone: targetTable.zone || undefined,
            posX: targetTable.posX,
            posY: targetTable.posY,
            objectType: targetTable.objectType,
            width: targetTable.width ?? 0,
            height: targetTable.height ?? 0,
          });
          toast.success(`${targetTable.objectType === 'TABLE' ? 'Mesa' : 'Objeto'} posicionado`, { id: 'drag-toast' });
        } catch (err) {
          toast.error('Error guardando posición');
          console.error('[AdminTables] Error saving position:', err);
        }
      }

      dragStartPos.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [draggingTable]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('floor-plan-canvas')) {
      setSelectedMenuTableId(null);
    }
  };

  // Obtener zonas de las mesas configuradas en la sede
  const zones = Array.from(new Set(tables.map((t) => t.zone ?? 'Principal')));
  if (zones.length === 0) zones.push('Principal');

  const filteredTables = tables.filter((t) => (t.zone ?? 'Principal') === activeZone);

  if (loading) return <div className="admin-loading">Cargando plano...</div>;

  return (
    <div className="admin-page">
      {/* Cabecera Admin */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Diseñador de plano — {venue?.name}</h1>
          <p className="admin-page-subtitle">Configura zonas y coloca mesas u objetos decorativos arrastrándolos directamente</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/venues')}>
            Volver a sedes
          </button>
          <button id="btn-new-table" className="btn btn-primary" onClick={openNewTableModal}>
            + Nuevo Elemento
          </button>
        </div>
      </div>

      {/* DISEÑADOR */}
      <section className="admin-section" style={{ padding: 'var(--space-5)' }}>
        {/* Tabs Selector de Zonas */}
        <div className="zone-tabs" style={{ marginBottom: 'var(--space-4)' }}>
          {zones.map((z) => (
            <button
              key={z}
              className={`zone-tab ${activeZone === z ? 'active' : ''}`}
              onClick={() => setActiveZone(z)}
            >
              {z}
            </button>
          ))}
        </div>

        <div className="map-builder-grid-guide">
          <span className="map-builder-grid-guide-icon">i</span>
          <div>
            <strong>Consejo de Uso:</strong> Pulsa sobre cualquier mesa o elemento decorativo para editarlo o eliminarlo. Mantén pulsado y arrastra para colocarlo en su posición física exacta. Los cambios de posición se guardan al instante de soltar el elemento.
          </div>
        </div>

        {tables.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 250,
            color: 'var(--color-text-muted)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-xl)'
          }}>
            No hay elementos configurados. Haz clic en "+ Nuevo Elemento" para empezar a diseñar tu local.
          </div>
        ) : (
          <div className="floor-plan-container">
            <div
              ref={canvasRef}
              className="floor-plan-canvas"
              onClick={handleCanvasClick}
            >
              {filteredTables.length === 0 ? (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-muted)'
                }}>
                  No hay elementos configurados en la zona "{activeZone}".
                </div>
              ) : (
                filteredTables.map((table) => {
                  const draggingClass = draggingTable?.id === table.id ? 'positioned-table--dragging' : '';
                  const isMenuOpen = selectedMenuTableId === table.id;

                  const renderContextMenu = () => (
                    isMenuOpen && (
                      <div
                        className="table-context-menu"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="context-menu-btn"
                          onClick={() => {
                            openEditTableModal(table);
                            setSelectedMenuTableId(null);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="context-menu-btn"
                          onClick={() => {
                            toast('Mantén pulsado y arrastra el elemento para moverlo.', { icon: '🫱' });
                            setSelectedMenuTableId(null);
                          }}
                        >
                          🫱 Mover
                        </button>
                        <button
                          type="button"
                          className="context-menu-btn context-menu-btn--danger"
                          onClick={() => {
                            handleDelete(table.id);
                            setSelectedMenuTableId(null);
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    )
                  );

                  if (table.objectType && table.objectType !== 'TABLE') {
                    const objectClass = `positioned-table--${table.objectType.toLowerCase()}-object`;
                    return (
                      <div
                        key={table.id}
                        className={`positioned-table positioned-table--draggable ${objectClass} ${draggingClass}`}
                        style={{
                          left: `${resolveCanvasPosition(table.posX, canvasSize.width || FLOOR_PLAN_VIRTUAL_WIDTH, FLOOR_PLAN_VIRTUAL_WIDTH)}px`,
                          top: `${resolveCanvasPosition(table.posY, canvasSize.height || FLOOR_PLAN_VIRTUAL_HEIGHT, FLOOR_PLAN_VIRTUAL_HEIGHT)}px`,
                          cursor: 'move',
                          ...(table.width && table.width > 0 ? { width: `${table.width}px` } : {}),
                          ...(table.height && table.height > 0 ? { height: `${table.height}px` } : {}),
                        }}
                        onMouseDown={(e) => handleStartDrag(table, e)}
                        onTouchStart={(e) => handleStartDrag(table, e)}
                        title={`Haz clic para ver opciones o arrastra para mover: ${table.name || table.objectType}`}
                      >
                        <span className="positioned-table-object__label" style={{ fontWeight: 600, fontSize: '0.75rem' }}>
                          {table.name || table.objectType}
                        </span>
                        {renderContextMenu()}
                      </div>
                    );
                  }

                  const zoneLower = activeZone.toLowerCase();
                  const nameLower = (table.name ?? '').toLowerCase();
                  
                  const isBar = zoneLower.includes('barra') || nameLower.includes('barra') || nameLower.includes('taburete');
                  const isRound = zoneLower.includes('terraza') || zoneLower.includes('calle') || nameLower.includes('redonda') || nameLower.includes('mesa r');
                  
                  const shapeClass = isBar 
                    ? 'positioned-table--bar' 
                    : (isRound ? 'positioned-table--round' : 'positioned-table--square');

                  const statusClass = `positioned-table--${table.status.toLowerCase()}`;
                  const displayName = table.name?.trim() || `Mesa ${table.number}`;

                  return (
                    <div
                      key={table.id}
                      className={`positioned-table positioned-table--draggable ${shapeClass} ${statusClass} ${draggingClass}`}
                      style={{
                        left: `${resolveCanvasPosition(table.posX, canvasSize.width || FLOOR_PLAN_VIRTUAL_WIDTH, FLOOR_PLAN_VIRTUAL_WIDTH)}px`,
                        top: `${resolveCanvasPosition(table.posY, canvasSize.height || FLOOR_PLAN_VIRTUAL_HEIGHT, FLOOR_PLAN_VIRTUAL_HEIGHT)}px`,
                        ...(table.width && table.width > 0 ? { width: `${table.width}px` } : {}),
                        ...(table.height && table.height > 0 ? { height: `${table.height}px` } : {}),
                      }}
                      onMouseDown={(e) => handleStartDrag(table, e)}
                      onTouchStart={(e) => handleStartDrag(table, e)}
                      title="Haz clic para ver opciones o arrastra para mover esta mesa"
                    >
                      <span className="positioned-table__label positioned-table__label--primary">
                        {displayName}
                      </span>
                      <span className="positioned-table__number positioned-table__number--secondary">
                        #{table.number}
                      </span>
                      <span className="positioned-table__seats">
                        {table.seats} pax
                      </span>
                      {renderContextMenu()}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      {/* Modal Form (Añadir / Editar) */}
      {modalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: 450, width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedTableId 
                  ? (objectType === 'TABLE' ? 'Editar mesa' : 'Editar objeto') 
                  : (objectType === 'TABLE' ? 'Nueva mesa' : 'Nuevo objeto')}
              </h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              
              <div className="form-group">
                <label className="form-label" htmlFor="table-object-type">Tipo de Elemento *</label>
                <select
                  id="table-object-type"
                  className="form-select"
                  value={objectType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setObjectType(val);
                    if (val !== 'TABLE') {
                      setSeats(0);
                    }
                  }}
                >
                  <option value="TABLE">Mesa Interactiva</option>
                  <option value="BAR">Barra / Mostrador</option>
                  <option value="PLANT">Planta / Decoración</option>
                  <option value="COLUMN">Columna / Pilar</option>
                  <option value="WALL">Pared / Tabique</option>
                </select>
              </div>

              {objectType === 'TABLE' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="table-number">Número de Mesa *</label>
                  <input
                    id="table-number"
                    type="number"
                    className="form-input"
                    value={number}
                    onChange={(e) => setNumber(parseInt(e.target.value, 10))}
                    required
                    min={1}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="table-name">
                  {objectType === 'TABLE' ? 'Nombre visible de la mesa *' : 'Nombre / Identificador del Objeto'}
                </label>
                <input
                  id="table-name"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={objectType === 'TABLE' ? 'Ej: Terraza 4, Reservado, Ventana' : 'Ej: Barra Principal, Planta Izq'}
                  required={objectType === 'TABLE'}
                />
              </div>

              <div className={objectType === 'TABLE' ? "form-row-2" : "form-group"}>
                {objectType === 'TABLE' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="table-seats">Capacidad (Asientos) *</label>
                    <input
                      id="table-seats"
                      type="number"
                      className="form-input"
                      value={seats}
                      onChange={(e) => setSeats(parseInt(e.target.value, 10))}
                      required
                      min={1}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="table-zone">Zona / Planta *</label>
                  <select
                    id="table-zone"
                    className="form-select"
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                  >
                    <option value="Principal">Sala Principal</option>
                    <option value="Terraza">Terraza</option>
                    <option value="Barra">Barra</option>
                    <option value="Planta Alta">Planta Alta</option>
                    <option value="Salón">Salón Comedor</option>
                    <option value="Calle">Calle / Exterior</option>
                  </select>
                </div>
              </div>

              {/* Controles de Redimensionamiento (Ancho y Alto) */}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="table-width">Ancho (px) <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 'normal' }}>(0 = Auto)</span></label>
                  <input
                    id="table-width"
                    type="number"
                    className="form-input"
                    value={width}
                    onChange={(e) => setWidth(parseInt(e.target.value, 10) || 0)}
                    min={0}
                    placeholder="Ej: 140"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="table-height">Alto (px) <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 'normal' }}>(0 = Auto)</span></label>
                  <input
                    id="table-height"
                    type="number"
                    className="form-input"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value, 10) || 0)}
                    min={0}
                    placeholder="Ej: 48"
                  />
                </div>
              </div>

              {/* Leyenda y Guía de Referencias de píxeles */}
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-muted)',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                marginTop: '-4px',
                lineHeight: 1.4
              }}>
                📏 <strong>Guía de Referencia:</strong> Mesa (76x76), Barra (140x48), Planta (44x44), Columna (38x38), Pared (160x8).
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button id="btn-save-table" type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
