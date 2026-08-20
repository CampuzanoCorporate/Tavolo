/**
 * TAVOLO POS — Admin: Registro de Facturas y Estado AEAT (Veri*factu)
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, ticketsApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { printRawBase64WithQzTray } from '../../services/qzTray';
import type { CashClosure, TicketPreviewData } from '../../types';

interface TicketListItem {
  id: number;
  invoiceSeries: string;
  invoiceNumber: number;
  invoiceCode: string;
  invoiceDate?: string;
  issuedAt?: string;
  total: number;
  vatTotal: number;
  vatAmount?: number | string | null;
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
  const { currentVenueId, selectedLocalPrinterName } = useAppStore();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<TicketListItem | null>(null);
  const [billedTotal, setBilledTotal] = useState(0);
  const [ticketPreview, setTicketPreview] = useState<TicketPreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reprintingTicketId, setReprintingTicketId] = useState<number | null>(null);
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [closuresTotal, setClosuresTotal] = useState(0);

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  const parseAmount = (value: number | string | null | undefined) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleString('es-ES');
  };

  const loadTickets = async () => {
    if (!currentVenueId) return;
    setLoading(true);
    try {
      const res = await adminApi.getTickets(currentVenueId, {
        limit,
        offset: (page - 1) * limit,
        aeatStatus: statusFilter || undefined,
      });
      setTickets(
        res.data.map((ticket: TicketListItem & { vatAmount?: number | string | null }) => ({
          ...ticket,
          total: parseAmount(ticket.total),
          vatTotal: parseAmount(ticket.vatTotal ?? ticket.vatAmount),
        })),
      );
      setTotal(res.total);
      setBilledTotal(Number(res.billedTotal ?? 0));
      try {
        const closuresRes = await adminApi.getCashClosures(currentVenueId);
        setClosures(closuresRes.data);
        setClosuresTotal(Number(closuresRes.totals.billedTotal ?? 0));
      } catch (error) {
        console.error('[Tickets] Error cargando cierres:', error);
        setClosures([]);
        setClosuresTotal(0);
      }
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

  const handleOpenTicket = async (ticket: TicketListItem) => {
    try {
      setSelectedTicket(ticket);
      setLoadingPreview(true);
      const preview = await ticketsApi.getPreview(ticket.id);
      setTicketPreview(preview);
    } catch (error) {
      console.error('[Tickets] Error cargando preview:', error);
      toast.error('No se pudo abrir el ticket');
      setSelectedTicket(null);
      setTicketPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleReprint = async (ticketId: number) => {
    try {
      setReprintingTicketId(ticketId);
      if (selectedLocalPrinterName) {
        const rawTicket = await ticketsApi.getRaw(ticketId);
        await printRawBase64WithQzTray(selectedLocalPrinterName, rawTicket.rawBase64);
        toast.success(`Ticket enviado a la impresora local "${selectedLocalPrinterName}"`);
      } else {
        await ticketsApi.reprint(ticketId);
        toast.success('Ticket enviado a impresión');
      }
    } catch (error) {
      console.error('[Tickets] Error reimprimiendo ticket:', error);
      if (selectedLocalPrinterName) {
        try {
          await ticketsApi.reprint(ticketId);
          toast.success('Ticket enviado a la impresora del servidor');
        } catch {
          toast.error('No se pudo reimprimir el ticket');
        }
      } else {
        toast.error('No se pudo reimprimir el ticket');
      }
    } finally {
      setReprintingTicketId(null);
    }
  };

  const handleReprintClosure = async (closureId: number) => {
    try {
      setReprintingTicketId(closureId);
      if (selectedLocalPrinterName) {
        const rawClosure = await ticketsApi.getCashClosureRaw(closureId);
        await printRawBase64WithQzTray(selectedLocalPrinterName, rawClosure.rawBase64);
        toast.success(`Cierre enviado a la impresora local "${selectedLocalPrinterName}"`);
      } else {
        await ticketsApi.reprintCashClosure(closureId);
        toast.success('Cierre enviado a impresión');
      }
    } catch (error) {
      console.error('[Tickets] Error reimprimiendo cierre:', error);
      if (selectedLocalPrinterName) {
        try {
          await ticketsApi.reprintCashClosure(closureId);
          toast.success('Cierre enviado a la impresora del servidor');
        } catch {
          toast.error('No se pudo reimprimir el cierre');
        }
      } else {
        toast.error('No se pudo reimprimir el cierre');
      }
    } finally {
      setReprintingTicketId(null);
    }
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

  const selectedTicketTotal = parseAmount(selectedTicket?.total);
  const selectedTicketVat = parseAmount(selectedTicket?.vatTotal ?? selectedTicket?.vatAmount);
  const selectedTicketBase = Math.max(0, selectedTicketTotal - selectedTicketVat);

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
          <h1 className="admin-page-title">Histórico de facturación y cierres</h1>
          <p className="admin-page-subtitle">Consulta el histórico facturado y los cierres de caja registrados en esta sede</p>
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
          <div className="admin-summary-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <article className="admin-summary-card">
              <span className="admin-summary-card__label">Total facturado</span>
              <strong className="admin-summary-card__value">{billedTotal.toFixed(2)} €</strong>
            </article>
            <article className="admin-summary-card">
              <span className="admin-summary-card__label">Movimientos</span>
              <strong className="admin-summary-card__value">{total}</strong>
            </article>
            <article className="admin-summary-card">
              <span className="admin-summary-card__label">Total en cierres</span>
              <strong className="admin-summary-card__value">{closuresTotal.toFixed(2)} €</strong>
            </article>
          </div>

          <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Movimiento</th>
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
                        {formatDateTime(t.issuedAt ?? t.invoiceDate)}
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
                          onClick={() => void handleOpenTicket(t)}
                        >
                          Ver ticket
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

      <section className="admin-section" style={{ marginTop: 'var(--space-6)' }}>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="admin-section-title">Histórico de cierres de caja</h2>
        </div>
        <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha cierre</th>
                <th>Periodo</th>
                <th>Responsable</th>
                <th>Apertura</th>
                <th>Tickets</th>
                <th>Facturado</th>
                <th>Esperado</th>
                <th>Contado</th>
                <th>Descuadre</th>
                <th>Notas</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {closures.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
                    No hay cierres registrados todavía.
                  </td>
                </tr>
              ) : (
                closures.map((closure) => (
                  <tr key={closure.id}>
                    <td>{formatDateTime(closure.createdAt)}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {formatDateTime(closure.periodStart)}
                      <br />
                      {formatDateTime(closure.periodEnd)}
                    </td>
                    <td>{closure.user.name}</td>
                    <td style={{ fontWeight: 700 }}>
                      {Number(closure.openingAmount ?? 0).toFixed(2)} €
                    </td>
                    <td>{closure.ticketCount}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                      {Number(closure.billedTotal).toFixed(2)} €
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {Number(closure.expectedAmount ?? 0).toFixed(2)} €
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {Number(closure.countedAmount ?? 0).toFixed(2)} €
                    </td>
                    <td style={{ fontWeight: 700, color: Number(closure.discrepancyAmount ?? 0) === 0 ? 'var(--color-text-primary)' : 'var(--color-danger)' }}>
                      {Number(closure.discrepancyAmount ?? 0).toFixed(2)} €
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {closure.notes || 'Sin notas'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleReprintClosure(closure.id)}
                        disabled={reprintingTicketId === closure.id}
                      >
                        {reprintingTicketId === closure.id ? 'Imprimiendo...' : 'Reimprimir'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: 780, width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Movimiento: {selectedTicket.invoiceCode}</h3>
              <button className="modal-close" onClick={() => {
                setSelectedTicket(null);
                setTicketPreview(null);
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              {loadingPreview ? (
                <div className="admin-loading">Abriendo ticket...</div>
              ) : ticketPreview && (
                <div className="print-preview">
                  <div className="print-preview__paper" style={{ whiteSpace: 'pre-wrap' }}>
                    {ticketPreview.preview}
                  </div>
                </div>
              )}
              
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
                  Importes y tasas
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.85rem' }}>
                  <div><strong>Base Imponible:</strong> {selectedTicketBase.toFixed(2)} €</div>
                  <div><strong>Cuota IVA (10%):</strong> {selectedTicketVat.toFixed(2)} €</div>
                  <div style={{ gridColumn: 'span 2', fontSize: '1rem', fontWeight: 'bold', borderTop: '1px solid var(--color-border)', paddingTop: 6, marginTop: 4 }}>
                    Total Factura: <span style={{ color: 'var(--color-accent)' }}>{selectedTicketTotal.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              {/* Trazabilidad Fiscal */}
              <div className="admin-venue-card" style={{ padding: 'var(--space-3)' }}>
                <h4 style={{ fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 8 }}>
                  Integridad fiscal (Veri*factu)
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
                    <h5 style={{ fontWeight: 700, marginBottom: 4 }}>Código QR oficial</h5>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                      Este código QR permite al cliente final o al inspector fiscal verificar el registro inmediato e inalterable de esta factura directamente en el sistema de la AEAT.
                    </p>
                  </div>
                </div>
              )}

              {/* Respuesta AEAT */}
              <div className="admin-venue-card" style={{ padding: 'var(--space-3)' }}>
                <h4 style={{ fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 8 }}>
                  Estado de envío AEAT
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleReprint(selectedTicket.id)}
                  disabled={reprintingTicketId === selectedTicket.id}
                >
                  {reprintingTicketId === selectedTicket.id ? 'Imprimiendo...' : 'Reimprimir'}
                </button>
                <button className="btn btn-secondary" onClick={() => {
                  setSelectedTicket(null);
                  setTicketPreview(null);
                }}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
