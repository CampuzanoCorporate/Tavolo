/**
 * TAVOLO POS — Admin: Registro de Facturas y Estado AEAT (Veri*factu)
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

interface TicketListItem {
  id: number;
  invoiceSeries: string;
  invoiceNumber: number;
  invoiceCode: string;
  invoiceDate: string;
  total: number;
  vatTotal: number;
  businessName: string;
  businessNif: string;
  businessAddress: string;
  hashSelf: string;
  hashPrev: string | null;
  signature: string | null;
  qrBase64: string | null;
  aeatStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'ERROR';
  aeatResponseMsg: string | null;
  createdAt: string;
}

export function TicketsLogPage() {
  const { currentVenueId } = useAppStore();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<TicketListItem | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  const loadTickets = async () => {
    if (!currentVenueId) return;
    setLoading(true);
    try {
      const res = await adminApi.getTickets(currentVenueId, {
        limit,
        offset: (page - 1) * limit,
        aeatStatus: statusFilter || undefined,
      });
      setTickets(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Error cargando registro de facturas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [currentVenueId, page, statusFilter]);

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  const getStatusBadge = (status: TicketListItem['aeatStatus']) => {
    switch (status) {
      case 'ACCEPTED':
        return <span className="admin-badge admin-badge--success">ENVIADO AEAT</span>;
      case 'PENDING':
        return <span className="admin-badge admin-badge--info">PENDIENTE</span>;
      case 'REJECTED':
      case 'ERROR':
        return <span className="admin-badge admin-badge--danger">ERROR DE ENVÍO</span>;
      default:
        return <span className="admin-badge">{status}</span>;
    }
  };

  if (!currentVenueId) {
    return (
      <div className="admin-page">
        <div className="admin-loading">Por favor, selecciona una sede activa en el panel lateral.</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Registro de Facturas (Veri*factu)</h1>
          <p className="admin-page-subtitle">Listado oficial e inmutable de facturas expedidas en este local</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">Todos los estados</option>
            <option value="ACCEPTED">Aceptado por AEAT</option>
            <option value="PENDING">Pendiente de envío</option>
            <option value="REJECTED">Rechazado</option>
            <option value="ERROR">Error de envío</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">Cargando facturas...</div>
      ) : (
        <section className="admin-section">
          <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Fecha/Hora</th>
                  <th>Emisor</th>
                  <th>Importe Total</th>
                  <th>Huella Digital (SHA-256)</th>
                  <th>Estado Veri*factu</th>
                  <th style={{ textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
                      No hay facturas registradas que coincidan con los criterios.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 'bold' }}>
                        <code className="admin-code">{t.invoiceCode}</code>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {new Date(t.invoiceDate).toLocaleString('es-ES')}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>{t.businessName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t.businessNif}</div>
                      </td>
                      <td style={{ fontWeight: 'bold', color: 'var(--color-accent)' }}>
                        {Number(t.total).toFixed(2)} €
                      </td>
                      <td>
                        <code className="admin-code" style={{ fontSize: '0.7rem', opacity: 0.8 }} title={t.hashSelf}>
                          {t.hashSelf.substring(0, 16)}...
                        </code>
                      </td>
                      <td>{getStatusBadge(t.aeatStatus)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          id={`btn-view-ticket-${t.id}`}
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedTicket(t)}
                        >
                          👁 Detalles
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Mostrando {tickets.length} de {total} facturas
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                >
                  ◀ Anterior
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page * limit >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: 550, width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Detalles de Factura: {selectedTicket.invoiceCode}</h3>
              <button className="modal-close" onClick={() => setSelectedTicket(null)}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              
              {/* Información General */}
              <div className="admin-venue-card" style={{ padding: 'var(--space-3)' }}>
                <h4 style={{ fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 8 }}>
                  Datos del Emisor
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                  <div><strong>Razón Social:</strong> {selectedTicket.businessName}</div>
                  <div><strong>NIF/CIF:</strong> {selectedTicket.businessNif}</div>
                  <div><strong>Dirección:</strong> {selectedTicket.businessAddress}</div>
                </div>
              </div>

              {/* Importes */}
              <div className="admin-venue-card" style={{ padding: 'var(--space-3)' }}>
                <h4 style={{ fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 8 }}>
                  💰 Importes y Tasas
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.85rem' }}>
                  <div><strong>Base Imponible:</strong> {(Number(selectedTicket.total) - Number(selectedTicket.vatTotal)).toFixed(2)} €</div>
                  <div><strong>Cuota IVA (10%):</strong> {Number(selectedTicket.vatTotal).toFixed(2)} €</div>
                  <div style={{ gridColumn: 'span 2', fontSize: '1rem', fontWeight: 'bold', borderTop: '1px solid var(--color-border)', paddingTop: 6, marginTop: 4 }}>
                    Total Factura: <span style={{ color: 'var(--color-accent)' }}>{Number(selectedTicket.total).toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              {/* Trazabilidad Fiscal */}
              <div className="admin-venue-card" style={{ padding: 'var(--space-3)' }}>
                <h4 style={{ fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 8 }}>
                  ⚡ Integridad Fiscal (Veri*factu Encadenado)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.78rem' }}>
                  <div>
                    <strong>Huella Digital (hashSelf):</strong>
                    <div style={{ overflowX: 'auto', background: 'var(--color-surface-3)', padding: 6, borderRadius: 4, border: '1px solid var(--color-border)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                      {selectedTicket.hashSelf}
                    </div>
                  </div>
                  <div>
                    <strong>Huella Anterior (hashPrev):</strong>
                    <div style={{ overflowX: 'auto', background: 'var(--color-surface-3)', padding: 6, borderRadius: 4, border: '1px solid var(--color-border)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                      {selectedTicket.hashPrev ?? 'PRIMERA FACTURA DE LA SERIE'}
                    </div>
                  </div>
                </div>
              </div>

              {/* QR de Cotejo AEAT */}
              {selectedTicket.qrBase64 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', background: 'var(--color-surface-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
                  <img
                    src={selectedTicket.qrBase64}
                    alt="Código QR de Cotejo AEAT"
                    style={{ width: 100, height: 100, background: 'white', padding: 4, borderRadius: 6 }}
                  />
                  <div style={{ flex: 1 }}>
                    <h5 style={{ fontWeight: 700, marginBottom: 4 }}>📱 Código QR Oficial</h5>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                      Este código QR permite al cliente final o al inspector fiscal verificar el registro inmediato e inalterable de esta factura directamente en el sistema de la AEAT.
                    </p>
                  </div>
                </div>
              )}

              {/* Respuesta AEAT */}
              <div className="admin-venue-card" style={{ padding: 'var(--space-3)' }}>
                <h4 style={{ fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 8 }}>
                  🖥️ Estado de Envío AEAT
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                  <div><strong>Estado:</strong> {getStatusBadge(selectedTicket.aeatStatus)}</div>
                  {selectedTicket.aeatResponseMsg && (
                    <div style={{ marginTop: 4 }}>
                      <strong>Mensaje AEAT:</strong>
                      <div style={{ fontStyle: 'italic', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {selectedTicket.aeatResponseMsg}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedTicket(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
