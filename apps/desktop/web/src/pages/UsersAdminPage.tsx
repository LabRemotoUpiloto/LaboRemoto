import React, { useEffect, useState } from 'react';
import './UsersAdminPage.css';
import { useAuth } from '../contexts/AuthContext';
import { useToasts } from '../contexts/ToastContext';
import { invoke } from '@tauri-apps/api/core';
import Swal from 'sweetalert2';

interface User {
  id: string;
  username: string;
  email: string | null;
  role_id: number;
  is_active: boolean;
  ldap_username: string | null;
  is_mock_user: boolean;
  created_at: string;
}

interface UserStats {
  total: number;
  students: number;
  professors: number;
  admins: number;
  active: number;
  inactive: number;
}

const UsersAdminPage: React.FC = () => {
  const { user } = useAuth();
  const { push } = useToasts();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<number | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const [usersData, statsData] = await Promise.all([
        invoke<User[]>('list_all_users', {
          requestingUserId: user.user_id,
          requestingRoleId: user.role_id
        }),
        invoke<UserStats>('get_user_statistics', {
          requestingUserId: user.user_id,
          requestingRoleId: user.role_id
        })
      ]);

      setUsers(usersData);
      setStats(statsData);
      console.log(`✅ Loaded ${usersData.length} users and stats`);
    } catch (error) {
      console.error('Error loading users:', error);
      push({
        message: 'Error al cargar usuarios: ' + error,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const getRoleName = (roleId: number): string => {
    switch (roleId) {
      case 1: return 'Estudiante';
      case 2: return 'Profesor';
      case 3: return 'Administrador';
      default: return 'Desconocido';
    }
  };

  const getRoleColor = (roleId: number): string => {
    switch (roleId) {
      case 1: return '#3498db'; // Azul
      case 2: return '#9b59b6'; // Morado
      case 3: return '#e74c3c'; // Rojo
      default: return '#95a5a6';
    }
  };

  const handleChangeRole = async (userId: string, currentRole: number, username: string) => {
    const roles = [
      { value: 1, label: 'Estudiante' },
      { value: 2, label: 'Profesor' },
      { value: 3, label: 'Administrador' }
    ];

    const { value: newRole } = await Swal.fire({
      title: `Cambiar rol de ${username}`,
      input: 'select',
      inputOptions: {
        '1': 'Estudiante',
        '2': 'Profesor',
        '3': 'Administrador'
      },
      inputValue: currentRole,
      showCancelButton: true,
      confirmButtonText: 'Cambiar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#805ad5',
      background: 'var(--background-secondary)',
      color: 'var(--text-primary)',
    });

    if (newRole && parseInt(newRole) !== currentRole) {
      try {
        await invoke('update_user', {
          requestingUserId: user!.id,
          requestingRoleId: user!.role_id,
          request: {
            user_id: userId,
            role_id: parseInt(newRole),
            is_active: null
          }
        });

        await Swal.fire({
          title: '¡Rol actualizado!',
          text: `El rol de ${username} ha sido cambiado a ${getRoleName(parseInt(newRole))}`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false,
          background: 'var(--background-secondary)',
          color: 'var(--text-primary)',
        });

        loadData();
      } catch (error) {
        Swal.fire({
          title: 'Error',
          text: 'Error al actualizar rol: ' + error,
          icon: 'error',
          background: 'var(--background-secondary)',
          color: 'var(--text-primary)',
        });
      }
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean, username: string) => {
    const action = currentStatus ? 'desactivar' : 'activar';
    
    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} usuario?`,
      text: `¿Estás seguro que deseas ${action} a ${username}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: currentStatus ? '#e74c3c' : '#27ae60',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar',
      background: 'var(--background-secondary)',
      color: 'var(--text-primary)',
    });

    if (result.isConfirmed) {
      try {
        await invoke('update_user', {
          requestingUserId: user!.id,
          requestingRoleId: user!.role_id,
          request: {
            user_id: userId,
            role_id: null,
            is_active: !currentStatus
          }
        });

        await Swal.fire({
          title: '¡Actualizado!',
          text: `Usuario ${action}do exitosamente`,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          background: 'var(--background-secondary)',
          color: 'var(--text-primary)',
        });

        loadData();
      } catch (error) {
        Swal.fire({
          title: 'Error',
          text: 'Error al actualizar usuario: ' + error,
          icon: 'error',
          background: 'var(--background-secondary)',
          color: 'var(--text-primary)',
        });
      }
    }
  };

  // Filtrado de usuarios
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.ldap_username && u.ldap_username.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesRole = filterRole === 'all' || u.role_id === filterRole;
    const matchesStatus = 
      filterStatus === 'all' ||
      (filterStatus === 'active' && u.is_active) ||
      (filterStatus === 'inactive' && !u.is_active);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  if (loading) {
    return (
      <div className="users-admin-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-admin-page">
      <header className="page-header">
        <h1>👥 Gestión de Usuarios</h1>
        <p className="subtitle">Administra los usuarios del sistema</p>
      </header>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Usuarios</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👨‍🎓</div>
            <div className="stat-content">
              <div className="stat-value">{stats.students}</div>
              <div className="stat-label">Estudiantes</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👨‍🏫</div>
            <div className="stat-content">
              <div className="stat-value">{stats.professors}</div>
              <div className="stat-label">Profesores</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👑</div>
            <div className="stat-content">
              <div className="stat-value">{stats.admins}</div>
              <div className="stat-label">Administradores</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <div className="stat-value">{stats.active}</div>
              <div className="stat-label">Activos</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">❌</div>
            <div className="stat-content">
              <div className="stat-value">{stats.inactive}</div>
              <div className="stat-label">Inactivos</div>
            </div>
          </div>
        </div>
      )}

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Buscar por usuario, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
            <option value="all">Todos los roles</option>
            <option value="1">Estudiantes</option>
            <option value="2">Profesores</option>
            <option value="3">Administradores</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Tipo</th>
              <th>Fecha Creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} className={!u.is_active ? 'inactive-row' : ''}>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar" style={{ background: `linear-gradient(135deg, ${getRoleColor(u.role_id)}, ${getRoleColor(u.role_id)}99)` }}>
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info">
                      <div className="user-name">{u.username}</div>
                      {u.ldap_username && <div className="user-ldap">LDAP: {u.ldap_username}</div>}
                    </div>
                  </div>
                </td>
                <td>{u.email || '-'}</td>
                <td>
                  <span className="role-badge" style={{ backgroundColor: getRoleColor(u.role_id) }}>
                    {getRoleName(u.role_id)}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${u.is_active ? 'active' : 'inactive'}`}>
                    {u.is_active ? '✓ Activo' : '✗ Inactivo'}
                  </span>
                </td>
                <td>
                  <span className={`type-badge ${u.is_mock_user ? 'mock' : 'ldap'}`}>
                    {u.is_mock_user ? '🔧 Mock' : '🔐 LDAP'}
                  </span>
                </td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn-action btn-role"
                      onClick={() => handleChangeRole(u.id, u.role_id, u.username)}
                      title="Cambiar rol"
                    >
                      🔄
                    </button>
                    <button
                      className={`btn-action ${u.is_active ? 'btn-deactivate' : 'btn-activate'}`}
                      onClick={() => handleToggleActive(u.id, u.is_active, u.username)}
                      title={u.is_active ? 'Desactivar' : 'Activar'}
                      disabled={u.id === user?.id}
                    >
                      {u.is_active ? '🔒' : '🔓'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="no-results">
            <p>No se encontraron usuarios con los filtros aplicados</p>
          </div>
        )}
      </div>

      <div className="results-footer">
        Mostrando {filteredUsers.length} de {users.length} usuarios
      </div>
    </div>
  );
};

export default UsersAdminPage;

