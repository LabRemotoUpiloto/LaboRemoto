import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface User {
  user_id: string;
  username: string;
  email: string;
  name: string;
  role_id: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  hasRole: (roleId: number) => boolean;
  isStudent: boolean;
  isProfessor: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar sesión desde localStorage al montar
  useEffect(() => {
    const loadSession = async () => {
      try {
        const savedToken = localStorage.getItem('auth_token');
        const savedUser = localStorage.getItem('user_data');

        if (savedToken && savedUser) {
          // Validar el token con el backend
          const isValid = await invoke<boolean>('validate_token', {
            token: savedToken,
          });

          if (isValid) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
          } else {
            // Token inválido o expirado, limpiar
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
          }
        }
      } catch (error) {
        console.error('Error validando sesión:', error);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('user_data', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
  };

  const hasRole = (roleId: number): boolean => {
    return user?.role_id === roleId;
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
    hasRole,
    isStudent: user?.role_id === 1,
    isProfessor: user?.role_id === 2,
    isAdmin: user?.role_id === 3,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}

// Hook para obtener el nombre del rol
export function useRoleName(roleId?: number): string {
  const { user } = useAuth();
  const id = roleId ?? user?.role_id;
  
  switch (id) {
    case 1: return 'Estudiante';
    case 2: return 'Profesor';
    case 3: return 'Administrador';
    default: return 'Usuario';
  }
}
