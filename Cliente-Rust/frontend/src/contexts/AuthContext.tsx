import React, { createContext, useContext, useEffect, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { authService, AuthSessionInfo } from '../services/auth.service';
import { useToasts } from './ToastContext';

interface AuthContextType {
  user: AuthSessionInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthSessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useToasts();

  const checkStatus = async () => {
    try {
      const session = await authService.status();
      setUser(session);
    } catch (error) {
      console.error('Failed to check auth status:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    let unlistenReady: UnlistenFn;
    let unlistenLogout: UnlistenFn;

    const setupListeners = async () => {
      // Evento emitido por el backend de Rust cuando el loopback server captura
      // el code de OAuth y Keycloak devuelve exitosamente el JWT validado.
      unlistenReady = await listen<AuthSessionInfo>('auth://session-ready', (event) => {
        console.log('Session ready event received', event.payload.preferred_username);
        setUser(event.payload);
        push({ type: 'success', message: `Sesión iniciada correctamente` });
      });

      // Evento emitido cuando se revoca la sesión.
      unlistenLogout = await listen('auth://logged-out', () => {
        console.log('Logged out event received');
        setUser(null);
      });
    };

    setupListeners();

    return () => {
      if (unlistenReady) unlistenReady();
      if (unlistenLogout) unlistenLogout();
    };
  }, []);

  const login = async () => {
    try {
      await authService.loginUrl();
      // Nota: El backend abrirá el navegador.
      // Cuando se complete, 'auth://session-ready' será emitido.
    } catch (error) {
      console.error('Failed to initialize login flow:', error);
      push({ type: 'error', message: 'Error al iniciar sesión' });
    }
  };

  const logout = async () => {
    try {
      // Indicamos que cargue mientras el backend hace el request a Keycloak
      setIsLoading(true); 
      await authService.logout();
      // El backend limpiará y emitirá 'auth://logged-out'
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
