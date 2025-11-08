import React, { useEffect, useState } from 'react'
import './LogsPage.css'
import SessionFilters from '../components/logs/SessionFilters'
import SessionsGrid from '../components/logs/SessionsGrid'
import type { SessionLog } from '../components/logs/SessionCard'
import { listSessionLogs, deleteSessionLog, getSessionLogsByRole, type SessionLogMetadata } from '../api/sessionCapture'
import { useToasts } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import SweetAlert from '../components/modals/SweetAlert'

type SortOption = 'date-desc' | 'date-asc' | 'duration-desc' | 'duration-asc' | 'host-asc' | 'host-desc'

interface LogsPageProps {
  onOpenLog?: (session: SessionLog) => void
}

// Adaptador: convierte SessionLogMetadata del backend al formato SessionLog de la UI
function adaptMetadataToSessionLog(metadata: SessionLogMetadata): SessionLog {
  return {
    id: metadata.session_id,
    user: metadata.user,
    host: metadata.host,
    port: metadata.port,
    startedAt: metadata.start_time,
    endedAt: metadata.end_time,
    duration: metadata.duration_seconds,
    totalCommands: metadata.command_count ?? 0
  }
}

const LogsPage: React.FC<LogsPageProps> = ({ onOpenLog }) => {
  const [sessions, setSessions] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUser, setFilterUser] = useState('')
  const [filterHost, setFilterHost] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date-desc')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toDeleteSession, setToDeleteSession] = useState<SessionLog | null>(null)
  const { push } = useToasts()
  const { user, isAuthenticated } = useAuth()

  useEffect(() => {
    loadSessions()
  }, [user])

  const loadSessions = async () => {
    setLoading(true)
    try {
      let metadata: SessionLogMetadata[] = []
      
      // Si está autenticado, usar comandos cloud con filtrado por rol (Supabase)
      if (isAuthenticated && user) {
        console.log(`☁️ Loading logs from cloud for user: ${user.user_id}, role: ${user.role_id}`)
        const cloudLogs = await getSessionLogsByRole(user.user_id, user.role_id, 100)
        
        // Adaptar formato cloud a SessionLogMetadata
        metadata = cloudLogs.map((log: any) => ({
          session_id: log.session_id,
          user: log.username || user.username,
          host: log.host,
          port: 22, // Puede venir de log.port si lo guardamos
          start_time: log.started_at,
          end_time: log.ended_at,
          duration_seconds: log.duration_seconds || 0,
          buffer_size_bytes: 0, // No disponible en cloud logs
          command_count: null
        }))
        
        // Log info según rol
        if (user.role_id === 3) {
          console.log(`👑 Admin: Loaded ${metadata.length} logs (all users)`)
        } else if (user.role_id === 2) {
          console.log(`👨‍🏫 Professor: Loaded ${metadata.length} logs (groups)`)
        } else {
          console.log(`👨‍🎓 Student: Loaded ${metadata.length} logs (own only)`)
        }
      } else {
        // Fallback: usar logs locales
        console.log(`💾 Loading logs from local storage (no auth)`)
        metadata = await listSessionLogs()
      }
      
      const adaptedSessions = metadata.map(adaptMetadataToSessionLog)
      setSessions(adaptedSessions)
      console.log(`✅ Loaded ${adaptedSessions.length} session logs`)
    } catch (error) {
      console.error('Error loading sessions:', error)
      // Mostrar array vacío en caso de error
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  const filteredSessions = sessions.filter(session => {
    if (filterUser && !session.user.toLowerCase().includes(filterUser.toLowerCase())) {
      return false
    }
    if (filterHost && !session.host.toLowerCase().includes(filterHost.toLowerCase())) {
      return false
    }
    return true
  })

  // Ordenar sesiones según la opción seleccionada
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    switch (sortBy) {
      case 'date-desc':
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      case 'date-asc':
        return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      case 'duration-desc':
        return (b.duration || 0) - (a.duration || 0)
      case 'duration-asc':
        return (a.duration || 0) - (b.duration || 0)
      case 'host-asc':
        return `${a.user}@${a.host}`.localeCompare(`${b.user}@${b.host}`)
      case 'host-desc':
        return `${b.user}@${b.host}`.localeCompare(`${a.user}@${a.host}`)
      default:
        return 0
    }
  })

  const handleDeleteLog = (session: SessionLog) => {
    setToDeleteSession(session)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!toDeleteSession) return

    try {
      await deleteSessionLog(toDeleteSession.id)
      push({ type: 'success', message: `Log de ${toDeleteSession.user}@${toDeleteSession.host} eliminado` })
      
      // Actualizar la lista
      setSessions(prev => prev.filter(s => s.id !== toDeleteSession.id))
    } catch (error) {
      console.error('Error deleting log:', error)
      push({ type: 'error', message: 'Error al eliminar el log' })
    } finally {
      setConfirmOpen(false)
      setToDeleteSession(null)
    }
  }

  const handleViewBuffer = (session: SessionLog) => {
    console.log('Ver buffer de sesión:', session.id)
    // Abrir el detalle del log en una nueva pestaña
    onOpenLog?.(session)
  }

  const handleViewCommands = (session: SessionLog) => {
    console.log('Ver comandos de sesión:', session.id)
    // Abrir el detalle del log en una nueva pestaña
    onOpenLog?.(session)
  }

  return (
    <div className="logs-page">
      {/* Header con título y descripción - siguiendo el patrón del proyecto */}
      <div className="logs-page__header">
        <h1 className="page-title">Logs</h1>
        <span className="page-separator">•</span>
        <p className="page-description">Visualiza y analiza el historial de sesiones SSH</p>
      </div>

      {/* Contenido scrollable */}
      <div className="logs-page__scrollable">
        <div className="logs-page-inner">
          <SessionFilters
            filterUser={filterUser}
            filterHost={filterHost}
            onFilterUserChange={setFilterUser}
            onFilterHostChange={setFilterHost}
            onRefresh={loadSessions}
          />

          {/* Ordenamiento */}
          <div className="sort-controls">
            <label htmlFor="sort-select">Ordenar por:</label>
            <select 
              id="sort-select"
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="sort-select"
            >
              <option value="date-desc">Más recientes primero</option>
              <option value="date-asc">Más antiguos primero</option>
              <option value="duration-desc">Mayor duración</option>
              <option value="duration-asc">Menor duración</option>
              <option value="host-asc">Host (A-Z)</option>
              <option value="host-desc">Host (Z-A)</option>
            </select>
            <span className="sessions-count">{sortedSessions.length} sesiones</span>
          </div>

          <SessionsGrid
            sessions={sortedSessions}
            selectedSessionId={null}
            onSelectSession={(s) => onOpenLog?.(s)}
            onViewBuffer={handleViewBuffer}
            onViewCommands={handleViewCommands}
            onDeleteLog={handleDeleteLog}
            loading={loading}
          />
        </div>
      </div>

      {/* Modal de confirmación de eliminación */}
      <SweetAlert
        open={confirmOpen}
        title="¿Eliminar log?"
        message={
          toDeleteSession 
            ? `¿Estás seguro de que deseas eliminar el log de ${toDeleteSession.user}@${toDeleteSession.host}? Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="warning"
        onConfirm={confirmDelete}
        onCancel={() => {
          setConfirmOpen(false)
          setToDeleteSession(null)
        }}
      />
    </div>
  )
}

export default LogsPage
