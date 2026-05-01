import React from 'react'
import './SessionDetailPanel.css'
import type { SessionLog } from './SessionCard'

interface SessionDetailPanelProps {
  session: SessionLog | null
  onClose: () => void
}

const SessionDetailPanel: React.FC<SessionDetailPanelProps> = ({ session, onClose }) => {
  if (!session) return null

  return (
    <div className="session-detail-panel">
      <div className="detail-panel-header">
        <h2>Detalles de la Sesión</h2>
        <button 
          className="close-panel-btn"
          onClick={onClose}
          aria-label="Cerrar panel"
        >
          ✕
        </button>
      </div>
      <div className="detail-panel-content">
        <div className="detail-section">
          <h3>Información General</h3>
          <dl className="detail-list">
            <div className="detail-item">
              <dt>ID de Sesión:</dt>
              <dd>{session.id}</dd>
            </div>
            <div className="detail-item">
              <dt>Usuario:</dt>
              <dd>{session.user}</dd>
            </div>
            <div className="detail-item">
              <dt>Host:</dt>
              <dd>{session.host}:{session.port}</dd>
            </div>
          </dl>
        </div>

        <div className="detail-section">
          <h3>Buffer de Terminal</h3>
          <p className="coming-soon">El visor de buffer se implementará próximamente</p>
        </div>

        <div className="detail-section">
          <h3>Historial de Comandos</h3>
          <p className="coming-soon">La lista de comandos se implementará próximamente</p>
        </div>
      </div>
    </div>
  )
}

export default SessionDetailPanel
