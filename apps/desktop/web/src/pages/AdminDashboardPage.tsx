import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAuth } from '../contexts/AuthContext'
import { useToasts } from '../contexts/ToastContext'
import './AdminDashboardPage.css'

interface RecentUser {
  id: string
  username: string
  email: string
  role_id: number
  created_at: string
}

interface RecentSession {
  id: string
  username: string
  hostname: string
  started_at: string
  duration_minutes?: number
}

interface AdminDashboardStats {
  total_users: number
  total_students: number
  total_professors: number
  total_admins: number
  active_users: number
  inactive_users: number
  total_sessions_all_time: number
  sessions_this_week: number
  recent_users: RecentUser[]
  recent_sessions_global: RecentSession[]
}

const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth()
  const { showToast } = useToasts()
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [user])

  const loadStats = async () => {
    if (!user) return

    try {
      setLoading(true)
      const result = await invoke<AdminDashboardStats>('get_admin_dashboard_stats', {
        requestingRoleId: user.role_id,
      })
      setStats(result)
    } catch (error) {
      console.error('Error al cargar estadísticas:', error)
      showToast('Error al cargar estadísticas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getRoleName = (roleId: number) => {
    switch (roleId) {
      case 1:
        return 'Estudiantes'
      case 2:
        return 'Profesores'
      case 3:
        return 'Administradores'
      default:
        return 'Desconocido'
    }
  }

  const getRoleIcon = (roleId: number) => {
    switch (roleId) {
      case 1:
        return '🎓'
      case 2:
        return '👨‍🏫'
      case 3:
        return '👑'
      default:
        return '👤'
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const getTotalUsers = () => {
    if (!stats) return 0
    return stats.total_users
  }

  const getTotalActiveUsers = () => {
    if (!stats) return 0
    return stats.active_users
  }

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Cargando estadísticas...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="admin-dashboard">
        <div className="error-message">
          <h2>⚠️ Error</h2>
          <p>No se pudieron cargar las estadísticas</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1>👑 Dashboard de Administrador</h1>
        <p className="subtitle">Vista completa del sistema y actividad global</p>
      </div>

      {/* Tarjetas de estadísticas globales */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Usuarios Totales</h3>
            <p className="stat-value">{getTotalUsers()}</p>
            <p className="stat-subtext">{getTotalActiveUsers()} activos</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔌</div>
          <div className="stat-content">
            <h3>Sesiones Totales</h3>
            <p className="stat-value">{stats.total_sessions_all_time}</p>
            <p className="stat-subtext">Histórico completo</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Esta Semana</h3>
            <p className="stat-value">{stats.sessions_this_week}</p>
            <p className="stat-subtext">Últimos 7 días</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <h3>Promedio Diario</h3>
            <p className="stat-value">{Math.round(stats.sessions_this_week / 7)}</p>
            <p className="stat-subtext">Sesiones/día</p>
          </div>
        </div>
      </div>

      {/* Distribución por roles */}
      <div className="section">
        <h2>👥 Distribución de Usuarios por Rol</h2>
        <div className="roles-grid">
          {/* Estudiantes */}
          <div className="role-card">
            <div className="role-header">
              <span className="role-icon">{getRoleIcon(1)}</span>
              <h3>{getRoleName(1)}</h3>
            </div>
            <div className="role-stats">
              <div className="role-stat-item">
                <span className="role-stat-label">Total:</span>
                <span className="role-stat-value">{stats.total_students}</span>
              </div>
            </div>
          </div>

          {/* Profesores */}
          <div className="role-card">
            <div className="role-header">
              <span className="role-icon">{getRoleIcon(2)}</span>
              <h3>{getRoleName(2)}</h3>
            </div>
            <div className="role-stats">
              <div className="role-stat-item">
                <span className="role-stat-label">Total:</span>
                <span className="role-stat-value">{stats.total_professors}</span>
              </div>
            </div>
          </div>

          {/* Administradores */}
          <div className="role-card">
            <div className="role-header">
              <span className="role-icon">{getRoleIcon(3)}</span>
              <h3>{getRoleName(3)}</h3>
            </div>
            <div className="role-stats">
              <div className="role-stat-item">
                <span className="role-stat-label">Total:</span>
                <span className="role-stat-value">{stats.total_admins}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Usuarios recientes */}
      <div className="section">
        <h2>🆕 Usuarios Recientes</h2>
        {stats.recent_users.length === 0 ? (
          <p className="empty-message">No hay usuarios recientes</p>
        ) : (
          <div className="users-table">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Fecha de Registro</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_users.map((recentUser) => (
                  <tr key={recentUser.id}>
                    <td>
                      <div className="user-cell">
                        <span className="user-icon">{getRoleIcon(recentUser.role_id)}</span>
                        <span className="user-name">{recentUser.username}</span>
                      </div>
                    </td>
                    <td className="email-cell">{recentUser.email}</td>
                    <td>
                      <span className="badge badge-role">{getRoleName(recentUser.role_id)}</span>
                    </td>
                    <td className="date-cell">{formatDateShort(recentUser.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sesiones recientes globales */}
      <div className="section">
        <h2>🔌 Actividad Reciente del Sistema</h2>
        {stats.recent_sessions_global.length === 0 ? (
          <p className="empty-message">No hay sesiones recientes</p>
        ) : (
          <div className="sessions-grid">
            {stats.recent_sessions_global.map((session) => (
              <div key={session.id} className="session-card">
                <div className="session-header">
                  <div className="session-user">
                    <span className="session-user-icon">👤</span>
                    <span className="session-username">{session.username}</span>
                  </div>
                  {session.duration_minutes !== undefined ? (
                    <div className="session-duration-compact">
                      <span className="session-duration-icon">⏱️</span>
                      <span>{formatDuration(session.duration_minutes)}</span>
                    </div>
                  ) : (
                    <span className="badge badge-ongoing">En curso</span>
                  )}
                </div>
                
                <div className="session-body">
                  <div className="session-info-row">
                    <span className="info-label">
                      <span className="session-host-icon">�️</span>
                      Host
                    </span>
                    <span className="info-value">{session.hostname || 'Unknown'}</span>
                  </div>
                  
                  <div className="session-info-row">
                    <span className="info-label">
                      <span className="session-time-icon">📅</span>
                      Inicio
                    </span>
                    <span className="info-value">{formatDate(session.started_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboardPage
