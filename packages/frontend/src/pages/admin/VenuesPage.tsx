/**
 * TAVOLO POS — Admin: Gestión de Sedes
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import type { Venue } from '../../types';

export function VenuesPage() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { setVenues(await adminApi.getVenues()); }
    catch { toast.error('Error cargando sedes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (venue: Venue) => {
    try {
      await adminApi.updateVenue(venue.id, { isActive: !venue.isActive });
      toast.success(venue.isActive ? 'Sede desactivada' : 'Sede activada');
      load();
    } catch { toast.error('Error actualizando sede'); }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Sedes</h1>
          <p className="admin-page-subtitle">Gestiona los locales de tu organización</p>
        </div>
        <button id="btn-new-venue" className="btn btn-primary" onClick={() => navigate('/admin/venues/new')}>
          + Nueva Sede
        </button>
      </div>

      {loading ? (
        <div className="admin-loading">Cargando sedes...</div>
      ) : (
        <div className="admin-cards-grid">
          {venues.map((venue) => (
            <div key={venue.id} className="admin-venue-card">
              <div className="admin-venue-card__header">
                <div>
                  <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{venue.name}</h3>
                  <code className="admin-code">{venue.slug}</code>
                </div>
                <span className={`admin-badge ${venue.isActive ? 'admin-badge--success' : 'admin-badge--muted'}`}>
                  {venue.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              {venue.address && (
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 'var(--space-2) 0' }}>
                  {venue.address}
                </p>
              )}

              <div className="admin-venue-card__fiscal">
                <div className="admin-info-row">
                  <span className="admin-info-label">NIF</span>
                  <span className="admin-info-value">
                    {venue.useOrgNif ? 'Heredado de la org.' : (venue.nifOverride ?? '—')}
                  </span>
                </div>
                <div className="admin-info-row">
                  <span className="admin-info-label">Serie factura</span>
                  <span className="admin-info-value"><code className="admin-code">{venue.invoiceSeries}</code></span>
                </div>
              </div>

              <div className="admin-venue-card__actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <button
                  id={`btn-edit-venue-${venue.id}`}
                  className="btn btn-secondary"
                  onClick={() => navigate(`/admin/venues/${venue.id}`)}
                  style={{ flex: '1 1 calc(50% - 4px)' }}
                >
                  Editar
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => navigate(`/admin/venues/${venue.id}/tables`)}
                  style={{ flex: '1 1 calc(50% - 4px)' }}
                >
                  Mesas
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => navigate(`/admin/venues/${venue.id}/printers`)}
                  style={{ flex: '1 1 calc(60% - 4px)' }}
                >
                  Impresoras
                </button>
                <button
                  className={`btn ${venue.isActive ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={() => handleToggle(venue)}
                  style={{ flex: '1 1 calc(40% - 4px)', fontSize: '0.8rem', padding: '8px' }}
                >
                  {venue.isActive ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
