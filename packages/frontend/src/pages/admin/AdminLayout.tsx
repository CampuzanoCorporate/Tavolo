/**
 * TAVOLO POS — Layout del Panel de Administración
 */
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import toast from 'react-hot-toast';
import type { AppPermission } from '../../types';

const NAV_ITEMS = [
  { to: '/admin',          label: 'Resumen', end: true, icon: 'dashboard' as const, permission: 'VIEW_OWNER_DASHBOARD' as AppPermission },
  { to: '/admin/venues',   label: 'Sedes', icon: 'venues' as const, permission: 'MANAGE_VENUES' as AppPermission },
  { to: '/admin/products', label: 'Catálogo', icon: 'catalog' as const, permission: 'MANAGE_CATALOG' as AppPermission },
  { to: '/admin/users',    label: 'Usuarios', icon: 'users' as const, permission: 'MANAGE_USERS' as AppPermission },
  { to: '/admin/licensing', label: 'Licencia', icon: 'license' as const, permission: 'MANAGE_VENUES' as AppPermission },
  { to: '/admin/tickets',  label: 'Histórico', icon: 'history' as const, permission: 'VIEW_FINANCIALS' as AppPermission },
];

function AdminNavIcon({ type }: { type: 'dashboard' | 'venues' | 'catalog' | 'users' | 'license' | 'history' }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (type) {
    case 'dashboard':
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case 'venues':
      return (
        <svg {...commonProps}>
          <path d="M4 20V7.5L12 4l8 3.5V20" />
          <path d="M9 20v-5h6v5" />
          <path d="M8 10h.01" />
          <path d="M16 10h.01" />
        </svg>
      );
    case 'catalog':
      return (
        <svg {...commonProps}>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3Z" />
          <path d="M8 4v16" />
          <path d="M11 8h5" />
          <path d="M11 12h5" />
        </svg>
      );
    case 'users':
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3" />
          <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 4.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case 'license':
      return (
        <svg {...commonProps}>
          <path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'history':
      return (
        <svg {...commonProps}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
  }
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, currentVenue } = useAppStore();
  const availableNavItems = NAV_ITEMS.filter((item) => currentUser?.role === 'ADMIN' || currentUser?.permissions?.includes(item.permission));
  const isDashboard = location.pathname === '/admin';

  const handleLogout = () => {
    logout();
    toast.success('Sesión cerrada');
    navigate('/login');
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
          <img 
            src="/Logo_Tavolo.png" 
            alt="Tavolo Logo" 
            style={{ height: '36px', width: 'auto', objectFit: 'contain' }} 
          />
          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Panel de gestión</div>
        </div>

        {currentVenue && (
          <div className="admin-sidebar__venue">
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sede activa</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{currentVenue.name}</span>
          </div>
        )}

        <nav className="admin-sidebar__nav">
          {availableNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              id={`admin-nav-${item.label.toLowerCase()}`}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="admin-nav-item__icon" aria-hidden="true">
                <AdminNavIcon type={item.icon} />
              </span>
              <span className="admin-nav-item__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          {currentUser && (
            <div className="admin-sidebar__user">
              <div className="admin-sidebar__avatar">
                {currentUser.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentUser.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{currentUser.role}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button
              id="btn-go-pos"
              className="btn btn-ghost"
              onClick={() => navigate('/')}
              style={{ flex: 1, fontSize: '0.8rem' }}
            >
              Ir a mesas
            </button>
            <button
              id="btn-admin-logout"
              className="btn btn-danger"
              onClick={handleLogout}
              style={{ flex: 1, fontSize: '0.8rem' }}
            >
              Salir
            </button>
          </div>
        </div>
      </aside>

      {/* Contenido */}
      <main className={`admin-main ${isDashboard ? 'admin-main--dashboard' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
