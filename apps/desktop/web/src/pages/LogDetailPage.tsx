import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionLog } from '../components/logs/SessionCard'
import { getSessionLogContent, getLogHtmlContentCloud } from '../api/sessionCapture'
import { useAuth } from '../contexts/AuthContext'
import { useToasts } from '../contexts/ToastContext'
import './LogsPage.css'

interface LogDetailPageProps {
  session: SessionLog
}

// Página de detalle de un log (buffer/comandos próximamente)
const LogDetailPage: React.FC<LogDetailPageProps> = ({ session }) => {
  const { user, isAuthenticated } = useAuth()
  const { push: showToast } = useToasts()
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  useEffect(() => {
    loadLogContent()
  }, [session.id])

  const loadLogContent = async () => {
    setLoading(true)
    setError(null)
    try {
      let content: string
      
      // Si está autenticado y tiene user_id, cargar desde Supabase
      if (isAuthenticated && user && user.user_id) {
        console.log(`☁️ Loading log content from cloud for user ${user.user_id}, session ${session.id}`)
        content = await getLogHtmlContentCloud(user.user_id, session.id)
      } else {
        // Fallback: cargar desde archivos locales
        console.log(`💾 Loading log content from local files for session ${session.id}`)
        content = await getSessionLogContent(session.id)
      }
      
      setHtmlContent(content)
    } catch (err) {
      console.error('Error loading log content:', err)
      setError('No se pudo cargar el contenido del log')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = async () => {
    console.log('🔵 handleDownloadPdf iniciado')
    console.log('🔵 User:', user)
    console.log('🔵 Session:', session)
    
    if (!user) {
      console.error('❌ Usuario no autenticado')
      showToast({ type: 'error', message: 'Debes estar autenticado para generar PDFs' })
      return
    }

    try {
      setGeneratingPdf(true)
      showToast({ type: 'info', message: 'Generando PDF...' })
      
      console.log('🔵 Invocando generate_session_report_pdf con:', {
        sessionLogId: session.id,
        userId: user.user_id,
        roleId: user.role_id,
      })

      // Invocar comando Tauri para generar PDF
      const pdfPath = await invoke<string>('generate_session_report_pdf', {
        sessionLogId: session.id,
        userId: user.user_id,
        roleId: user.role_id,
      })
      
      console.log('✅ PDF generado en:', pdfPath)

      // Usar el comando save_pdf_dialog que muestra el diálogo y copia el archivo
      const defaultFilename = `reporte_sesion_${session.host}_${new Date().toISOString().split('T')[0]}.pdf`
      
      console.log('🔵 Invocando save_pdf_dialog con:', {
        tempPdfPath: pdfPath,
        defaultFilename: defaultFilename
      })
      
      const savedPath = await invoke<string>('save_pdf_dialog', {
        tempPdfPath: pdfPath,
        defaultFilename: defaultFilename
      })
      
      console.log('✅ PDF guardado en:', savedPath)

      showToast({ type: 'success', message: `PDF guardado en: ${savedPath}` })
    } catch (err) {
      console.error('❌ Error generando PDF:', err)
      console.error('❌ Error type:', typeof err)
      console.error('❌ Error details:', JSON.stringify(err, null, 2))
      
      if (err !== 'Diálogo cancelado') {
        showToast({ type: 'error', message: `Error al generar PDF: ${err}` })
      }
    } finally {
      setGeneratingPdf(false)
      console.log('🔵 handleDownloadPdf finalizado')
    }
  }

  return (
    <div className="logs-page" data-log-id={session.id}>
      <div className="logs-page__header">
        <h1 className="page-title">Log</h1>
        <span className="page-separator">•</span>
        <p className="page-description">{session.user}@{session.host}:{session.port}</p>
        <button
          onClick={() => {
            console.log('🟢 BOTÓN CLICKEADO!')
            handleDownloadPdf()
          }}
          disabled={generatingPdf || loading}
          className="download-pdf-button"
          title="Descargar reporte en PDF"
        >
          {generatingPdf ? '⏳ Generando...' : '📄 Descargar PDF'}
        </button>
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
