import React, { useEffect, useState } from 'react'
import './LogsPage.css'
import SessionFilters from '../components/logs/SessionFilters'
import SessionsGrid from '../components/logs/SessionsGrid'
import SessionDetailPanel from '../components/logs/SessionDetailPanel'
import type { SessionLog } from '../components/logs/SessionCard'

const LogsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<SessionLog | null>(null)
  const [filterUser, setFilterUser] = useState('')
  const [filterHost, setFilterHost] = useState('')

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    setLoading(true)
    try {
      // TODO: Implementar llamada al backend para obtener sesiones
      // const { invoke } = await import('@tauri-apps/api/core')
      // const result = await invoke('get_session_logs')
      
      // Datos de prueba temporales
      const mockSessions: SessionLog[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          user: 'admin',
          host: '192.168.1.100',
          port: 22,
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          endedAt: new Date().toISOString(),
          duration: 3600,
          totalCommands: 45
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          user: 'student1',
          host: '200.115.181.211',
          port: 9000,
          startedAt: new Date(Date.now() - 7200000).toISOString(),
          endedAt: new Date(Date.now() - 3600000).toISOString(),
          duration: 3600,
          totalCommands: 78
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          user: 'student2',
          host: '192.168.1.101',
          port: 22,
          startedAt: new Date(Date.now() - 1800000).toISOString(),
          totalCommands: 23
        }
      ]
      setSessions(mockSessions)
    } catch (error) {
      console.error('Error loading sessions:', error)
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
    // TODO: Implementar visualización del buffer
  }

  const handleViewCommands = (session: SessionLog) => {
    console.log('Ver comandos de sesión:', session.id)
    // TODO: Implementar visualización de comandos
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
            selectedSessionId={selectedSession?.id || null}
            onSelectSession={setSelectedSession}
            onViewBuffer={handleViewBuffer}
            onViewCommands={handleViewCommands}
            loading={loading}
          />
        </div>
      </div>

      <SessionDetailPanel
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  )
}

export default LogsPage
