// components/desktop/DesktopToolbar.tsx — Barra de control del escritorio remoto

import React from 'react'
import type { DesktopStatus, DesktopSessionInfo } from '../../hooks/useDesktopSession'

const RESOLUTIONS = ['1024x768', '1280x720', '1280x800', '1920x1080'] as const

const STATUS_COLOR: Record<DesktopStatus, string> = {
  idle: 'var(--text-secondary)',
  starting: '#f5a623',
  connected: '#4caf50',
  disconnected: 'var(--text-secondary)',
  error: '#e74c3c',
}

const STATUS_LABEL: Record<DesktopStatus, string> = {
  idle: 'Inactivo',
  starting: 'Iniciando...',
  connected: 'Conectado',
  disconnected: 'Desconectado',
  error: 'Error',
}

interface Props {
  status: DesktopStatus
  resolution: string
  onResolutionChange: (r: string) => void
  onStop: () => void
  sessionInfo: DesktopSessionInfo | null
}

const DesktopToolbar: React.FC<Props> = ({
  status,
  resolution,
  onResolutionChange,
  onStop,
  sessionInfo,
}) => {
  return (
    <div className="desktop-toolbar">
      <div className="desktop-toolbar-left">
        <span
          className="desktop-status-dot"
          style={{ background: STATUS_COLOR[status] }}
          title={STATUS_LABEL[status]}
        />
        <span className="desktop-status-label">{STATUS_LABEL[status]}</span>
        {sessionInfo && (
          <span className="desktop-info" title="Display y puerto WebSocket local">
            Display :{sessionInfo.display} &middot; ws:{sessionInfo.ws_port}
          </span>
        )}
      </div>

      <div className="desktop-toolbar-right">
        <label className="desktop-label" htmlFor="desktop-res-select">
          Resolución:
        </label>
        <select
          id="desktop-res-select"
          className="desktop-select"
          value={resolution}
          onChange={e => onResolutionChange(e.target.value)}
          disabled={status === 'connected' || status === 'starting'}
          title="Resolución del escritorio (solo se aplica al iniciar)"
        >
          {RESOLUTIONS.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {(status === 'connected' || status === 'starting') && (
          <button
            className="desktop-btn-stop"
            onClick={onStop}
            title="Detener escritorio remoto y liberar recursos"
          >
            ✕ Desconectar
          </button>
        )}

      </div>
    </div>
  )
}

export default DesktopToolbar
