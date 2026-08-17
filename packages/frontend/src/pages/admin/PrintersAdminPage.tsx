/**
 * TAVOLO POS — Admin: Gestión de Impresoras
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi, printersApi } from '../../services/api';
import type { Printer, PrinterConnectionType, ProductionStation, Venue } from '../../types';

export function PrintersAdminPage() {
  const { id: venueIdStr } = useParams<{ id: string }>();
  const venueId = parseInt(venueIdStr!, 10);
  const navigate = useNavigate();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [stations, setStations] = useState<ProductionStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [stationModalOpen, setStationModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSamples, setPreviewSamples] = useState<{ ticket: string; kitchen: string } | null>(null);
  const [previewTab, setPreviewTab] = useState<'ticket' | 'kitchen'>('ticket');
  const [systemPrinters, setSystemPrinters] = useState<string[]>([]);

  // Form State
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>('NETWORK');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState<number>(9100);
  const [systemName, setSystemName] = useState('');
  const [type, setType] = useState<'RECEIPT' | 'KITCHEN' | 'BAR'>('RECEIPT');
  const [isActive, setIsActive] = useState(true);

  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [stationName, setStationName] = useState('');
  const [stationCode, setStationCode] = useState('');
  const [stationPrinterId, setStationPrinterId] = useState<number | null>(null);
  const [stationSortOrder, setStationSortOrder] = useState(0);
  const [stationIsActive, setStationIsActive] = useState(true);

  const loadData = async () => {
    try {
      const v = await adminApi.getVenue(venueId);
      setVenue(v);
      const [p, s] = await Promise.all([
        adminApi.getPrinters(venueId),
        adminApi.getProductionStations(venueId),
      ]);
      setPrinters(p);
      setStations(s);
      try {
        setSystemPrinters(await printersApi.getSystemPrinters());
      } catch {
        setSystemPrinters([]);
      }
    } catch {
      toast.error('Error cargando impresoras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [venueId]);

  const openNewPrinterModal = () => {
    setSelectedPrinterId(null);
    setName('');
    setConnectionType('NETWORK');
    setIpAddress('192.168.1.');
    setPort(9100);
    setSystemName('');
    setType('RECEIPT');
    setIsActive(true);
    setModalOpen(true);
  };

  const openNewStationModal = () => {
    setSelectedStationId(null);
    setStationName('');
    setStationCode('');
    setStationPrinterId(null);
    setStationSortOrder(stations.length);
    setStationIsActive(true);
    setStationModalOpen(true);
  };

  const openEditPrinterModal = (p: Printer) => {
    setSelectedPrinterId(p.id);
    setName(p.name);
    setConnectionType(p.connectionType);
    setIpAddress(p.ipAddress ?? '');
    setPort(p.port ?? 9100);
    setSystemName(p.systemName ?? '');
    setType(p.type as 'RECEIPT' | 'KITCHEN' | 'BAR');
    setIsActive(p.isActive);
    setModalOpen(true);
  };

  const openEditStationModal = (station: ProductionStation) => {
    setSelectedStationId(station.id);
    setStationName(station.name);
    setStationCode(station.code ?? '');
    setStationPrinterId(station.printerId ?? null);
    setStationSortOrder(station.sortOrder);
    setStationIsActive(station.isActive);
    setStationModalOpen(true);
  };

  const handleDelete = async (printerId: number) => {
    if (!window.confirm('¿Seguro que quieres eliminar esta impresora?')) return;
    try {
      await adminApi.deletePrinter(printerId);
      toast.success('Impresora eliminada');
      loadData();
    } catch {
      toast.error('Error eliminando la impresora');
    }
  };

  const handleDeleteStation = async (stationId: number) => {
    if (!window.confirm('¿Seguro que quieres desactivar esta sección?')) return;
    try {
      await adminApi.deleteProductionStation(stationId);
      toast.success('Sección desactivada');
      loadData();
    } catch {
      toast.error('Error desactivando la sección');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (connectionType === 'NETWORK' && !ipAddress.trim()) {
        toast.error('Indica la IP de la impresora');
        return;
      }

      if (connectionType === 'SYSTEM' && !systemName.trim()) {
        toast.error('Selecciona una impresora del sistema');
        return;
      }

      const payload = {
        name,
        connectionType,
        ipAddress: connectionType === 'NETWORK' ? ipAddress : null,
        port: connectionType === 'NETWORK' ? port : null,
        systemName: connectionType === 'SYSTEM' ? systemName : null,
        type,
        isActive,
      };

      if (selectedPrinterId) {
        await adminApi.updatePrinter(selectedPrinterId, payload);
        toast.success('Impresora actualizada');
      } else {
        await adminApi.createPrinter(venueId, payload);
        toast.success('Impresora creada');
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

  const handleStationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: stationName,
        code: stationCode || null,
        printerId: stationPrinterId,
        sortOrder: stationSortOrder,
        isActive: stationIsActive,
      };

      if (selectedStationId) {
        await adminApi.updateProductionStation(selectedStationId, payload);
        toast.success('Sección actualizada');
      } else {
        await adminApi.createProductionStation(venueId, payload);
        toast.success('Sección creada');
      }
      setStationModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error guardando sección';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async (tab: 'ticket' | 'kitchen') => {
    try {
      setPreviewLoading(true);
      setPreviewTab(tab);
      const data = await printersApi.getPreviewSamples(venueId);
      setPreviewSamples(data);
      setPreviewOpen(true);
    } catch {
      toast.error('No se pudo cargar la vista previa');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) return <div className="admin-loading">Cargando impresoras...</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Impresoras — {venue?.name}</h1>
          <p className="admin-page-subtitle">Configura impresoras directas por red o impresoras ya dadas de alta en el sistema operativo del servidor</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary" onClick={() => openPreview('kitchen')} disabled={previewLoading}>
            {previewLoading && previewTab === 'kitchen' ? 'Cargando...' : 'Vista cocina'}
          </button>
          <button className="btn btn-secondary" onClick={() => openPreview('ticket')} disabled={previewLoading}>
            {previewLoading && previewTab === 'ticket' ? 'Cargando...' : 'Vista ticket'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/venues')}>
            Volver a sedes
          </button>
          <button className="btn btn-secondary" onClick={openNewStationModal}>
            + Nueva sección
          </button>
          <button id="btn-new-printer" className="btn btn-primary" onClick={openNewPrinterModal}>
            + Nueva Impresora
          </button>
        </div>
      </div>

      <section className="admin-section">
        <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo / Uso</th>
                <th>Conexión</th>
                <th>Destino</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {printers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
                    No hay impresoras configuradas en esta sede. Haz clic en "Nueva Impresora" para empezar.
                  </td>
                </tr>
              ) : (
                printers.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      <span className={`admin-badge ${
                        p.type === 'RECEIPT' ? 'admin-badge--success' : 
                        p.type === 'KITCHEN' ? 'admin-badge--info' : 'admin-badge--muted'
                      }`}>
                        {p.type === 'RECEIPT' ? 'FACTURA / TICKET' : p.type === 'KITCHEN' ? 'COCINA' : 'BARRA'}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-badge ${p.connectionType === 'NETWORK' ? 'admin-badge--info' : 'admin-badge--muted'}`}>
                        {p.connectionType === 'NETWORK' ? 'TCP/IP' : 'SISTEMA'}
                      </span>
                    </td>
                    <td>
                      <code className="admin-code">
                        {p.connectionType === 'NETWORK'
                          ? `${p.ipAddress ?? '-'}:${p.port ?? '-'}`
                          : (p.systemName ?? 'Sin nombre')}
                      </code>
                    </td>
                    <td>
                      <span className={`admin-badge ${p.isActive ? 'admin-badge--success' : 'admin-badge--muted'}`}>
                        {p.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                        <button
                          id={`btn-edit-printer-${p.id}`}
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditPrinterModal(p)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(p.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <div>
            <h2 className="admin-section-title">Secciones de producción</h2>
            <p className="admin-page-subtitle">Asigna una impresora a Cocina, Freidoras, Barra caliente u otras zonas de trabajo.</p>
          </div>
        </div>
        <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>Impresora asignada</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stations.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
                    No hay secciones de producción configuradas todavía.
                  </td>
                </tr>
              ) : (
                stations.map((station) => (
                  <tr key={station.id}>
                    <td style={{ fontWeight: 600 }}>{station.name}</td>
                    <td>{station.code || 'Sin código'}</td>
                    <td>{station.printer?.name ?? 'Sin impresora asignada'}</td>
                    <td>
                      <span className={`admin-badge ${station.isActive ? 'admin-badge--success' : 'admin-badge--muted'}`}>
                        {station.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditStationModal(station)}>
                          Editar
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteStation(station.id)}>
                          Desactivar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Form */}
      {modalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: 450, width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedPrinterId ? 'Editar impresora' : 'Nueva impresora'}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="printer-name">Nombre de Impresora *</label>
                <input
                  id="printer-name"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ej: Impresora Cocina Principal"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="printer-connection-type">Modo de conexión *</label>
                <select
                  id="printer-connection-type"
                  className="form-select"
                  value={connectionType}
                  onChange={(e) => setConnectionType(e.target.value as PrinterConnectionType)}
                >
                  <option value="NETWORK">TCP/IP directa</option>
                  <option value="SYSTEM">Impresora del sistema</option>
                </select>
              </div>

              {connectionType === 'NETWORK' ? (
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="printer-ip">IP Address *</label>
                    <input
                      id="printer-ip"
                      className="form-input"
                      value={ipAddress}
                      onChange={(e) => setIpAddress(e.target.value)}
                      required
                      placeholder="192.168.1.100"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="printer-port">Puerto TCP *</label>
                    <input
                      id="printer-port"
                      type="number"
                      className="form-input"
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value, 10))}
                      required
                      min={1}
                      max={65535}
                    />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="printer-system-name">Impresora del sistema *</label>
                  <select
                    id="printer-system-name"
                    className="form-select"
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    required
                  >
                    <option value="">Selecciona una impresora</option>
                    {systemPrinters.map((printerName) => (
                      <option key={printerName} value={printerName}>
                        {printerName}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                    Esta lista sale del sistema operativo donde corre Tavolo. Si el backend está en Proxmox, la impresora debe estar configurada dentro de esa VM o contenedor.
                  </small>
                </div>
              )}

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="printer-type">Tipo / Uso de Impresora *</label>
                  <select
                    id="printer-type"
                    className="form-select"
                    value={type}
                    onChange={(e) => setType(e.target.value as 'RECEIPT' | 'KITCHEN' | 'BAR')}
                  >
                    <option value="RECEIPT">Factura / Ticket de Caja</option>
                    <option value="KITCHEN">Comandas de Cocina</option>
                    <option value="BAR">Comandas de Barra</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="printer-status">Estado *</label>
                  <select
                    id="printer-status"
                    className="form-select"
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                  >
                    <option value="true">Activa</option>
                    <option value="false">Inactiva</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button id="btn-save-printer" type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stationModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: 450, width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedStationId ? 'Editar sección' : 'Nueva sección'}</h3>
              <button className="modal-close" onClick={() => setStationModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleStationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={stationName} onChange={(e) => setStationName(e.target.value)} required placeholder="Ej: Freidoras" />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Código</label>
                  <input className="form-input" value={stationCode} onChange={(e) => setStationCode(e.target.value)} placeholder="Ej: FRI" />
                </div>
                <div className="form-group">
                  <label className="form-label">Orden</label>
                  <input className="form-input" type="number" value={stationSortOrder} onChange={(e) => setStationSortOrder(parseInt(e.target.value || '0', 10))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Impresora asignada</label>
                <select
                  className="form-select"
                  value={stationPrinterId ?? ''}
                  onChange={(e) => setStationPrinterId(e.target.value ? parseInt(e.target.value, 10) : null)}
                >
                  <option value="">Sin impresora</option>
                  {printers.filter((printer) => printer.isActive).map((printer) => (
                    <option key={printer.id} value={printer.id}>{printer.name}</option>
                  ))}
                </select>
              </div>
              <label className="admin-tag-option selected" style={{ justifyContent: 'flex-start' }}>
                <input type="checkbox" checked={stationIsActive} onChange={(e) => setStationIsActive(e.target.checked)} />
                <span>Sección activa</span>
              </label>

              <div className="modal__actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStationModalOpen(false)} style={{ flex: 1 }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !stationName.trim()} style={{ flex: 2 }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewOpen && previewSamples && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setPreviewOpen(false)}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <h3 className="modal__title" style={{ marginBottom: 0 }}>Vista previa de impresión</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className={`btn ${previewTab === 'kitchen' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPreviewTab('kitchen')}>
                  Cocina
                </button>
                <button className={`btn ${previewTab === 'ticket' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPreviewTab('ticket')}>
                  Ticket / Factura
                </button>
              </div>
            </div>

            <div className="print-preview">
              <pre className="print-preview__paper">
                {previewTab === 'kitchen' ? previewSamples.kitchen : previewSamples.ticket}
              </pre>
            </div>

            <div className="modal__actions">
              <button className="btn btn-secondary btn-full" onClick={() => setPreviewOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
