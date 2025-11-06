import React, { useEffect, useState } from 'react'
import './LogsPage.css'
import SessionFilters from '../components/logs/SessionFilters'
import SessionsGrid from '../components/logs/SessionsGrid'
import type { SessionLog } from '../components/logs/SessionCard'
import { listSessionLogs, type SessionLogMetadata } from '../api/sessionCapture'

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

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    setLoading(true)
    try {
      // Cargar logs reales desde el backend
      const metadata = await listSessionLogs()
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

          <SessionsGrid
            sessions={filteredSessions}
            selectedSessionId={null}
            onSelectSession={(s) => onOpenLog?.(s)}
            onViewBuffer={handleViewBuffer}
            onViewCommands={handleViewCommands}
            loading={loading}
          />
        </div>
      </div>
    </div>
  )
}

export default LogsPage
