import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAuth } from '../contexts/AuthContext'
import { useToasts } from '../contexts/ToastContext'
import './StudentDashboardPage.css'

interface FavoriteHost {
  hostname: string
  connection_count: number
  total_time_minutes: number
}

interface RecentSession {
  id: string
  hostname: string
  started_at: string
  ended_at?: string
  duration_minutes?: number
}

interface DayActivity {
  day_name: string
  session_count: number
}

interface StudentDashboardStats {
  total_sessions: number
  total_time_minutes: number
  last_session_date?: string
  favorite_hosts: FavoriteHost[]
  recent_sessions: RecentSession[]
  activity_by_weekday: DayActivity[]
}

const StudentDashboardPage: React.FC = () => {
  const { user } = useAuth()
  const { showToast } = useToasts()
  const [stats, setStats] = useState<StudentDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [user])

  const loadStats = async () => {
    if (!user) return

    try {
      setLoading(true)
      const result = await invoke<StudentDashboardStats>('get_student_dashboard_stats', {
        requestingUserId: user.user_id,
      })
      setStats(result)
    } catch (error) {
      console.error('Error al cargar estadísticas:', error)
      showToast('Error al cargar estadísticas', 'error')
    } finally {
      setLoading(false)
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

  if (loading) {
    return (
      <div className="student-dashboard">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Cargando estadísticas...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="student-dashboard">
        <div className="error-message">
          <h2>⚠️ Error</h2>
          <p>No se pudieron cargar las estadísticas</p>
        </div>
      </div>
    )
  }

  return (
    <div className="student-dashboard">
      <div className="dashboard-header">
        <h1>📊 Mi Dashboard</h1>
        <p className="subtitle">Resumen de tu actividad en la plataforma</p>
      </div>

      {/* Tarjetas de estadísticas principales */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🔌</div>
          <div className="stat-content">
            <h3>Total de Sesiones</h3>
            <p className="stat-value">{stats.total_sessions}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <h3>Tiempo Total</h3>
            <p className="stat-value">{formatDuration(stats.total_time_minutes)}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <h3>Última Conexión</h3>
            <p className="stat-value-small">
              {stats.last_session_date
                ? new Date(stats.last_session_date).toLocaleDateString('es-ES')
                : 'Sin sesiones'}
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🖥️</div>
          <div className="stat-content">
            <h3>Hosts Diferentes</h3>
            <p className="stat-value">{stats.favorite_hosts.length}</p>
          </div>
        </div>
      </div>

      {/* Actividad por día de la semana */}
      <div className="section">
        <h2>📈 Actividad Semanal</h2>
        <div className="weekday-chart">
          {stats.activity_by_weekday.map((day) => {
            const maxSessions = Math.max(...stats.activity_by_weekday.map(d => d.session_count), 1)
            const heightPercent = (day.session_count / maxSessions) * 100

            return (
              <div key={day.day_name} className="weekday-bar-container">
                <div className="weekday-bar-wrapper">
                  <div
                    className="weekday-bar"
                    style={{ height: `${heightPercent}%` }}
                    title={`${day.session_count} sesiones`}
                  >
                    {day.session_count > 0 && (
                      <span className="bar-value">{day.session_count}</span>
                    )}
                  </div>
                </div>
                <span className="weekday-label">{day.day_name.slice(0, 3)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Hosts favoritos */}
      <div className="section">
        <h2>⭐ Hosts Más Usados</h2>
        {stats.favorite_hosts.length === 0 ? (
          <p className="empty-message">No has conectado a ningún host aún</p>
        ) : (
          <div className="hosts-table">
            <table>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Conexiones</th>
                  <th>Tiempo Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.favorite_hosts.map((host, index) => (
                  <tr key={index}>
                    <td>
                      <div className="host-cell">
                        <span className="host-icon">🖥️</span>
                        <span className="host-name">{host.hostname}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-primary">{host.connection_count}</span>
                    </td>
                    <td>{formatDuration(host.total_time_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sesiones recientes */}
      <div className="section">
        <h2>🕒 Sesiones Recientes</h2>
        {stats.recent_sessions.length === 0 ? (
          <p className="empty-message">No hay sesiones recientes</p>
        ) : (
          <div className="sessions-list">
            {stats.recent_sessions.map((session) => (
              <div key={session.id} className="session-card">
                <div className="session-header">
                  <span className="session-host">🖥️ {session.hostname}</span>
                  {session.duration_minutes !== undefined && (
                    <span className="session-duration">
                      ⏱️ {formatDuration(session.duration_minutes)}
                    </span>
                  )}
                </div>
                <div className="session-footer">
                  <span className="session-date">📅 {formatDate(session.started_at)}</span>
                  {!session.ended_at && (
                    <span className="badge badge-active">En curso</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default StudentDashboardPage

