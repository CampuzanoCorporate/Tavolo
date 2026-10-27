import { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { companyAdminApi } from './services/api';
import type { User, Product, LicenseStatus, TicketSummary, Venue, Category, ProductPayload } from './types';
import { exportQuarterlyReportPDF, exportCashClosuresPDF, exportTicketsPDF, CashClosureItem } from './services/pdfExport';

export function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('tavolo_company_token') ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // Auth Form
  const [loginEmail, setLoginEmail] = useState('admin@garcia.es');
  const [loginPassword, setLoginPassword] = useState('Admin1234!');

  // App Data
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [closures, setClosures] = useState<CashClosureItem[]>([]);
  const [closuresTotals, setClosuresTotals] = useState({ billedTotal: 0, ticketCount: 0 });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'tickets' | 'closures' | 'reports' | 'license'>('dashboard');

  // Reports & PDF state
  const [pdfYear, setPdfYear] = useState<number>(new Date().getFullYear());
  const [pdfQuarter, setPdfQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Stock edit state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState<number>(0);
  const [stockControl, setStockControl] = useState<boolean>(true);
  const [editingCatalogProduct, setEditingCatalogProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductPayload>({
    name: '', description: '', price: 0, vatRate: 10, categoryId: 0, isAvailable: true,
  });

  // License code state
  const [licenseCodeInput, setLicenseCodeInput] = useState('');
  const [activating, setActivating] = useState(false);

  const fetchCompanyData = async () => {
    try {
      setLoading(true);
      const [profile, venueList, lic, closuresRes] = await Promise.all([
        companyAdminApi.getMe(),
        companyAdminApi.getVenues(),
        companyAdminApi.getLicenseStatus().catch(() => null),
        companyAdminApi.getCashClosures().catch(() => ({ data: [], totals: { billedTotal: 0, ticketCount: 0 } })),
      ]);
      const venueId = selectedVenueId && venueList.some((venue) => venue.id === selectedVenueId)
        ? selectedVenueId
        : venueList[0]?.id ?? null;
      const [prodList, categoryList, ticketList] = venueId
        ? await Promise.all([
            companyAdminApi.getProducts(venueId).catch(() => []),
            companyAdminApi.getCategories(venueId).catch(() => []),
            companyAdminApi.getTickets(venueId).catch(() => []),
          ])
        : [[], [], []] as [Product[], Category[], TicketSummary[]];
      setUser(profile);
      setVenues(venueList);
      setSelectedVenueId(venueId);
      setLicenseStatus(lic);
      setProducts(prodList);
      setCategories(categoryList);
      setTickets(ticketList);
      setClosures(closuresRes.data);
      setClosuresTotals(closuresRes.totals);
    } catch {
      toast.error('Error al cargar datos de la empresa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchCompanyData();
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await companyAdminApi.login(loginEmail.trim(), loginPassword.trim());
      localStorage.setItem('tavolo_company_token', res.token);
      setToken(res.token);
      setUser(res.user);
      toast.success(`Bienvenido al Panel de Administración, ${res.user.name}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Credenciales de administrador incorrectas');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tavolo_company_token');
    setToken('');
    setUser(null);
    setVenues([]);
    setSelectedVenueId(null);
    toast.success('Sesión cerrada');
  };

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await companyAdminApi.updateStock(editingProduct.id, newStock, stockControl);
      toast.success(`Stock actualizado para ${editingProduct.name}`);
      setEditingProduct(null);
      void fetchCompanyData();
    } catch {
      toast.error('Error al actualizar el stock');
    }
  };

  const openProductForm = (product?: Product) => {
    const initial: ProductPayload = product
      ? {
          name: product.name,
          description: product.description ?? '',
          price: Number(product.price),
          vatRate: Number(product.vatRate),
          categoryId: product.categoryId,
          isAvailable: product.isAvailable,
          stockQuantity: product.stockQuantity,
          isStockControlEnabled: product.isStockControlEnabled,
        }
      : {
          name: '', description: '', price: 0, vatRate: 10,
          categoryId: categories.find((category) => category.isActive)?.id ?? 0,
          isAvailable: true, stockQuantity: 0, isStockControlEnabled: false,
        };
    setEditingCatalogProduct(product ?? ({ id: 0 } as Product));
    setProductForm(initial);
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedVenueId || !productForm.categoryId) {
      toast.error('Selecciona una sede y una categoría para el artículo');
      return;
    }
    try {
      if (editingCatalogProduct?.id) {
        await companyAdminApi.updateProduct(editingCatalogProduct.id, productForm);
        toast.success('Artículo actualizado');
      } else {
        await companyAdminApi.createProduct(selectedVenueId, productForm);
        toast.success('Artículo creado en el catálogo');
      }
      setEditingCatalogProduct(null);
      void fetchCompanyData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? error?.response?.data?.error ?? 'No se pudo guardar el artículo');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm(`¿Retirar “${product.name}” del catálogo? Dejará de estar disponible en el TPV.`)) return;
    try {
      await companyAdminApi.deleteProduct(product.id);
      toast.success('Artículo retirado del catálogo');
      void fetchCompanyData();
    } catch {
      toast.error('No se pudo retirar el artículo');
    }
  };

  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseCodeInput.trim()) return;
    try {
      setActivating(true);
      const updated = await companyAdminApi.activateLicense(licenseCodeInput.trim());
      setLicenseStatus(updated);
      toast.success('¡Licencia de empresa activada correctamente!');
      setLicenseCodeInput('');
      void fetchCompanyData();
    } catch {
      toast.error('Código de licencia inválido o ya utilizado');
    } finally {
      setActivating(false);
    }
  };

  const handleExportQuarterlyPDF = async () => {
    try {
      setGeneratingPDF(true);
      const data = await companyAdminApi.getQuarterlyReport(pdfYear, pdfQuarter);
      exportQuarterlyReportPDF(data, user?.name ?? 'Restaurantes García S.L.');
      toast.success(`Informe PDF ${pdfQuarter}T ${pdfYear} generado`);
    } catch {
      toast.error('Error al generar el informe trimestral en PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleExportClosuresPDF = async () => {
    try {
      setGeneratingPDF(true);
      const res = await companyAdminApi.getCashClosures();
      exportCashClosuresPDF(res.data, res.totals);
      toast.success('Listado de cierres de caja exportado a PDF');
    } catch {
      toast.error('Error al exportar cierres de caja en PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleExportTicketsPDF = () => {
    if (tickets.length === 0) {
      toast.error('No hay ventas registradas para exportar');
      return;
    }
    exportTicketsPDF(tickets);
    toast.success('Listado de ventas exportado a PDF');
  };

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-base)', padding: '1.5rem' }}>
        <Toaster position="top-right" />
        <div style={{ maxWidth: 420, width: '100%', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '2.5rem', boxShadow: '0 8px 24px rgba(61,44,31,0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Tavolo Admin</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Panel de Gestión para Administradores de Restaurante / Negocio
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label className="form-label">Correo del Administrador</label>
              <input
                type="email"
                className="form-input"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@garcia.es"
                required
              />
            </div>

            <div>
              <label className="form-label">Contraseña</label>
              <input
                type="password"
                className="form-input"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '0.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
              {loading ? 'Iniciando sesión...' : 'Acceder al Panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalBilled = tickets.reduce((acc, t) => acc + Number(t.total), 0);
  const cashBilled = tickets.filter((ticket) => ticket.paymentMethod === 'CASH').reduce((acc, ticket) => acc + Number(ticket.total), 0);
  const cardBilled = tickets.filter((ticket) => ticket.paymentMethod === 'CARD').reduce((acc, ticket) => acc + Number(ticket.total), 0);
  const pendingAeat = tickets.filter((t) => t.aeatStatus === 'PENDING').length;
  const errorAeat = tickets.filter((t) => t.aeatStatus === 'ERROR' || t.aeatStatus === 'REJECTED').length;

  return (
    <div className="company-app">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="company-navbar">
        <div className="company-navbar__brand">
          <span className="company-navbar__mark" aria-hidden="true">T</span>
          <span><span className="company-navbar__title">Tavolo</span><span className="company-navbar__subtitle">Administración de sede</span></span>
          <span className="company-navbar__badge">Panel de Empresa</span>
        </div>
        <div className="company-navbar__actions">
          {venues.length > 1 && (
            <select
              className="form-select"
              aria-label="Sede activa"
              value={selectedVenueId ?? ''}
              onChange={(event) => {
                setSelectedVenueId(Number(event.target.value));
                void (async () => {
                  const venueId = Number(event.target.value);
                  const [prodList, categoryList, ticketList] = await Promise.all([
                    companyAdminApi.getProducts(venueId),
                    companyAdminApi.getCategories(venueId),
                    companyAdminApi.getTickets(venueId),
                  ]);
                  setProducts(prodList);
                  setCategories(categoryList);
                  setTickets(ticketList);
                })().catch(() => toast.error('No se pudieron cargar los datos de la sede'));
              }}
              style={{ width: 'auto', minWidth: 160 }}
            >
              {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          )}
          <span className="company-navbar__user">{user?.name ?? 'Administrador'}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void fetchCompanyData()}>
            Actualizar
          </button>
          <button type="button" className="btn btn-danger" onClick={handleLogout}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="company-main">
        {/* State Banner */}
        {licenseStatus && !licenseStatus.canOperate && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: '1.5rem', color: '#991b1b', fontSize: '0.9rem', fontWeight: 600 }}>
            Atención: La licencia de su empresa se encuentra suspendida o caducada. Active un nuevo código para continuar operando.
          </div>
        )}

        {/* Tab Switcher */}
        <div className="company-tabs">
          <button
            className={activeTab === 'dashboard' ? 'company-tab company-tab--active' : 'company-tab'}
            type="button"
            onClick={() => setActiveTab('dashboard')}
            style={{ padding: '0.75rem 1.25rem', fontWeight: 700, border: 'none', background: 'none', borderBottom: activeTab === 'dashboard' ? '3px solid var(--color-accent)' : 'none', color: activeTab === 'dashboard' ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Resumen General
          </button>
          <button
            className={activeTab === 'products' ? 'company-tab company-tab--active' : 'company-tab'}
            type="button"
            onClick={() => setActiveTab('products')}
            style={{ padding: '0.75rem 1.25rem', fontWeight: 700, border: 'none', background: 'none', borderBottom: activeTab === 'products' ? '3px solid var(--color-accent)' : 'none', color: activeTab === 'products' ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Catálogo & Stock ({products.length})
          </button>
          <button
            className={activeTab === 'tickets' ? 'company-tab company-tab--active' : 'company-tab'}
            type="button"
            onClick={() => setActiveTab('tickets')}
            style={{ padding: '0.75rem 1.25rem', fontWeight: 700, border: 'none', background: 'none', borderBottom: activeTab === 'tickets' ? '3px solid var(--color-accent)' : 'none', color: activeTab === 'tickets' ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Ventas & AEAT ({tickets.length})
          </button>
          <button
            className={activeTab === 'closures' ? 'company-tab company-tab--active' : 'company-tab'}
            type="button"
            onClick={() => setActiveTab('closures')}
            style={{ padding: '0.75rem 1.25rem', fontWeight: 700, border: 'none', background: 'none', borderBottom: activeTab === 'closures' ? '3px solid var(--color-accent)' : 'none', color: activeTab === 'closures' ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Cierres de Caja ({closures.length})
          </button>
          <button
            className={activeTab === 'reports' ? 'company-tab company-tab--active' : 'company-tab'}
            type="button"
            onClick={() => setActiveTab('reports')}
            style={{ padding: '0.75rem 1.25rem', fontWeight: 700, border: 'none', background: 'none', borderBottom: activeTab === 'reports' ? '3px solid var(--color-accent)' : 'none', color: activeTab === 'reports' ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Informes Trimestrales & PDF
          </button>
          <button
            className={activeTab === 'license' ? 'company-tab company-tab--active' : 'company-tab'}
            type="button"
            onClick={() => setActiveTab('license')}
            style={{ padding: '0.75rem 1.25rem', fontWeight: 700, border: 'none', background: 'none', borderBottom: activeTab === 'license' ? '3px solid var(--color-accent)' : 'none', color: activeTab === 'license' ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Licencia de Empresa
          </button>
        </div>

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <section>
            <div className="company-metrics">
              <div style={{ background: 'var(--color-bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>VENTAS TOTALES</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--color-accent)', marginTop: 4 }}>
                  {totalBilled.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{tickets.length} facturas registradas</div>
              </div>

              <div style={{ background: 'var(--color-bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>PRODUCTOS EN CATÁLOGO</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 4 }}>
                  {products.length}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {products.filter((p) => p.isStockControlEnabled && p.stockQuantity <= 5).length} con poco stock
                </div>
              </div>

              <div style={{ background: 'var(--color-bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>COBRADO EN EFECTIVO</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 4 }}>{cashBilled.toFixed(2)} €</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Ventas de la sede seleccionada</div>
              </div>

              <div style={{ background: 'var(--color-bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>COBRADO CON TARJETA</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 4 }}>{cardBilled.toFixed(2)} €</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Ventas de la sede seleccionada</div>
              </div>

              <div style={{ background: 'var(--color-bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>ESTADO ENVÍOS AEAT</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: pendingAeat + errorAeat > 0 ? '#d97706' : 'var(--color-success)', marginTop: 4 }}>
                  {pendingAeat + errorAeat === 0 ? 'Al día' : `${pendingAeat} pend. / ${errorAeat} fallos`}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Veri*Factu RD 1007/2023</div>
              </div>

              <div style={{ background: 'var(--color-bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>LICENCIA</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: licenseStatus?.canOperate ? 'var(--color-success)' : '#dc2626', marginTop: 4 }}>
                  {licenseStatus?.effectiveState ?? 'ACTIVE'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {licenseStatus?.daysRemaining ? `${licenseStatus.daysRemaining} días restantes` : 'Operativa'}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: CATÁLOGO Y CONTROL DE STOCK */}
        {activeTab === 'products' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Catálogo de Productos y Control de Inventario</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {venues.find((venue) => venue.id === selectedVenueId)?.name ?? 'Selecciona una sede'}
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => openProductForm()} disabled={!selectedVenueId || categories.length === 0}>
                + Nuevo artículo
              </button>
            </div>

            <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Precio (€)</th>
                    <th>IVA</th>
                    <th>Stock Actual</th>
                    <th>Control Stock</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.category?.name ?? 'General'}</td>
                      <td style={{ fontWeight: 700 }}>{Number(p.price).toFixed(2)} €</td>
                      <td>{Number(p.vatRate).toFixed(0)}%</td>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            color: !p.isStockControlEnabled
                              ? 'var(--color-text-muted)'
                              : p.stockQuantity <= 5
                              ? '#dc2626'
                              : 'var(--color-text-primary)',
                          }}
                        >
                          {p.isStockControlEnabled ? p.stockQuantity : 'Ilimitado'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: p.isStockControlEnabled ? '#166534' : 'var(--color-bg-secondary)',
                            color: p.isStockControlEnabled ? '#fff' : 'var(--color-text-muted)',
                          }}
                        >
                          {p.isStockControlEnabled ? 'ACTIVO' : 'DESACTIVADO'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                          onClick={() => {
                            setEditingProduct(p);
                            setNewStock(p.stockQuantity);
                            setStockControl(p.isStockControlEnabled);
                          }}
                        >
                          Editar Stock
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.78rem', marginLeft: 6 }}
                          onClick={() => openProductForm(p)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: '0.78rem', marginLeft: 6 }}
                          onClick={() => void handleDeleteProduct(p)}
                        >
                          Retirar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: VENTAS Y AEAT */}
        {activeTab === 'tickets' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Registro de Facturas Simplificadas y Veri*Factu</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Listado de tickets expedidos y estado de remisión fiscal a la AEAT.
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleExportTicketsPDF}>
                📄 Exportar Registro de Ventas a PDF
              </button>
            </div>

            <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código Factura</th>
                    <th>Fecha / Hora</th>
                    <th>Forma de Pago</th>
                    <th>Total (€)</th>
                    <th>Estado AEAT</th>
                    <th>Detalle Respuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700 }}>{t.invoiceCode}</td>
                      <td style={{ fontSize: '0.82rem' }}>{new Date(t.issuedAt).toLocaleString()}</td>
                      <td>{t.paymentMethod}</td>
                      <td style={{ fontWeight: 700 }}>{Number(t.total).toFixed(2)} €</td>
                      <td>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background:
                              t.aeatStatus === 'ACCEPTED'
                                ? '#166534'
                                : t.aeatStatus === 'PENDING'
                                ? '#b45309'
                                : '#b91c1c',
                            color: '#fff',
                          }}
                        >
                          {t.aeatStatus}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        {t.aeatResponseMsg ?? 'Sin incidencias'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 4: CIERRES DE CAJA */}
        {activeTab === 'closures' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Histórico de Cierres de Caja & Arqueos</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Total facturado en cierres: {closuresTotals.billedTotal.toFixed(2)} € ({closuresTotals.ticketCount} tickets)
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleExportClosuresPDF} disabled={generatingPDF}>
                📄 Exportar Cierres a PDF
              </button>
            </div>

            <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha Cierre</th>
                    <th>Sede / Local</th>
                    <th>Responsable</th>
                    <th>Apertura (€)</th>
                    <th>Tickets</th>
                    <th>Efectivo (€)</th>
                    <th>Tarjeta (€)</th>
                    <th>Total Facturado (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {closures.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                        No hay cierres de caja registrados.
                      </td>
                    </tr>
                  ) : (
                    closures.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{new Date(c.periodEnd).toLocaleString()}</td>
                        <td>{c.venue?.name ?? 'Sede Principal'}</td>
                        <td>{c.user?.name ?? 'Administrador'}</td>
                        <td>{Number(c.openingAmount).toFixed(2)} €</td>
                        <td style={{ fontWeight: 700 }}>{c.ticketCount}</td>
                        <td>{Number(c.cashSalesTotal ?? 0).toFixed(2)} €</td>
                        <td>{Number(c.cardSalesTotal ?? 0).toFixed(2)} €</td>
                        <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{Number(c.billedTotal).toFixed(2)} €</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 5: INFORMES TRIMESTRALES & EXPORTACIÓN PDF */}
        {activeTab === 'reports' && (
          <section style={{ maxWidth: 640 }}>
            <div style={{ background: 'var(--color-bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Generación de Informes Trimestrales de Ventas</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                Seleccione el año y trimestre fiscal para generar el informe oficial de ventas e IVA (Modelo 303 / Veri*Factu) en formato PDF para su gestoría.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label className="form-label">Año Fiscal</label>
                  <select className="form-select" value={pdfYear} onChange={(e) => setPdfYear(Number(e.target.value))}>
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Trimestre (Q)</label>
                  <select className="form-select" value={pdfQuarter} onChange={(e) => setPdfQuarter(Number(e.target.value))}>
                    <option value={1}>1T — Primer Trimestre (Ene - Mar)</option>
                    <option value={2}>2T — Segundo Trimestre (Abr - Jun)</option>
                    <option value={3}>3T — Tercer Trimestre (Jul - Sep)</option>
                    <option value={4}>4T — Cuarto Trimestre (Oct - Dic)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleExportQuarterlyPDF} disabled={generatingPDF} style={{ padding: '0.85rem', fontSize: '0.95rem', fontWeight: 700 }}>
                  {generatingPDF ? 'Generando PDF...' : `📄 Descargar PDF Informe Trimestral (${pdfQuarter}T ${pdfYear})`}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleExportClosuresPDF} disabled={generatingPDF} style={{ padding: '0.75rem' }}>
                  📄 Descargar PDF Histórico de Cierres de Caja
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleExportTicketsPDF} style={{ padding: '0.75rem' }}>
                  📄 Descargar PDF Registro de Ventas Completo
                </button>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: LICENCIA */}
        {activeTab === 'license' && (
          <section style={{ maxWidth: 540 }}>
            <div style={{ background: 'var(--color-bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Estado de Licencia de Empresa</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                Introduzca su código de activación enviado por el administrador del sistema para renovar la suscripción.
              </p>

              <div style={{ background: 'var(--color-bg-secondary)', padding: '1rem', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.88rem' }}>
                <div><strong>Estado Actual:</strong> {licenseStatus?.effectiveState ?? 'DESCONOCIDO'}</div>
                <div><strong>Días Restantes:</strong> {licenseStatus?.daysRemaining ?? '-'}</div>
                {licenseStatus?.validUntil && (
                  <div><strong>Válida hasta:</strong> {new Date(licenseStatus.validUntil).toLocaleDateString()}</div>
                )}
              </div>

              <form onSubmit={handleActivateLicense} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label className="form-label">Código de Licencia (8 a 64 caracteres)</label>
                  <input
                    className="form-input"
                    placeholder="Ej: TAVOLO-2026-ABCD-EFGH"
                    value={licenseCodeInput}
                    onChange={(e) => setLicenseCodeInput(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={activating} style={{ width: '100%', fontWeight: 700 }}>
                  {activating ? 'Activando...' : 'Activar Código de Licencia'}
                </button>
              </form>
            </div>
          </section>
        )}
      </main>

      {/* Modal crear / editar artículo */}
      {editingCatalogProduct && (
        <div className="company-modal-backdrop" role="presentation">
          <div className="company-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-product-title">
            <div className="company-modal__header">
              <div>
                <span className="company-eyebrow">Catálogo</span>
                <h3 id="catalog-product-title">{editingCatalogProduct.id ? 'Editar artículo' : 'Nuevo artículo'}</h3>
              </div>
              <button type="button" className="company-icon-button" aria-label="Cerrar" onClick={() => setEditingCatalogProduct(null)}>×</button>
            </div>
            <form onSubmit={handleSaveProduct} className="company-modal__body">
              <div>
                <label className="form-label">Nombre</label>
                <input className="form-input" required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
              </div>
              <div>
                <label className="form-label">Descripción</label>
                <input className="form-input" value={productForm.description ?? ''} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} />
              </div>
              <div className="company-form-grid">
                <div>
                  <label className="form-label">Precio (€)</label>
                  <input className="form-input" type="number" min="0.01" step="0.01" required value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: Number(event.target.value) })} />
                </div>
                <div>
                  <label className="form-label">IVA (%)</label>
                  <select className="form-select" value={productForm.vatRate} onChange={(event) => setProductForm({ ...productForm, vatRate: Number(event.target.value) })}>
                    <option value={0}>0%</option><option value={4}>4%</option><option value={10}>10%</option><option value={21}>21%</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Categoría</label>
                <select className="form-select" value={productForm.categoryId} required onChange={(event) => setProductForm({ ...productForm, categoryId: Number(event.target.value) })}>
                  <option value={0} disabled>Selecciona una categoría</option>
                  {categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div className="company-form-grid">
                <label className="company-checkbox"><input type="checkbox" checked={productForm.isAvailable} onChange={(event) => setProductForm({ ...productForm, isAvailable: event.target.checked })} /> Disponible en TPV</label>
                <label className="company-checkbox"><input type="checkbox" checked={productForm.isStockControlEnabled ?? false} onChange={(event) => setProductForm({ ...productForm, isStockControlEnabled: event.target.checked })} /> Control de stock</label>
              </div>
              {productForm.isStockControlEnabled && (
                <div>
                  <label className="form-label">Unidades en stock</label>
                  <input className="form-input" type="number" min="0" step="1" value={productForm.stockQuantity ?? 0} onChange={(event) => setProductForm({ ...productForm, stockQuantity: Number(event.target.value) })} />
                </div>
              )}
              <div className="company-modal__footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingCatalogProduct(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar artículo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Stock */}
      {editingProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--color-bg-card)', maxWidth: 440, width: '100%', borderRadius: 'var(--radius-lg)', padding: '1.5rem', border: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>Ajuste de Stock — {editingProduct.name}</h3>

            <form onSubmit={handleSaveStock} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label">Control de Stock Activado</label>
                <select
                  className="form-select"
                  value={stockControl ? 'true' : 'false'}
                  onChange={(e) => setStockControl(e.target.value === 'true')}
                >
                  <option value="true">SÍ (Descontar en cada venta)</option>
                  <option value="false">NO (Venta ilimitada)</option>
                </select>
              </div>

              {stockControl && (
                <div>
                  <label className="form-label">Cantidad Actual en Almacén</label>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    value={newStock}
                    onChange={(e) => setNewStock(Number(e.target.value))}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingProduct(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
