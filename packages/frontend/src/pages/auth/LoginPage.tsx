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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const data = await authApi.login(email, password);
      login(data.token, data.user, data.venueIds);

      if (data.venueIds.length === 0) {
        toast.error('No tienes sedes asignadas. Contacta con el administrador.');
        return;
      }

      if (data.venueIds.length === 1) {
        navigate(data.user.role === 'KITCHEN' ? '/kitchen' : '/');
      } else {
        navigate('/select-venue');
      }
    } catch (error) {
      const apiMessage = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.error
        : null;

      toast.error(apiMessage || 'Email o contraseña incorrectos');
      emailRef.current?.focus();
    } finally {
      setLoading(false);
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
    </div>
  );
}
