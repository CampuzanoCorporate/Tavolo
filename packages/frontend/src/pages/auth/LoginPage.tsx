/**
 * TAVOLO POS — Página de Login
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { authApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAppStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const emailRef                = useRef<HTMLInputElement>(null);

  // Modal para cambio obligatorio de contraseña provisional
  const [showMustChangeModal, setShowMustChangeModal] = useState(false);
  const [pendingAuth, setPendingAuth] = useState<{ token: string; user: any; venueIds: number[]; provPassword: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const cacheOfflineCredentials = (userEmail: string, userPass: string, authData: any) => {
    try {
      const existingStr = localStorage.getItem('tavolo_cached_auth_users');
      const existing = existingStr ? JSON.parse(existingStr) : {};
      existing[userEmail.toLowerCase().trim()] = {
        password: userPass,
        data: authData,
        cachedAt: new Date().toISOString(),
      };
      localStorage.setItem('tavolo_cached_auth_users', JSON.stringify(existing));
    } catch {
      // Ignorar errores de almacenamiento local
    }
  };

  const tryOfflineLogin = (userEmail: string, userPass: string) => {
    try {
      const existingStr = localStorage.getItem('tavolo_cached_auth_users');
      if (!existingStr) return false;
      const existing = JSON.parse(existingStr);
      const cached = existing[userEmail.toLowerCase().trim()];
      if (cached && cached.password === userPass) {
        login(cached.data.token, cached.data.user, cached.data.venueIds);
        toast.success('Modo Offline: Sesión iniciada con credenciales verificadas localmente.');
        
        if (cached.data.venueIds.length === 1) {
          navigate(cached.data.user.role === 'KITCHEN' ? '/kitchen' : '/');
        } else {
          navigate('/select-venue');
        }
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  const proceedLogin = (token: string, user: any, venueIds: number[]) => {
    login(token, user, venueIds);
    if (venueIds.length === 0) {
      toast.error('No tienes sedes asignadas. Contacta con el administrador.');
      return;
    }

    if (venueIds.length === 1) {
      navigate(user.role === 'KITCHEN' ? '/kitchen' : '/');
    } else {
      navigate('/select-venue');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    // Si no hay conexión, intentar login offline inmediatamente
    if (!navigator.onLine) {
      const offlineSuccess = tryOfflineLogin(email, password);
      if (!offlineSuccess) {
        toast.error('Sin conexión a internet y no hay credenciales guardadas localmente para este usuario.');
      }
      setLoading(false);
      return;
    }

    try {
      const data = await authApi.login(email, password);
      cacheOfflineCredentials(email, password, data);

      if (data.user.mustChangePassword) {
        setPendingAuth({ token: data.token, user: data.user, venueIds: data.venueIds, provPassword: password });
        setShowMustChangeModal(true);
        toast.success('Primer inicio de sesión detectado. Por seguridad debes cambiar tu contraseña provisional.');
        return;
      }

      proceedLogin(data.token, data.user, data.venueIds);
    } catch (error: any) {
      const isNetworkErr = !error?.response && (error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error'));
      if (isNetworkErr) {
        const offlineSuccess = tryOfflineLogin(email, password);
        if (offlineSuccess) {
          setLoading(false);
          return;
        }
      }

      const apiMessage = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.error
        : null;

      toast.error(apiMessage || 'Email o contraseña incorrectos');
      emailRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAuth) return;
    if (newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    try {
      setChangingPass(true);
      // Guardar token temporalmente en localStorage para que interceptor de apiClient lo envíe
      localStorage.setItem('tavolo_token', pendingAuth.token);
      await authApi.changePassword(pendingAuth.provPassword, newPassword);

      toast.success('¡Contraseña actualizada correctamente!');
      setShowMustChangeModal(false);

      // Actualizar credenciales cacheadas offline con la nueva contraseña
      const updatedUser = { ...pendingAuth.user, mustChangePassword: false };
      cacheOfflineCredentials(pendingAuth.user.email, newPassword, {
        token: pendingAuth.token,
        user: updatedUser,
        venueIds: pendingAuth.venueIds,
      });

      proceedLogin(pendingAuth.token, updatedUser, pendingAuth.venueIds);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo actualizar la contraseña');
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <div className="login-page">
      {/* Background decorativo */}
      <div className="login-bg-orb login-bg-orb--1" />
      <div className="login-bg-orb login-bg-orb--2" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
          <img 
            src="/Logo_Tavolo.png" 
            alt="Tavolo Logo" 
            style={{ height: '64px', width: 'auto', objectFit: 'contain' }} 
          />
          <span className="login-logo__subtitle">Sistema TPV Profesional</span>
        </div>

        <p className="login-welcome">Inicia sesión en tu cuenta</p>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              ref={emailRef}
              id="login-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.es"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            id="btn-login"
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || !email || !password}
            style={{ marginTop: 'var(--space-4)' }}
          >
            {loading ? 'Iniciando sesión...' : 'Acceder'}
          </button>
        </form>

        <div className="login-footer">
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
            ¿Problemas de acceso? Contacta con tu administrador.
          </span>
        </div>
      </div>

      {/* MODAL OBLIGATORIO: PRIMER INICIO DE SESIÓN — CAMBIO DE CONTRASEÑA */}
      {showMustChangeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1.5rem' }}>
          <div style={{ background: 'var(--color-surface)', maxWidth: 460, width: '100%', borderRadius: 'var(--radius-xl)', padding: '2rem', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔐</div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                Primer Inicio de Sesión
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                Estás accediendo con una contraseña provisional. Por seguridad, debes establecer tu contraseña definitiva para continuar.
              </p>
            </div>

            <form onSubmit={handleChangePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div className="form-group">
                <label className="form-label">Nueva Contraseña Definitiva</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={changingPass || !newPassword || !confirmPassword}
                style={{ fontWeight: 700 }}
              >
                {changingPass ? 'Guardando contraseña...' : 'Establecer Contraseña Definitiva y Acceder'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
