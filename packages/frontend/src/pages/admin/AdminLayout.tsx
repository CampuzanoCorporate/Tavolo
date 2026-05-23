/**
 * TAVOLO POS — Layout del Panel de Administración
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { to: '/admin',          label: 'Resumen', end: true },
  { to: '/admin/venues',   label: 'Sedes' },
  { to: '/admin/products', label: 'Catálogo' },
  { to: '/admin/users',    label: 'Usuarios' },
  { to: '/admin/tickets',  label: 'Histórico' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { currentUser, logout, currentVenue } = useAppStore();

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
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              id={`admin-nav-${item.label.toLowerCase()}`}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="admin-nav-item__line" aria-hidden="true" />
              <span>{item.label}</span>
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
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
