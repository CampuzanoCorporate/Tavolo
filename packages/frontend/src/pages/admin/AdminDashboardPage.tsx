/**
 * TAVOLO POS — Admin: Dashboard Principal
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import type { Venue, Organisation, OwnerDashboardMetrics } from '../../types';

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { currentVenue, currentUser } = useAppStore();
  const [org, setOrg] = useState<Organisation | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [usersCount, setUsersCount] = useState<number>(0);
  const [metrics, setMetrics] = useState<OwnerDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const orgData = await adminApi.getOrg();
        setOrg(orgData);
        
        const venuesData = await adminApi.getVenues();
        setVenues(venuesData);

        const usersData = await adminApi.getUsers();
        setUsersCount(usersData.length);

        try {
          const ownerMetrics = await adminApi.getOwnerMetrics();
          setMetrics(ownerMetrics);
        } catch {
          setMetrics(null);
        }
      } catch (err) {
        console.error('Error loading dashboard data', err);
        toast.error('Error cargando datos del dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (loading) return <div className="admin-loading">Cargando panel de control...</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Resumen</h1>
          <p className="admin-page-subtitle">Vista general de tu organización, ventas y rendimiento por sede</p>
        </div>
      </div>

      {org && (
        <section className="admin-section" style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-accent)' }}>
                {org.name}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                NIF: <code className="admin-code">{org.nif}</code> | Email: {org.email ?? 'No configurado'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {currentUser?.role === 'ADMIN' && (
                <button 
                  className="btn btn-secondary"
                  onClick={() => navigate('/admin/venues')}
                >
                  Configurar sedes
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Stats Grid */}
      <div className="admin-cards-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-badge admin-badge--success">Hoy</span>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {formatCurrency(metrics?.today.billedTotal ?? 0)}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              {metrics?.today.ticketCount ?? 0} tickets · Ticket medio {formatCurrency(metrics?.today.avgTicket ?? 0)}
            </p>
          </div>
        </div>

        <div className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-badge admin-badge--info">Mes</span>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {formatCurrency(metrics?.month.billedTotal ?? 0)}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              {metrics?.month.ticketCount ?? 0} tickets emitidos este mes
            </p>
          </div>
        </div>

        <div className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-badge admin-badge--info">Trimestre</span>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {formatCurrency(metrics?.quarter.billedTotal ?? 0)}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              T{metrics?.quarter.quarter ?? Math.floor(new Date().getMonth() / 3) + 1} · {metrics?.quarter.ticketCount ?? 0} tickets
            </p>
          </div>
        </div>

        <div className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-badge admin-badge--info">Sede</span>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {venues.length}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Sedes configuradas y activas
            </p>
          </div>
        </div>

        <div className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-badge admin-badge--success">Usuario</span>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {usersCount}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Colaboradores registrados
            </p>
          </div>
        </div>

        <div className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-badge admin-badge--success">Fiscal</span>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {metrics?.fiscalCertificate ? 'Certificado cargado' : 'Pendiente'}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              {metrics?.fiscalCertificate
                ? `${metrics.fiscalCertificate.originalFilename}${metrics?.ticketLogo ? ' · logo listo' : ''}`
                : `Serie actual: ${currentVenue?.invoiceSeries ?? 'T'}`}
            </p>
          </div>
        </div>
      </div>

      {metrics && (
        <div className="admin-cards-grid" style={{ marginBottom: 'var(--space-6)' }}>
          <section className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ fontWeight: 800, marginBottom: 'var(--space-3)' }}>Sedes por facturación</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {metrics.venueTotals.slice(0, 5).map((entry) => (
                <div key={entry.venueId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <strong>{entry.venueName}</strong>
                    <span>{formatCurrency(entry.billedTotal)}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {entry.ticketCount} tickets
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ fontWeight: 800, marginBottom: 'var(--space-3)' }}>Top productos</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {metrics.topProducts.slice(0, 6).map((entry) => (
                <div key={entry.productName} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <div>
                    <strong>{entry.productName}</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{entry.quantity} uds.</div>
                  </div>
                  <span>{formatCurrency(entry.revenue)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ fontWeight: 800, marginBottom: 'var(--space-3)' }}>Ventas por hora</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {metrics.hourlySales.filter((entry) => entry.total > 0).slice(0, 8).map((entry) => (
                <div key={entry.hour} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span>{String(entry.hour).padStart(2, '0')}:00</span>
                  <strong>{formatCurrency(entry.total)}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Venues Summary list */}
      <section className="admin-section">
        <h2 className="admin-section-title">Detalle de Sedes</h2>
        <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Identificador</th>
                <th>Facturación (NIF)</th>
                <th>Serie de Factura</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {venues.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
                    No hay sedes configuradas.
                  </td>
                </tr>
              ) : (
                venues.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td><code className="admin-code">{v.slug}</code></td>
                    <td>
                      {v.useOrgNif ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          Heredado ({org?.nif})
                        </span>
                      ) : (
                        <span>{v.nifOverride}</span>
                      )}
                    </td>
                    <td><code className="admin-code">{v.invoiceSeries}</code></td>
                    <td>
                      <span className={`admin-badge ${v.isActive ? 'admin-badge--success' : 'admin-badge--muted'}`}>
                        {v.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/admin/venues/${v.id}`)}
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/admin/venues/${v.id}/tables`)}
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          Mesas
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
    </div>
  );
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} €`;
}
