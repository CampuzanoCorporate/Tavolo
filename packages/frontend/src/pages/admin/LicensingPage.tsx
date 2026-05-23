import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { licensingApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import type { LicenseStatusData } from '../../types';

export function LicensingPage() {
  const { licenseStatus, setLicenseStatus } = useAppStore();
  const [activationCode, setActivationCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async (silent = false) => {
    try {
      const status = await licensingApi.getCurrent();
      setLicenseStatus(status);
    } catch {
      if (!silent) toast.error('No se pudo cargar el estado de la licencia');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationCode.trim()) return;

    setSaving(true);
    try {
      const status = await licensingApi.activate(activationCode);
      setLicenseStatus(status);
      setActivationCode('');
      toast.success('Licencia activada');
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'No se pudo activar la licencia');
    } finally {
      setSaving(false);
    }
  };

  const status = licenseStatus;
  const license = status?.license;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Licencia</h1>
          <p className="admin-page-subtitle">Controla la validez operativa de la sede y su período de gracia.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="admin-loading">Cargando licencia...</div>
      ) : (
        <div className="license-grid">
          <section className="admin-venue-card license-card">
            <div className="license-card__header">
              <div>
                <h3 style={{ fontWeight: 700 }}>Estado actual</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  {status?.reason ?? 'Sin datos de licencia'}
                </p>
              </div>
              <LicenseBadge status={status} />
            </div>

            <div className="license-card__meta">
              <div className="admin-info-row">
                <span className="admin-info-label">Código</span>
                <span className="admin-info-value">{license?.code ?? 'Sin licencia asignada'}</span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-label">Etiqueta</span>
                <span className="admin-info-value">{license?.label ?? '—'}</span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-label">Válida hasta</span>
                <span className="admin-info-value">{formatDate(license?.validUntil)}</span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-label">Gracia hasta</span>
                <span className="admin-info-value">{formatDate(license?.graceUntil)}</span>
              </div>
              <div className="admin-info-row">
                <span className="admin-info-label">Última validación</span>
                <span className="admin-info-value">{formatDate(license?.lastValidatedAt)}</span>
              </div>
            </div>
          </section>

          <section className="admin-venue-card license-card">
            <div className="license-card__header">
              <div>
                <h3 style={{ fontWeight: 700 }}>Activar o reemplazar licencia</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  Aplica aquí el código que te entregue el proveedor o tu servidor central.
                </p>
              </div>
            </div>

            <form className="license-form" onSubmit={handleActivate}>
              <label className="form-field">
                <span>Código de licencia</span>
                <input
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                  placeholder="TAV-XXXX-XXXX-XXXX"
                />
              </label>

              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Activando...' : 'Activar licencia'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function LicenseBadge({ status }: { status: LicenseStatusData | null }) {
  const state = status?.effectiveState ?? 'UNLICENSED';
  const labelMap = {
    ACTIVE: 'Activa',
    GRACE: 'En gracia',
    BLOCKED: 'Bloqueada',
    UNLICENSED: 'Sin licencia',
  } as const;

  return <span className={`license-badge license-badge--${state.toLowerCase()}`}>{labelMap[state]}</span>;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES');
}
