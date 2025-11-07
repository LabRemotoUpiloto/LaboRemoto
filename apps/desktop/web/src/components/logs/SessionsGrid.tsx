import React from 'react'
import './SessionsGrid.css'
import SessionCard, { SessionLog } from './SessionCard'

interface SessionsGridProps {
  sessions: SessionLog[]
  selectedSessionId: string | null
  onSelectSession: (session: SessionLog) => void
  onViewBuffer: (session: SessionLog) => void
  onViewCommands: (session: SessionLog) => void
  onDeleteLog?: (session: SessionLog) => void
  loading?: boolean
}

const SessionsGrid: React.FC<SessionsGridProps> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  onViewBuffer,
  onViewCommands,
  onDeleteLog,
  loading = false
}) => {
  if (loading) {
    return (
      <div className="sessions-loading">
        <div className="spinner"></div>
        <p>Cargando sesiones...</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="sessions-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6M9 16h6M9 8h6M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
        </svg>
        <p>No se encontraron sesiones</p>
        <small>Intenta ajustar los filtros o conectar a un servidor SSH</small>
      </div>
    )
  }

  return (
    <div className="sessions-grid">
      {sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          isSelected={selectedSessionId === session.id}
          onSelect={() => onSelectSession(session)}
          onViewBuffer={() => onViewBuffer(session)}
          onViewCommands={() => onViewCommands(session)}
          onDelete={onDeleteLog ? () => onDeleteLog(session) : undefined}
        />
      ))}
    </div>
  )
}

export default SessionsGrid
