/**
 * TAVOLO POS — Admin: Gestión de Impresoras
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi, printersApi } from '../../services/api';
import type { Printer, Venue } from '../../types';

export function PrintersAdminPage() {
  const { id: venueIdStr } = useParams<{ id: string }>();
  const venueId = parseInt(venueIdStr!, 10);
  const navigate = useNavigate();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSamples, setPreviewSamples] = useState<{ ticket: string; kitchen: string } | null>(null);
  const [previewTab, setPreviewTab] = useState<'ticket' | 'kitchen'>('ticket');

  // Form State
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState<number>(9100);
  const [type, setType] = useState<'RECEIPT' | 'KITCHEN' | 'BAR'>('RECEIPT');
  const [isActive, setIsActive] = useState(true);

  const loadData = async () => {
    try {
      const v = await adminApi.getVenue(venueId);
      setVenue(v);
      const p = await adminApi.getPrinters(venueId);
      setPrinters(p);
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
    setIpAddress('192.168.1.');
    setPort(9100);
    setType('RECEIPT');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditPrinterModal = (p: Printer) => {
    setSelectedPrinterId(p.id);
    setName(p.name);
    setIpAddress(p.ipAddress);
    setPort(p.port);
    setType(p.type as 'RECEIPT' | 'KITCHEN' | 'BAR');
    setIsActive(p.isActive);
    setModalOpen(true);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        ipAddress,
        port,
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
          <p className="admin-page-subtitle">Configura las impresoras térmicas ESC/POS (TCP/IP) del local</p>
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
                <th>Dirección TCP/IP</th>
                <th>Puerto</th>
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
                      <code className="admin-code">{p.ipAddress}</code>
                    </td>
                    <td>{p.port}</td>
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
