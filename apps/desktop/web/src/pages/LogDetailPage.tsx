import React, { useEffect, useState } from 'react'
import type { SessionLog } from '../components/logs/SessionCard'
import { getSessionLogContent } from '../api/sessionCapture'
import './LogsPage.css'

interface LogDetailPageProps {
  session: SessionLog
}

// Página de detalle de un log (buffer/comandos próximamente)
const LogDetailPage: React.FC<LogDetailPageProps> = ({ session }) => {
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLogContent()
  }, [session.id])

  const loadLogContent = async () => {
    setLoading(true)
    setError(null)
    try {
      const content = await getSessionLogContent(session.id)
      setHtmlContent(content)
    } catch (err) {
      console.error('Error loading log content:', err)
      setError('No se pudo cargar el contenido del log')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="logs-page" data-log-id={session.id}>
      <div className="logs-page__header">
        <h1 className="page-title">Log</h1>
        <span className="page-separator">•</span>
        <p className="page-description">{session.user}@{session.host}:{session.port}</p>
      </div>
      <div className="logs-page__scrollable">
        <div className="logs-page-inner" style={{ padding: 0, height: '100%' }}>
          {loading && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p>Cargando log...</p>
            </div>
          )}
          
          {error && (
            <div style={{ padding: '20px', color: 'var(--error-primary, #f44336)' }}>
              <p>{error}</p>
            </div>
          )}
          
          {!loading && !error && htmlContent && (
            <iframe
              srcDoc={htmlContent}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block'
              }}
              title={`Session log: ${session.id}`}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default LogDetailPage
