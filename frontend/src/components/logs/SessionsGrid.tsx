import React from 'react'
import './SessionsGrid.css'
import SessionCard, { SessionLog } from './SessionCard'

interface SessionsGridProps {
  sessions: SessionLog[]
  selectedSessionId: string | null
  onSelectSession: (session: SessionLog) => void
  onViewBuffer: (session: SessionLog) => void
  onDeleteLog?: (session: SessionLog) => void
  onSavePdf?: (session: SessionLog) => void
  loading?: boolean
}

function getDayKey(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function formatDayLabel(dayKey: string): string {
  const date = new Date(dayKey + 'T12:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (dayKey === today.toISOString().slice(0, 10)) return 'Hoy'
  if (dayKey === yesterday.toISOString().slice(0, 10)) return 'Ayer'

  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const SessionsGrid: React.FC<SessionsGridProps> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  onViewBuffer,
  onDeleteLog,
  onSavePdf,
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
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6M9 16h6M9 8h6M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
        </svg>
        <p>No se encontraron sesiones</p>
        <small>Intenta ajustar los filtros o conectar a un servidor SSH</small>
      </div>
    )
  }

  // Group by day
  const groups: { dayKey: string; sessions: SessionLog[] }[] = []
  const seen = new Map<string, SessionLog[]>()
  for (const s of sessions) {
    const key = getDayKey(s.startedAt)
    if (!seen.has(key)) { seen.set(key, []); groups.push({ dayKey: key, sessions: seen.get(key)! }) }
    seen.get(key)!.push(s)
  }

  return (
    <div className="sessions-grouped">
      {groups.map(({ dayKey, sessions: daySessions }) => (
        <div key={dayKey} className="sessions-day-group">
          <div className="sessions-day-header">
            <span className="sessions-day-label">{formatDayLabel(dayKey)}</span>
            <span className="sessions-day-count">{daySessions.length} sesión{daySessions.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="sessions-grid">
            {daySessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selectedSessionId === session.id}
                onSelect={() => onSelectSession(session)}
                onViewBuffer={() => onViewBuffer(session)}
                onDelete={onDeleteLog ? () => onDeleteLog(session) : undefined}
                onSavePdf={onSavePdf ? () => onSavePdf(session) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SessionsGrid
