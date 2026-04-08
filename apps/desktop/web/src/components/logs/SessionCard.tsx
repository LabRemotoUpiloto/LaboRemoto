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
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const formatTime = (isoDate: string) =>
    new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoDate))

  const isActive = !session.endedAt

  return (
    <div
      className={`sc ${isSelected ? 'sc--sel' : ''} ${isActive ? 'sc--live' : ''}`}
      onClick={onSelect}
      role="row"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      aria-selected={isSelected}
    >
      {/* Top accent bar */}
      <div className="sc__topbar" aria-hidden="true" />

      {/* Card body */}
      <div className="sc__body">
        {/* Header row: dot + tag + identity + delete */}
        <div className="sc__head">
          <span
            className={`sc__dot ${isActive ? 'sc__dot--on' : 'sc__dot--off'}`}
            aria-label={isActive ? 'Sesión activa' : 'Sesión cerrada'}
          />
          <span className="sc__tag" aria-label="Protocolo SSH">SSH</span>
          <div className="sc__id" style={{ flex: 1, minWidth: 0 }}>
            <span className="sc__user" translate="no">{session.user}</span>
            <span className="sc__glyph" aria-hidden="true">@</span>
            <span className="sc__host" translate="no">{session.host}</span>
            <span className="sc__port" translate="no">:{session.port}</span>
          </div>
          {onDelete && (
            <button
              className="sc__del"
              onClick={e => { e.stopPropagation(); onDelete() }}
              aria-label="Eliminar log"
              title="Eliminar"
            >
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="sc__stats">
          <span className="sc__stat" title="Duración de la sesión">
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {formatDuration(session.duration)}
          </span>
          <span className="sc__stat sc__stat--cmds" title="Comandos ejecutados">
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            {session.totalCommands} cmds
          </span>
          <span className="sc__stat sc__stat--date">
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {formatTime(session.startedAt)}
          </span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="sc__footer" onClick={e => e.stopPropagation()}>
        <button
          className="sc__btn sc__btn--view"
          onClick={onViewBuffer}
          aria-label="Ver logs de sesión"
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Ver Logs
        </button>
        {onSavePdf && (
          <button
            className="sc__btn sc__btn--pdf"
            onClick={onSavePdf}
            aria-label="Exportar a PDF"
            title="Guardar PDF"
          >
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            PDF
          </button>
        )}
      </div>
    </div>
  )
}

export default SessionCard
