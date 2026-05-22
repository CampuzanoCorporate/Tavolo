/**
 * TAVOLO POS — Admin: Gestión de Usuarios y Roles
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import type { Venue } from '../../types';

interface VenueUserRelation {
  venueId: number;
  userId: number;
  venue: {
    id: number;
    name: string;
  };
}

interface UserListItem {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN';
  isActive: boolean;
  createdAt: string;
  venueUsers: VenueUserRelation[];
}

export function UsersAdminPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN'>('WAITER');
  const [isActive, setIsActive] = useState(true);
  const [selectedVenueIds, setSelectedVenueIds] = useState<number[]>([]);

  const loadData = async () => {
    try {
      const u = await adminApi.getUsers();
      setUsers(u);
      const v = await adminApi.getVenues();
      setVenues(v);
    } catch {
      toast.error('Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNewUserModal = () => {
    setSelectedUserId(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('WAITER');
    setIsActive(true);
    setSelectedVenueIds([]);
    setModalOpen(true);
  };

  const openEditUserModal = (u: UserListItem) => {
    setSelectedUserId(u.id);
    setName(u.name);
    setEmail(u.email);
    setPassword(''); // Dejar en blanco para no cambiarla
    setRole(u.role);
    setIsActive(u.isActive);
    setSelectedVenueIds(u.venueUsers.map((vu) => vu.venueId));
    setModalOpen(true);
  };

  const handleVenueToggle = (venueId: number) => {
    setSelectedVenueIds((prev) =>
      prev.includes(venueId) ? prev.filter((id) => id !== venueId) : [...prev, venueId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (selectedUserId) {
        // Update
        const payload: Record<string, unknown> = {
          name,
          role,
          isActive,
          venueIds: selectedVenueIds,
        };
        if (password) payload.password = password;

        await adminApi.updateUser(selectedUserId, payload);
        toast.success('Usuario actualizado');
      } else {
        // Create
        if (!password) {
          toast.error('La contraseña es obligatoria para nuevos usuarios');
          setSaving(false);
          return;
        }
        await adminApi.createUser({
          name,
          email,
          password,
          role,
          venueIds: selectedVenueIds,
        });
        toast.success('Usuario creado con éxito');
      }
      setModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin-loading">Cargando usuarios...</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Usuarios y roles</h1>
          <p className="admin-page-subtitle">Gestiona las credenciales de acceso y permisos por sede</p>
        </div>
        <button id="btn-new-user" className="btn btn-primary" onClick={openNewUserModal}>
          + Nuevo Usuario
        </button>
      </div>

      <section className="admin-section">
        <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Sedes Asignadas</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`admin-badge ${
                      u.role === 'ADMIN' ? 'admin-badge--success' : 
                      u.role === 'MANAGER' ? 'admin-badge--info' : 'admin-badge--muted'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {u.venueUsers.length === 0 ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          {u.role === 'ADMIN' ? 'Acceso Global' : 'Ninguna'}
                        </span>
                      ) : (
                        u.venueUsers.map((vu) => (
                          <span key={vu.venueId} className="admin-code" style={{ fontSize: '0.7rem' }}>
                            {vu.venue.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`admin-badge ${u.isActive ? 'admin-badge--success' : 'admin-badge--muted'}`}>
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      id={`btn-edit-user-${u.id}`}
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEditUserModal(u)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Form */}
      {modalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: 600, width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedUserId ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="user-name">Nombre *</label>
                <input
                  id="user-name"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ej: Laura Martínez"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-email">Email *</label>
                <input
                  id="user-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={!!selectedUserId}
                  placeholder="laura@restaurante.com"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-password">
                  Contraseña {selectedUserId && '(dejar en blanco para mantener actual)'} *
                </label>
                <input
                  id="user-password"
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!selectedUserId}
                  placeholder="••••••"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="user-role">Rol de Usuario *</label>
                  <select
                    id="user-role"
                    className="form-select"
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN')}
                  >
                    <option value="ADMIN">ADMIN (Acceso Total)</option>
                    <option value="MANAGER">MANAGER (Gestor de Sedes)</option>
                    <option value="WAITER">WAITER (Camarero)</option>
                    <option value="KITCHEN">KITCHEN (Cocina)</option>
                  </select>
                </div>

                {selectedUserId && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="user-status">Estado *</label>
                    <select
                      id="user-status"
                      className="form-select"
                      value={isActive ? 'true' : 'false'}
                      onChange={(e) => setIsActive(e.target.value === 'true')}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Asignación de Sedes */}
              <div className="form-group">
                <label className="form-label">Sedes con Acceso (Requerido para Manager, Waiter y Kitchen)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  {venues.map((v) => (
                    <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedVenueIds.includes(v.id)}
                        onChange={() => handleVenueToggle(v.id)}
                      />
                      <span>{v.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button id="btn-save-user" type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
