import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import type { FiscalCertificateSummary, QuarterlyReport, TicketLogoSummary } from '../../types';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function getCurrentQuarter() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function normalizeLogoFile(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = dataUrl;
  });

  const maxWidth = 384;
  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No se pudo preparar el lienzo para el logotipo');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const pngDataUrl = canvas.toDataURL('image/png');
  return {
    pngBase64: pngDataUrl.split(',')[1] ?? '',
    width,
    height,
  };
}

export function FiscalAdminPage() {
  const { currentVenueId, currentUser } = useAppStore();
  const initialPeriod = useMemo(() => getCurrentQuarter(), []);
  const [year, setYear] = useState(initialPeriod.year);
  const [quarter, setQuarter] = useState(initialPeriod.quarter);
  const [certificate, setCertificate] = useState<FiscalCertificateSummary | null>(null);
  const [ticketLogo, setTicketLogo] = useState<TicketLogoSummary | null>(null);
  const [report, setReport] = useState<QuarterlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCertificate, setSavingCertificate] = useState(false);
  const [deletingCertificate, setDeletingCertificate] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [label, setLabel] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [logoLabel, setLogoLabel] = useState('');
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [certificateData, ticketLogoData, reportData] = await Promise.all([
        adminApi.getFiscalCertificate(),
        adminApi.getTicketLogo(),
        adminApi.getQuarterlyReport({
          year,
          quarter,
          venueId: currentVenueId ?? undefined,
        }),
      ]);
      setCertificate(certificateData);
      setTicketLogo(ticketLogoData);
      setReport(reportData);
      setLabel(certificateData?.label ?? '');
      setLogoLabel(ticketLogoData?.label ?? '');
    } catch (error) {
      console.error('[FiscalAdminPage] Error cargando datos fiscales', error);
      toast.error('No se pudieron cargar los datos fiscales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [year, quarter, currentVenueId]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !label.trim()) {
      setLabel(file.name.replace(/\.(p12|pfx)$/i, ''));
    }
  };

  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedLogoFile(file);
    if (file && !logoLabel.trim()) {
      setLogoLabel(file.name.replace(/\.[^.]+$/u, ''));
    }
  };

  const handleSaveCertificate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedFile) {
      toast.error('Selecciona un certificado .p12 o .pfx');
      return;
    }

    if (!passphrase.trim()) {
      toast.error('Introduce la contraseña del certificado');
      return;
    }

    setSavingCertificate(true);
    try {
      const fileAsBase64 = await selectedFile.arrayBuffer().then((buffer) => arrayBufferToBase64(buffer));
      const saved = await adminApi.saveFiscalCertificate({
        label: label.trim() || null,
        filename: selectedFile.name,
        mimeType: selectedFile.type || 'application/x-pkcs12',
        base64Content: fileAsBase64,
        passphrase: passphrase.trim(),
      });

      setCertificate(saved);
      setPassphrase('');
      setSelectedFile(null);
      toast.success('Certificado guardado en administración');
    } catch (error) {
      console.error('[FiscalAdminPage] Error guardando certificado', error);
      toast.error('No se pudo guardar el certificado');
    } finally {
      setSavingCertificate(false);
    }
  };

  const handleSaveLogo = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedLogoFile) {
      toast.error('Selecciona una imagen para el ticket');
      return;
    }

    setSavingLogo(true);
    try {
      const normalized = await normalizeLogoFile(selectedLogoFile);
      const saved = await adminApi.saveTicketLogo({
        label: logoLabel.trim() || null,
        filename: selectedLogoFile.name,
        mimeType: 'image/png',
        pngBase64: normalized.pngBase64,
        width: normalized.width,
        height: normalized.height,
      });
      setTicketLogo(saved);
      setSelectedLogoFile(null);
      toast.success('Logotipo guardado para el ticket');
    } catch (error) {
      console.error('[FiscalAdminPage] Error guardando logotipo', error);
      toast.error('No se pudo guardar el logotipo');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleDeleteCertificate = async () => {
    setDeletingCertificate(true);
    try {
      await adminApi.deleteFiscalCertificate();
      setCertificate(null);
      setSelectedFile(null);
      setPassphrase('');
      toast.success('Certificado eliminado');
    } catch (error) {
      console.error('[FiscalAdminPage] Error eliminando certificado', error);
      toast.error('No se pudo eliminar el certificado');
    } finally {
      setDeletingCertificate(false);
    }
  };

  const handleDeleteLogo = async () => {
    setDeletingLogo(true);
    try {
      await adminApi.deleteTicketLogo();
      setTicketLogo(null);
      setSelectedLogoFile(null);
      toast.success('Logotipo eliminado');
    } catch (error) {
      console.error('[FiscalAdminPage] Error eliminando logotipo', error);
      toast.error('No se pudo eliminar el logotipo');
    } finally {
      setDeletingLogo(false);
    }
  };

  if (loading) {
    return <div className="admin-loading">Cargando operativa fiscal...</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Fiscal y cierres</h1>
          <p className="admin-page-subtitle">Certificado digital, visibilidad trimestral y control fiscal desde administración</p>
        </div>
      </div>

      <div className="admin-form-grid">
        <section className="admin-section">
          <h2 className="admin-section-title">Certificado digital</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginBottom: 'var(--space-4)' }}>
            Sube el certificado del emisor para dejar centralizada su gestión. El fichero y la contraseña se guardan cifrados.
          </p>

          {certificate ? (
            <div className="admin-summary-grid" style={{ marginBottom: 'var(--space-4)' }}>
              <article className="admin-summary-card">
                <span className="admin-summary-card__label">Etiqueta</span>
                <strong className="admin-summary-card__value" style={{ fontSize: '1rem' }}>{certificate.label || 'Sin etiqueta'}</strong>
              </article>
              <article className="admin-summary-card">
                <span className="admin-summary-card__label">Archivo</span>
                <strong className="admin-summary-card__value" style={{ fontSize: '1rem' }}>{certificate.originalFilename}</strong>
              </article>
              <article className="admin-summary-card">
                <span className="admin-summary-card__label">Actualizado</span>
                <strong className="admin-summary-card__value" style={{ fontSize: '1rem' }}>
                  {new Date(certificate.updatedAt).toLocaleString('es-ES')}
                </strong>
              </article>
            </div>
          ) : (
            <div className="admin-empty-state" style={{ marginBottom: 'var(--space-4)' }}>
              No hay ningún certificado cargado todavía.
            </div>
          )}

          {currentUser?.role === 'ADMIN' && (
            <form onSubmit={handleSaveCertificate}>
              <div className="form-group">
                <label className="form-label" htmlFor="fiscal-label">Etiqueta interna</label>
                <input
                  id="fiscal-label"
                  className="form-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ej: Certificado fiscal principal"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="fiscal-file">Certificado (.p12 o .pfx)</label>
                <input id="fiscal-file" className="form-input" type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={handleFileChange} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="fiscal-passphrase">Contraseña del certificado</label>
                <input
                  id="fiscal-passphrase"
                  className="form-input"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Contraseña de exportación"
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                {certificate && (
                  <button type="button" className="btn btn-secondary" onClick={() => void handleDeleteCertificate()} disabled={deletingCertificate}>
                    {deletingCertificate ? 'Eliminando...' : 'Eliminar certificado'}
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={savingCertificate}>
                  {savingCertificate ? 'Guardando...' : certificate ? 'Reemplazar certificado' : 'Guardar certificado'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="admin-section">
          <h2 className="admin-section-title">Logotipo del ticket</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginBottom: 'var(--space-4)' }}>
            El logo se imprimirá en la cabecera del ticket. La imagen se normaliza a PNG y se ajusta al ancho de impresión.
          </p>

          {ticketLogo ? (
            <div className="admin-summary-grid" style={{ marginBottom: 'var(--space-4)' }}>
              <article className="admin-summary-card">
                <span className="admin-summary-card__label">Etiqueta</span>
                <strong className="admin-summary-card__value" style={{ fontSize: '1rem' }}>{ticketLogo.label || 'Sin etiqueta'}</strong>
              </article>
              <article className="admin-summary-card">
                <span className="admin-summary-card__label">Resolución</span>
                <strong className="admin-summary-card__value" style={{ fontSize: '1rem' }}>{ticketLogo.width} x {ticketLogo.height}</strong>
              </article>
              <article className="admin-summary-card">
                <span className="admin-summary-card__label">Archivo</span>
                <strong className="admin-summary-card__value" style={{ fontSize: '1rem' }}>{ticketLogo.originalFilename}</strong>
              </article>
            </div>
          ) : (
            <div className="admin-empty-state" style={{ marginBottom: 'var(--space-4)' }}>
              No hay logotipo cargado para los tickets.
            </div>
          )}

          {currentUser?.role === 'ADMIN' && (
            <form onSubmit={handleSaveLogo}>
              <div className="form-group">
                <label className="form-label" htmlFor="ticket-logo-label">Etiqueta interna</label>
                <input
                  id="ticket-logo-label"
                  className="form-input"
                  value={logoLabel}
                  onChange={(e) => setLogoLabel(e.target.value)}
                  placeholder="Ej: Logo principal ticket"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ticket-logo-file">Imagen del logotipo</label>
                <input id="ticket-logo-file" className="form-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoFileChange} />
                <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                  Recomendado: fondo blanco o transparente y ancho máximo visual de 384 px.
                </small>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                {ticketLogo && (
                  <button type="button" className="btn btn-secondary" onClick={() => void handleDeleteLogo()} disabled={deletingLogo}>
                    {deletingLogo ? 'Eliminando...' : 'Eliminar logotipo'}
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={savingLogo}>
                  {savingLogo ? 'Guardando...' : ticketLogo ? 'Reemplazar logotipo' : 'Guardar logotipo'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="admin-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <h2 className="admin-section-title">Ingresos trimestrales</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                Resumen útil para seguimiento operativo y preparación fiscal del trimestre seleccionado.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <select className="form-select" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                <option value={1}>T1</option>
                <option value={2}>T2</option>
                <option value={3}>T3</option>
                <option value={4}>T4</option>
              </select>
              <input className="form-input" style={{ width: 120 }} type="number" value={year} min={2020} max={2100} onChange={(e) => setYear(Number(e.target.value) || initialPeriod.year)} />
            </div>
          </div>

          {report && (
            <>
              <div className="admin-summary-grid" style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <article className="admin-summary-card">
                  <span className="admin-summary-card__label">Facturación</span>
                  <strong className="admin-summary-card__value">{formatCurrency(report.billedTotal)}</strong>
                </article>
                <article className="admin-summary-card">
                  <span className="admin-summary-card__label">Base imponible</span>
                  <strong className="admin-summary-card__value">{formatCurrency(report.netTotal)}</strong>
                </article>
                <article className="admin-summary-card">
                  <span className="admin-summary-card__label">IVA repercutido</span>
                  <strong className="admin-summary-card__value">{formatCurrency(report.vatAmount)}</strong>
                </article>
                <article className="admin-summary-card">
                  <span className="admin-summary-card__label">Tickets</span>
                  <strong className="admin-summary-card__value">{report.ticketCount}</strong>
                </article>
              </div>

              <div className="admin-cards-grid">
                <article className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
                  <h3 style={{ fontWeight: 800, marginBottom: 'var(--space-3)' }}>Por mes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {report.monthlyBreakdown.map((entry) => (
                      <div key={entry.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                        <div>
                          <strong style={{ textTransform: 'capitalize' }}>{entry.label}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{entry.ticketCount} tickets</div>
                        </div>
                        <span>{formatCurrency(entry.billedTotal)}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="admin-venue-card" style={{ padding: 'var(--space-4)' }}>
                  <h3 style={{ fontWeight: 800, marginBottom: 'var(--space-3)' }}>Por sede</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {report.venueBreakdown.map((entry) => (
                      <div key={entry.venueId} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                        <div>
                          <strong>{entry.venueName}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{entry.ticketCount} tickets</div>
                        </div>
                        <span>{formatCurrency(entry.billedTotal)}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
