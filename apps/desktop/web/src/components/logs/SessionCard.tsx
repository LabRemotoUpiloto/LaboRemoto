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
  onDelete?: () => void
  onSavePdf?: () => void
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isSelected,
  onSelect,
  onViewBuffer,
  onDelete,
  onSavePdf
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

  const isActive = !session.endedAt

  return (
    <div className={`session-card ${isSelected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="session-card-header">
        <div className="session-card-badge">
          <span className="session-ssh-tag">SSH</span>
          {isActive && <span className="session-live-dot" />}
        </div>
        <div className="session-info">
          <span className="session-user">{session.user}</span>
          <span className="session-at">@</span>
          <span className="session-host">{session.host}</span>
          <span className="session-port">:{session.port}</span>
        </div>
        {onDelete && (
          <button
            className="delete-log-btn"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="Eliminar log"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>

      <div className="session-card-stats">
        <div className="session-stat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>{formatDuration(session.duration)}</span>
        </div>
        <div className="session-stat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          <span>{session.totalCommands} cmds</span>
        </div>
        <div className="session-stat session-stat-date">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>{formatDate(session.startedAt)}</span>
        </div>
      </div>

      <div className="session-card-footer">
        <button
          className="session-btn session-btn-primary"
          onClick={(e) => { e.stopPropagation(); onViewBuffer() }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Ver Logs
        </button>
        {onSavePdf && (
          <button
            className="session-btn session-btn-ghost"
            onClick={(e) => { e.stopPropagation(); onSavePdf() }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            PDF
          </button>
        )}
      </div>
    </div>
  )
}

export default SessionCard
