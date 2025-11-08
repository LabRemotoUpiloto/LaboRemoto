import React, { useState } from 'react';
import './Header.css';
import { useToasts } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import Swal from 'sweetalert2';

type Tab = { id: string; type: 'home' | 'session' | 'log'; label: string }
interface HeaderProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
}

const Header: React.FC<HeaderProps> = ({ tabs, activeTabId, onTabClick, onCloseTab, onNewSession }) => {
  const { push } = useToasts();
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getRoleName = (roleId: number): string => {
    switch (roleId) {
      case 1: return 'Estudiante';
      case 2: return 'Profesor';
      case 3: return 'Administrador';
      default: return 'Usuario';
    }
  };

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: '¿Cerrar sesión?',
      text: '¿Estás seguro que deseas cerrar sesión?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#805ad5',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',
      background: 'var(--background-secondary)',
      color: 'var(--text-primary)',
    });

    if (result.isConfirmed) {
      logout();
      await Swal.fire({
        title: 'Sesión cerrada',
        text: 'Has cerrado sesión correctamente',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        background: 'var(--background-secondary)',
        color: 'var(--text-primary)',
      });
    }
  };
  
  return (
    <header className="app-header" role="banner">
      <nav className="tabs" role="tablist" aria-label="Pestañas de navegación">
        {tabs.map(t => (
          <div 
            key={t.id} 
            className={`tab ${activeTabId === t.id ? 'active' : ''}`} 
            onClick={() => onTabClick(t.id)}
            role="tab"
            aria-selected={activeTabId === t.id}
            aria-label={t.label}
            tabIndex={activeTabId === t.id ? 0 : -1}
          >
            <span title={t.label}>{t.label}</span>
            {(t.type === 'session' || t.type === 'log') && (
              <button 
                className="close-tab" 
                onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}
                aria-label={`Cerrar ${t.label}`}
                title="Cerrar pestaña (Ctrl+W)"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button 
          className="new-tab" 
          onClick={onNewSession}
          aria-label="Nueva sesión"
          title="Nueva sesión (Ctrl+T)"
        >
          +
        </button>
      </nav>

      {/* Profile Menu */}
      {user && (
        <div className="profile-section">
          <button 
            className="profile-button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            title={`${user.name} - ${getRoleName(user.role_id)}`}
          >
            <div className="profile-avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="profile-name">{user.name}</span>
          </button>

          {showProfileMenu && (
            <>
              <div 
                className="profile-menu-overlay" 
                onClick={() => setShowProfileMenu(false)}
              />
              <div className="profile-menu">
                <div className="profile-menu-header">
                  <div className="profile-menu-avatar">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="profile-menu-info">
                    <div className="profile-menu-name">{user.name}</div>
                    <div className="profile-menu-email">{user.email}</div>
                    <div className="profile-menu-role">{getRoleName(user.role_id)}</div>
                  </div>
                </div>
                <div className="profile-menu-divider" />
                <button 
                  className="profile-menu-item logout"
                  onClick={handleLogout}
                >
                  <span className="profile-menu-icon">🚪</span>
                  Cerrar Sesión
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
