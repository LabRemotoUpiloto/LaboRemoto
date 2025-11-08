import React from 'react'
import './SessionCard.css'

export interface SessionLog {
  id: string
  user: string
  host: string
  port: number
  startedAt: string
  endedAt?: string
  duration?: number
  totalCommands: number
}

interface SessionCardProps {
  session: SessionLog
  isSelected: boolean
  onSelect: () => void
  onViewBuffer: () => void
  onViewCommands: () => void
  onDelete?: () => void
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isSelected,
  onSelect,
  onViewBuffer,
  onViewCommands,
  onDelete
}) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'En curso'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours}h ${minutes}m ${secs}s`
  }

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate)
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div
      className={`session-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="session-card-header">
        <div className="session-info">
          <h3>{session.user}@{session.host}</h3>
          <span className="session-port">:{session.port}</span>
        </div>
        {onDelete && (
          <button
            className="delete-log-btn"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title="Eliminar log"
            aria-label="Eliminar log"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
            </svg>
          </button>
        )}
      </div>

      <div className="session-card-body">
        <div className="session-detail">
          <span className="detail-label">Inicio:</span>
          <span className="detail-value">{formatDate(session.startedAt)}</span>
        </div>

        {session.endedAt && (
          <div className="session-detail">
            <span className="detail-label">Fin:</span>
            <span className="detail-value">{formatDate(session.endedAt)}</span>
          </div>
        )}

        <div className="session-detail">
          <span className="detail-label">Duración:</span>
          <span className="detail-value">{formatDuration(session.duration)}</span>
        </div>

        <div className="session-detail">
          <span className="detail-label">Comandos:</span>
          <span className="detail-value">{session.totalCommands}</span>
        </div>
      </div>

      <div className="session-card-footer">
        <button 
          className="view-buffer-btn"
          onClick={(e) => {
            e.stopPropagation()
            onViewBuffer()
          }}
        >
          Ver Buffer
        </button>
        <button 
          className="view-commands-btn"
          onClick={(e) => {
            e.stopPropagation()
            onViewCommands()
          }}
        >
          Ver Comandos
        </button>
      </div>
    </div>
  )
}

export default SessionCard
