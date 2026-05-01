import React, { useEffect, useState } from 'react'
import type { SessionLog } from '../../components/logs/SessionCard'
import { getSessionLogContent } from '../../api/sessionCapture'
import { invoke } from '@tauri-apps/api/core'
import { useToasts } from '../../contexts/ToastContext'
import './LogsPage.css'
import html2pdf from 'html2pdf.js'
import { extractValidCommands, buildCommandsReportHtml } from '../../utils/commandParser'

interface LogDetailPageProps {
  session: SessionLog
  onBack?: () => void
}

// Página de detalle de un log (buffer/comandos próximamente)
const LogDetailPage: React.FC<LogDetailPageProps> = ({ session, onBack }) => {
  const { push: showToast } = useToasts()
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
    } catch {
      setError('No se pudo cargar el contenido del log')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePdf = async () => {
    try {
      if (!htmlContent) {
        throw new Error('El contenido del log no está disponible.');
      }

      showToast({ type: 'info', message: 'Generando Reporte de Comandos PDF...' });
      
      const commands = extractValidCommands(htmlContent);
      const reportHtml = buildCommandsReportHtml(commands, {
        sessionId: session.id,
        user: session.user,
        host: session.host,
        startTime: session.startedAt,
        endTime: session.endedAt
      });
      
      const container = document.createElement('div');
      container.innerHTML = reportHtml;

      const opt = {
        margin:       10,
        filename:     `Commands_Report_${session.host}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1000 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      // Generar PDF base64 en frontend
      const base64 = await html2pdf().set(opt).from(container).outputPdf('datauristring');
      
      // Enviar a frontend
      const savedPath = await invoke<string>('save_pdf_base64', { 
        sessionLogId: session.id,
        base64Data: base64
      });
      
      showToast({ type: 'success', message: `Reporte guardado: ${savedPath}` })
    } catch (error) {
      showToast({ type: 'error', message: `Error al generar Reporte: ${error}` })
    }
  }

  return (
    <div className="logs-page" data-log-id={session.id}>
      <div className="logs-page__header">
        {onBack && (
          <button className="log-back-btn" onClick={onBack} title="Volver a logs">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <h1 className="page-title">Log</h1>
        <span className="page-separator">•</span>
        <p className="page-description">{session.user}@{session.host}:{session.port}</p>
        <div style={{ marginLeft: 'auto' }}>
          <button className="download-report-btn" onClick={handleSavePdf}>
            Guardar PDF
          </button>
        </div>
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
              id="log-iframe"
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
