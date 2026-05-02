import React from 'react'
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
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-tertiary">
        <div className="w-7 h-7 border-2 border-subtle border-t-accent rounded-full animate-[spin_0.75s_linear_infinite]"></div>
        <p className="text-[12px] m-0 text-tertiary">Cargando sesiones...</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-2.5 text-tertiary text-center">
        <svg className="text-muted opacity-50" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6M9 16h6M9 8h6M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
        </svg>
        <p className="text-base font-semibold text-secondary m-0">No se encontraron sesiones</p>
        <small className="text-sm text-tertiary leading-relaxed">Intenta ajustar los filtros o conectar a un servidor SSH</small>
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
    <div className="flex flex-col gap-7 pb-8 animate-in fade-in duration-200">
      {groups.map(({ dayKey, sessions: daySessions }) => (
        <div key={dayKey} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 pb-0.5 after:content-[''] after:flex-1 after:h-[1px] after:bg-border-subtle">
            <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-tertiary whitespace-nowrap">{formatDayLabel(dayKey)}</span>
            <span className="text-[10px] text-muted bg-tertiary border border-subtle rounded-full px-[7px] py-[1px] font-semibold tabular-nums shrink-0">{daySessions.length} sesión{daySessions.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2">
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
