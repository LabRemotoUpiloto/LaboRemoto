import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAuth } from '../contexts/AuthContext'
import { useToasts } from '../contexts/ToastContext'
import './ProfessorDashboardPage.css'

interface TopStudent {
  user_id: string
  username: string
  session_count: number
  total_time_minutes: number
}

interface GroupSummary {
  group_id: string
  group_name: string
  member_count: number
  active_members_week: number
}

interface InactiveStudent {
  user_id: string
  username: string
  days_since_last_session: number
}

interface ProfessorDashboardStats {
  total_groups: number
  total_students: number
  active_students_week: number
  top_students: TopStudent[]
  groups_summary: GroupSummary[]
  inactive_students: InactiveStudent[]
}

const ProfessorDashboardPage: React.FC = () => {
  const { user } = useAuth()
  const { showToast } = useToasts()
  const [stats, setStats] = useState<ProfessorDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [user])

  const loadStats = async () => {
    if (!user) return

    try {
      setLoading(true)
      const result = await invoke<ProfessorDashboardStats>('get_professor_dashboard_stats', {
        requestingUserId: user.user_id,
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

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const getActivityPercentage = (activeMembers: number, totalMembers: number) => {
    if (totalMembers === 0) return 0
    return Math.round((activeMembers / totalMembers) * 100)
  }

  if (loading) {
    return (
      <div className="professor-dashboard">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Cargando estadísticas...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="professor-dashboard">
        <div className="error-message">
          <h2>⚠️ Error</h2>
          <p>No se pudieron cargar las estadísticas</p>
        </div>
      </div>
    )
  }

  return (
    <div className="professor-dashboard">
      <div className="dashboard-header">
        <h1>👨‍🏫 Dashboard de Profesor</h1>
        <p className="subtitle">Monitorea el progreso de tus estudiantes y grupos</p>
      </div>

      {/* Tarjetas de estadísticas principales */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Grupos Totales</h3>
            <p className="stat-value">{stats.total_groups}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎓</div>
          <div className="stat-content">
            <h3>Estudiantes Totales</h3>
            <p className="stat-value">{stats.total_students}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Activos Esta Semana</h3>
            <p className="stat-value">{stats.active_students_week}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Tasa de Actividad</h3>
            <p className="stat-value">
              {stats.total_students > 0
                ? `${Math.round((stats.active_students_week / stats.total_students) * 100)}%`
                : '0%'}
            </p>
          </div>
        </div>
      </div>

      {/* Resumen de grupos */}
      <div className="section">
        <h2>📚 Resumen de Grupos</h2>
        {stats.groups_summary.length === 0 ? (
          <p className="empty-message">No tienes grupos creados aún</p>
        ) : (
          <div className="groups-grid">
            {stats.groups_summary.map((group) => (
              <div key={group.group_id} className="group-summary-card">
                <div className="group-header">
                  <h3>{group.group_name}</h3>
                  <span className="member-count">
                    {group.member_count} {group.member_count === 1 ? 'miembro' : 'miembros'}
                  </span>
                </div>
                <div className="group-activity">
                  <div className="activity-bar-container">
                    <div
                      className="activity-bar"
                      style={{
                        width: `${getActivityPercentage(group.active_members_week, group.member_count)}%`,
                      }}
                    ></div>
                  </div>
                  <p className="activity-text">
                    {group.active_members_week} activos esta semana (
                    {getActivityPercentage(group.active_members_week, group.member_count)}%)
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top estudiantes */}
      <div className="section">
        <h2>🏆 Top Estudiantes por Actividad</h2>
        {stats.top_students.length === 0 ? (
          <p className="empty-message">No hay estudiantes con actividad registrada</p>
        ) : (
          <div className="students-table">
            <table>
              <thead>
                <tr>
                  <th>Posición</th>
                  <th>Estudiante</th>
                  <th>Sesiones</th>
                  <th>Tiempo Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_students.map((student, index) => (
                  <tr key={student.user_id}>
                    <td>
                      <div className="position-badge">
                        {index === 0 && '🥇'}
                        {index === 1 && '🥈'}
                        {index === 2 && '🥉'}
                        {index > 2 && `#${index + 1}`}
                      </div>
                    </td>
                    <td>
                      <div className="student-cell">
                        <span className="student-icon">🎓</span>
                        <span className="student-name">{student.username}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-primary">{student.session_count}</span>
                    </td>
                    <td>{formatDuration(student.total_time_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Estudiantes inactivos */}
      {stats.inactive_students && stats.inactive_students.length > 0 && (
        <div className="section alert-section">
          <h2>⚠️ Estudiantes Inactivos</h2>
          <p className="section-description">
            Estudiantes que no se han conectado en los últimos 7 días
          </p>
          <div className="inactive-list">
            {stats.inactive_students.map((student) => (
              <div key={student.user_id} className="inactive-card">
                <div className="inactive-info">
                  <span className="inactive-icon">👤</span>
                  <span className="inactive-name">{student.username}</span>
                </div>
                <span className="inactive-days">
                  Hace {student.days_since_last_session} días
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfessorDashboardPage

