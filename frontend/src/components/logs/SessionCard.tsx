import React from 'react'

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
      className={`relative flex flex-col gap-2.5 p-0 bg-secondary border rounded-lg cursor-pointer touch-manipulation overflow-hidden transition-all duration-200 group hover:shadow-[0_14px_40px_rgba(0,0,0,0.6),0_4px_12px_rgba(0,0,0,0.4)] hover:scale-[1.03] hover:z-10 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${isSelected ? 'border-accent bg-accent/5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]' : 'border-subtle'}`}
      onClick={onSelect}
      role="row"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      aria-selected={isSelected}
    >
      {/* Card body */}
      <div className="p-[10px_14px_12px] flex flex-col gap-2 flex-1">
        {/* Header row: dot + tag + identity + delete */}
        <div className="flex items-center gap-[7px] min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)] animate-pulse' : 'bg-border-strong'}`}
            aria-label={isActive ? 'Sesión activa' : 'Sesión cerrada'}
          />
          <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-accent bg-accent/10 border border-accent/25 rounded-[3px] px-[5px] py-[1px] shrink-0 font-mono" aria-label="Protocolo SSH">SSH</span>
          <div className="flex items-baseline gap-0 min-w-0 font-mono" style={{ flex: 1 }}>
            <span className="text-[12.5px] font-bold text-primary whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]" translate="no">{session.user}</span>
            <span className="text-[11px] text-muted shrink-0" aria-hidden="true">@</span>
            <span className="text-[12.5px] text-secondary whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0" translate="no">{session.host}</span>
            <span className="text-[11px] text-muted shrink-0 font-mono" translate="no">:{session.port}</span>
          </div>
          {onDelete && (
            <button
              className={`ml-auto shrink-0 w-[22px] h-[22px] rounded bg-transparent border border-transparent text-muted flex items-center justify-center transition-all duration-150 touch-manipulation group-hover:opacity-100 hover:!bg-danger/10 hover:!border-danger/20 hover:!text-danger focus-visible:outline-2 focus-visible:outline-danger focus-visible:outline-offset-1 focus-visible:opacity-100 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
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
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-tertiary tabular-nums whitespace-nowrap" title="Duración de la sesión">
            <svg className="shrink-0 text-muted" aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {formatDuration(session.duration)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-secondary font-semibold tabular-nums whitespace-nowrap" title="Comandos ejecutados">
            <svg className="shrink-0 text-muted" aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            {session.totalCommands} cmds
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] text-tertiary tabular-nums whitespace-nowrap ml-auto">
            <svg className="shrink-0 text-muted" aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {formatTime(session.startedAt)}
          </span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-[5px] py-[7px] px-[14px] border-t border-subtle bg-tertiary/60" onClick={e => e.stopPropagation()}>
        <button
          className="inline-flex items-center gap-[5px] py-1 px-2.5 rounded-[5px] text-[11px] font-semibold cursor-pointer border border-subtle touch-manipulation transition-all duration-150 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 bg-white/5 text-secondary flex-1 justify-center hover:bg-white/10 hover:border-strong hover:text-primary"
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
            className="inline-flex items-center gap-[5px] py-1 px-2 rounded-[5px] text-[11px] font-semibold cursor-pointer border border-subtle touch-manipulation transition-all duration-150 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 bg-transparent text-tertiary hover:bg-white/5 hover:border-strong hover:text-secondary"
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
