import React from 'react'
import type { SessionLog } from '../components/logs/SessionCard'
import './LogsPage.css'

interface LogDetailPageProps {
  session: SessionLog
}

// Página de detalle de un log (buffer/comandos próximamente)
const LogDetailPage: React.FC<LogDetailPageProps> = ({ session }) => {
  return (
    <div className="logs-page" data-log-id={session.id}>
      <div className="logs-page__header">
        <h1 className="page-title">Log</h1>
        <span className="page-separator">•</span>
        <p className="page-description">{session.user}@{session.host}:{session.port}</p>
      </div>
      <div className="logs-page__scrollable">
        <div className="logs-page-inner">
          <div style={{padding:'12px'}}>
            <h2 style={{marginTop:0}}>Resumen</h2>
            <dl style={{display:'grid', gridTemplateColumns:'max-content 1fr', gap:'4px 16px'}}>
              <dt>ID</dt><dd>{session.id}</dd>
              <dt>Usuario</dt><dd>{session.user}</dd>
              <dt>Host</dt><dd>{session.host}:{session.port}</dd>
              <dt>Inicio</dt><dd>{new Date(session.startedAt).toLocaleString()}</dd>
              {session.endedAt && (<><dt>Fin</dt><dd>{new Date(session.endedAt).toLocaleString()}</dd></>)}
              <dt>Comandos</dt><dd>{session.totalCommands}</dd>
            </dl>
            <hr style={{margin:'16px 0', opacity:0.2}} />
            <h2>Buffer de Terminal</h2>
            <p style={{opacity:0.7}}>El visor del buffer se implementará próximamente.</p>
            <h2>Historial de Comandos</h2>
            <p style={{opacity:0.7}}>La lista de comandos se implementará próximamente.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LogDetailPage
