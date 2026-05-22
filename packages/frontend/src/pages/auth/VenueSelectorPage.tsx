/**
 * TAVOLO POS — Selector de Sede
 * Se muestra tras el login cuando el usuario tiene acceso a múltiples sedes.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import type { Venue } from '../../types';

export function VenueSelectorPage() {
  const navigate = useNavigate();
  const { availableVenueIds, setCurrentVenue, isAuthenticated, currentUser } = useAppStore();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    adminApi.getVenues()
      .then(setVenues)
      .catch(() => toast.error('Error cargando sedes'))
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

  const handleSelect = (venue: Venue) => {
    setCurrentVenue(venue);
    navigate('/');
    toast.success(`Sede: ${venue.name}`);
  };

  if (loading) return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p>Cargando sedes...</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb--1" />
      <div className="login-bg-orb login-bg-orb--2" />

      <div className="login-card" style={{ maxWidth: 520 }}>
        <div className="login-logo">
          <span className="login-logo__icon" />
          <div>
            <h1 className="login-logo__title">Tavolo</h1>
            <span className="login-logo__subtitle">Selecciona tu sede</span>
          </div>
        </div>

        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-5)' }}>
          Bienvenido, <strong>{currentUser?.name}</strong>. ¿En qué sede vas a trabajar hoy?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {venues.filter((v) => availableVenueIds.includes(v.id)).map((venue) => (
            <button
              key={venue.id}
              id={`venue-select-${venue.id}`}
              className="venue-select-card"
              onClick={() => handleSelect(venue)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div className="venue-select-icon" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{venue.name}</div>
                  {venue.address && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {venue.address}
                    </div>
                  )}
                </div>
              </div>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem' }}>Ver</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
