/**
 * TAVOLO POS — Admin: Formulario de Sede
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import type { Venue } from '../../types';

type VenueForm = Partial<Omit<Venue, 'id' | 'organisationId'>>;

const DEFAULT: VenueForm = {
  name: '', slug: '', address: '', phone: '',
  timezone: 'Europe/Madrid', isActive: true,
  useOrgNif: true, nifOverride: '', nameOverride: '', invoiceSeries: 'T', kitchenEnabled: true,
};

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeVenueForm(venue?: Partial<Venue> | null): VenueForm {
  return {
    ...DEFAULT,
    ...venue,
    address: venue?.address ?? '',
    phone: venue?.phone ?? '',
    nifOverride: venue?.nifOverride ?? '',
    nameOverride: venue?.nameOverride ?? '',
  };
}

function buildVenuePayload(form: VenueForm): VenueForm {
  const trimmedName = form.name?.trim() ?? '';
  const trimmedSlug = form.slug?.trim() ?? '';
  const trimmedAddress = form.address?.trim() ?? '';
  const trimmedPhone = form.phone?.trim() ?? '';
  const trimmedNifOverride = form.nifOverride?.trim() ?? '';
  const trimmedNameOverride = form.nameOverride?.trim() ?? '';
  const trimmedInvoiceSeries = form.invoiceSeries?.trim().toUpperCase() ?? 'T';

  return {
    name: trimmedName,
    slug: trimmedSlug,
    address: trimmedAddress || undefined,
    phone: trimmedPhone || undefined,
    timezone: form.timezone ?? 'Europe/Madrid',
    isActive: form.isActive ?? true,
    useOrgNif: form.useOrgNif ?? true,
    nifOverride: form.useOrgNif ? undefined : (trimmedNifOverride || undefined),
    nameOverride: form.useOrgNif ? undefined : (trimmedNameOverride || undefined),
    invoiceSeries: trimmedInvoiceSeries,
    kitchenEnabled: form.kitchenEnabled ?? true,
  };
}

export function VenueFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState<VenueForm>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    adminApi.getVenue(parseInt(id!, 10))
      .then((v) => setForm(normalizeVenueForm(v)))
      .catch(() => toast.error('Error cargando sede'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (key: keyof VenueForm, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, name, ...(isEdit ? {} : { slug: slugify(name) }) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = buildVenuePayload(form);
      if (isEdit) {
        await adminApi.updateVenue(parseInt(id!, 10), payload);
        toast.success('Sede actualizada');
      } else {
        await adminApi.createVenue(payload);
        toast.success('Sede creada');
      }
      navigate('/admin/venues');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error guardando';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin-loading">Cargando...</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{isEdit ? 'Editar sede' : 'Nueva sede'}</h1>
          <p className="admin-page-subtitle">Configura los datos del local y su configuración fiscal Veri*factu</p>
        </div>
        <button id="btn-back-venues" className="btn btn-secondary" onClick={() => navigate('/admin/venues')}>
          Volver
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="admin-form-grid">

          {/* Datos del local */}
          <section className="admin-section">
            <h2 className="admin-section-title">Datos del Local</h2>

            <div className="form-group">
              <label className="form-label" htmlFor="venue-name">Nombre *</label>
              <input id="venue-name" className="form-input" value={form.name ?? ''} onChange={(e) => handleNameChange(e.target.value)} required placeholder="Ej: García - Centro" />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="venue-slug">Slug (URL) *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>/</span>
                <input id="venue-slug" className="form-input" value={form.slug ?? ''} onChange={(e) => set('slug', e.target.value)} required placeholder="garcia-centro" style={{ paddingLeft: 24 }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="venue-address">Dirección</label>
              <input id="venue-address" className="form-input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Calle Mayor 1, 28001 Madrid" />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="venue-phone">Teléfono</label>
                <input id="venue-phone" className="form-input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+34 91 234 56 78" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="venue-timezone">Zona horaria</label>
                <select id="venue-timezone" className="form-select" value={form.timezone ?? 'Europe/Madrid'} onChange={(e) => set('timezone', e.target.value)}>
                  <option value="Europe/Madrid">Europe/Madrid</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>
            </div>
          </section>

          {/* Configuración Fiscal */}
          <section className="admin-section">
            <h2 className="admin-section-title">⚖️ Configuración Fiscal (Veri*factu)</h2>

            <div className="form-group">
              <div className="toggle-group">
                <div>
                  <label className="form-label" style={{ marginBottom: 4 }}>Usar NIF de la Organización</label>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    Si está activado, la sede facturará con el CIF/NIF de la empresa principal.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.useOrgNif ?? true} onChange={(e) => set('useOrgNif', e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            {!form.useOrgNif && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="venue-nif-override">NIF/CIF Propio *</label>
                  <input id="venue-nif-override" className="form-input" value={form.nifOverride ?? ''} onChange={(e) => set('nifOverride', e.target.value)} placeholder="B12345679" required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="venue-name-override">Razón Social Propia *</label>
                  <input id="venue-name-override" className="form-input" value={form.nameOverride ?? ''} onChange={(e) => set('nameOverride', e.target.value)} placeholder="Sede Norte S.L." required />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="venue-series">
                Serie de Factura *
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: 8 }}>
                  Debe ser única entre sedes con el mismo NIF
                </span>
              </label>
              <input
                id="venue-series"
                className="form-input"
                value={form.invoiceSeries ?? 'T'}
                onChange={(e) => set('invoiceSeries', e.target.value.toUpperCase())}
                required
                maxLength={20}
                style={{ fontFamily: 'var(--font-mono)' }}
                placeholder="T-MAD"
              />
              <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                El código de factura será: {form.invoiceSeries}-{new Date().getFullYear()}-000001
              </small>
            </div>
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">Operativa de Sala</h2>

            <div className="form-group">
              <div className="toggle-group">
                <div>
                  <label className="form-label" style={{ marginBottom: 4 }}>Cocina habilitada en esta sede</label>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    Si la desactivas, no aparecerán los botones de avisar o enviar a cocina en el TPV.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={form.kitchenEnabled ?? true} onChange={(e) => set('kitchenEnabled', e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-6)' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/venues')}>Cancelar</button>
          <button id="btn-save-venue" type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar sede'}
          </button>
        </div>
      </form>
    </div>
  );
}
