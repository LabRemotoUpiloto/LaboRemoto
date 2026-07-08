import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  
  // Ref para tener acceso al estado actual dentro del callback del listener
  const userRef = useRef<AuthSessionInfo | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

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

    const unlistenReadyPromise = listen<AuthSessionInfo>('auth://session-ready', (event) => {
      console.log('Session ready event received', event.payload.preferred_username);
      
      // Evaluamos el estado previo para no disparar la notificación en cada refresco silencioso
      if (!userRef.current) {
        push({ type: 'success', message: `Sesión iniciada correctamente` });
      }
      
      setUser(event.payload);
    });

    const unlistenLogoutPromise = listen('auth://logged-out', () => {
      console.log('Logged out event received');
      setUser(null);
    });

    // Cleanup: manejamos las promesas para evitar que se acumulen listeners en el Strict Mode
    return () => {
      unlistenReadyPromise.then(unlisten => unlisten());
      unlistenLogoutPromise.then(unlisten => unlisten());
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
