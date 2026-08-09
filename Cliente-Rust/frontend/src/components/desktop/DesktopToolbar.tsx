// components/desktop/DesktopToolbar.tsx — Barra de control del escritorio remoto

import React from 'react'
import type { DesktopStatus, DesktopSessionInfo } from '../../hooks/useDesktopSession'

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
  onStop: () => void
  onCleanupAll?: () => void
  onSendAltTab?: () => void
  sessionInfo: DesktopSessionInfo | null
  onSendKey?: (keysym: number, code: string) => void
}

const DesktopToolbar: React.FC<Props> = ({
  status,
  onStop,
  onCleanupAll,
  onSendAltTab,
  sessionInfo,
  onSendKey,
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
        {status === 'connected' && (
          <button
            className="desktop-btn-stop"
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '11px', padding: '3px 8px' }}
            onClick={onSendAltTab}
            title="Enviar Alt+Tab al escritorio virtual (cambiar ventana)"
          >
            Alt+Tab
          </button>
        )}

        {(status === 'connected' || status === 'starting') && (
          <button
            className="desktop-btn-stop"
            onClick={onStop}
            title="Detener escritorio remoto y liberar recursos"
          >
            ✕ Desconectar
          </button>
        )}

        {status === 'idle' || status === 'error' || status === 'disconnected' ? (
          <button
            className="desktop-btn-stop"
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '11px', padding: '3px 8px' }}
            onClick={onCleanupAll}
            title="Limpiar todos los displays VNC huérfanos en el servidor"
          >
            Limpiar displays
          </button>
        ) : null}

      </div>
    </div>
  )
}

export default DesktopToolbar
