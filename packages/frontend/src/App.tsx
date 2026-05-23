/**
 * TAVOLO POS — Router y Layout Principal
 */
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import { TableMapPage } from './pages/TableMapPage';
import { POSPage } from './pages/POSPage';
import { KitchenPage } from './pages/KitchenPage';
import { LoginPage } from './pages/auth/LoginPage';
import { VenueSelectorPage } from './pages/auth/VenueSelectorPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { VenuesPage } from './pages/admin/VenuesPage';
import { VenueFormPage } from './pages/admin/VenueFormPage';
import { ProductsAdminPage } from './pages/admin/ProductsAdminPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { TablesAdminPage } from './pages/admin/TablesAdminPage';
import { PrintersAdminPage } from './pages/admin/PrintersAdminPage';
import { TicketsLogPage } from './pages/admin/TicketsLogPage';
import { useAppStore } from './store/useAppStore';
import { countPendingOrders } from './services/offlineStorage';

// ── PROTECCIÓN DE RUTAS ──────────────────────────────────────────────────────

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentVenueId, currentUser } = useAppStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser?.role === 'KITCHEN' && window.location.pathname === '/') {
    return <Navigate to="/kitchen" replace />;
  }

  // Si está autenticado pero tiene múltiples sedes y no ha elegido una, ir a selector
  if (!currentVenueId && window.location.pathname !== '/select-venue') {
    return <Navigate to="/select-venue" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppStore();
  
  if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'MANAGER')) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// ── NAVBAR PRINCIPAL ─────────────────────────────────────────────────────────

function Navbar() {
  const { setIsOnline, pendingOrdersCount, setPendingOrdersCount, currentUser, currentVenue, logout } = useAppStore();
  const location = useLocation();
  const isPOS = location.pathname.startsWith('/pos/');
  const isAdmin = location.pathname.startsWith('/admin');
  const isKitchen = location.pathname.startsWith('/kitchen');
  const canAccessAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER');

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsOnline]);

  // Actualizar conteo de comandas offline
  useEffect(() => {
    const update = async () => setPendingOrdersCount(await countPendingOrders());
    update();
    const interval = setInterval(update, 10_000);
    return () => clearInterval(interval);
  }, [setPendingOrdersCount]);

  // No renderizar Navbar en Login o Selector de sede
  if (location.pathname === '/login' || location.pathname === '/select-venue') {
    return null;
  }

  return (
    <header className="navbar">
      {/* Logo */}
      <div className="navbar__logo" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <img 
          src="/Logo_Tavolo.png" 
          alt="Tavolo Logo" 
          style={{ height: '32px', width: 'auto', objectFit: 'contain' }} 
        />
        <span style={{
          fontSize: '0.65rem',
          color: 'var(--color-text-muted)',
          fontWeight: 400,
          background: 'var(--color-surface-3)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--color-border)',
        }}>POS</span>
        {currentVenue && (
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--color-accent)',
            marginLeft: 'var(--space-2)',
            paddingLeft: 'var(--space-2)',
            borderLeft: '1px solid var(--color-border)'
          }}>
            {currentVenue.name}
          </span>
        )}
      </div>

      {/* Navegación */}
      {!isPOS && !isAdmin && !isKitchen && canAccessAdmin && (
        <nav className="navbar__nav navbar__nav--switcher">
          <NavLink
            to="/"
            id="nav-tables"
            className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
          >
            Mesas
          </NavLink>
          <NavLink
            to="/admin"
            id="nav-admin"
            className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
          >
            Administración
          </NavLink>
        </nav>
      )}

      {/* Estado de conexión / Usuario */}
      <div className="navbar__status">
        {pendingOrdersCount > 0 && (
          <span style={{
            fontSize: '0.75rem',
            background: 'rgba(245, 158, 11, 0.15)',
            color: 'var(--color-accent)',
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}>
            {pendingOrdersCount} comanda{pendingOrdersCount > 1 ? 's' : ''} offline
          </span>
        )}

        {currentUser && !isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginLeft: 'var(--space-2)', borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--space-3)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{currentUser.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ── CONFIGURACIÓN DEL ROUTER PRINCIPAL ───────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        {/* Rutas Públicas */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rutas Privadas Protegidas */}
        <Route path="/select-venue" element={
          <PrivateRoute>
            <VenueSelectorPage />
          </PrivateRoute>
        } />
        
        <Route path="/" element={
          <PrivateRoute>
            <TableMapPage />
          </PrivateRoute>
        } />

        <Route path="/kitchen" element={
          <PrivateRoute>
            <KitchenPage />
          </PrivateRoute>
        } />
        
        <Route path="/pos/:tableId" element={
          <PrivateRoute>
            <POSPage />
          </PrivateRoute>
        } />

        {/* Rutas Admin Protegidas */}
        <Route path="/admin" element={
          <PrivateRoute>
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          </PrivateRoute>
        }>
          <Route index element={<AdminDashboardPage />} />
          <Route path="venues" element={<VenuesPage />} />
          <Route path="venues/new" element={<VenueFormPage />} />
          <Route path="venues/:id" element={<VenueFormPage />} />
          <Route path="venues/:id/tables" element={<TablesAdminPage />} />
          <Route path="venues/:id/printers" element={<PrintersAdminPage />} />
          <Route path="products" element={<ProductsAdminPage />} />
          <Route path="users" element={<UsersAdminPage />} />
          <Route path="tickets" element={<TicketsLogPage />} />
        </Route>
      </Routes>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.875rem',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#0f1523' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#0f1523' },
          },
        }}
      />
    </BrowserRouter>
  );
}
