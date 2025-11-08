import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './LdapLoginPage.css';

interface LoginResponse {
  success: boolean;
  user_id: string;
  username: string;
  email: string;
  name: string;
  role_id: number;
  token: string;
  auth_mode: string; // "mock" o "ldap"
}

interface LdapLoginPageProps {
  onLoginSuccess: (user: LoginResponse) => void;
}

export default function LdapLoginPage({ onLoginSuccess }: LdapLoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await invoke<LoginResponse>('login', {
        username,
        password,
      });

      if (response.success) {
        // Guardar token y datos del usuario en localStorage
        localStorage.setItem('auth_token', response.token);
        localStorage.setItem('auth_mode', response.auth_mode);
        localStorage.setItem('user_data', JSON.stringify({
          user_id: response.user_id,
          username: response.username,
          email: response.email,
          name: response.name,
          role_id: response.role_id,
        }));

        // Notificar al componente padre
        onLoginSuccess(response);
      } else {
        setError('Error de autenticación');
      }
    } catch (err: any) {
      console.error('Error en login:', err);
      setError(err?.toString() || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const getRoleName = (roleId: number): string => {
    switch (roleId) {
      case 1: return 'Estudiante';
      case 2: return 'Profesor';
      case 3: return 'Administrador';
      default: return 'Usuario';
    }
  };

  return (
    <div className="ldap-login-container">
      <div className="ldap-login-card">
        <div className="ldap-login-header">
          <h1>Iniciar Sesión</h1>
          <p>Cliente SSH Universidad</p>
        </div>

        <form onSubmit={handleSubmit} className="ldap-login-form">
          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tu usuario universitario"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading || !username || !password}
          >
            {loading ? 'Autenticando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="ldap-login-footer">
          <p className="help-text">
            Usa tus credenciales universitarias para acceder
          </p>
        </div>
      </div>

      {/* Testing info - solo en desarrollo */}
      <div className="dev-testing-info">
        <h3>🧪 Usuarios de Prueba</h3>
        <p>Password para todos: <code>test123</code></p>
        <ul>
          <li><strong>estudiante1</strong> → {getRoleName(1)}</li>
          <li><strong>profesor</strong> → {getRoleName(2)}</li>
          <li><strong>admin</strong> → {getRoleName(3)}</li>
        </ul>
        <p className="note">
          Modo actual: MOCK (desarrollo)
        </p>
      </div>
    </div>
  );
}
