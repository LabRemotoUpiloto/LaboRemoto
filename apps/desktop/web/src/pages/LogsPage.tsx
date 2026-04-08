import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './LogsPage.css'
import SessionsGrid from '../components/logs/SessionsGrid'
import type { SessionLog } from '../components/logs/SessionCard'
import { listSessionLogs, deleteSessionLog, getSessionLogContent, type SessionLogMetadata } from '../api/sessionCapture'
import html2pdf from 'html2pdf.js'
import { useToasts } from '../contexts/ToastContext'
import SweetAlert from '../components/modals/SweetAlert'
import { extractValidCommands, buildCommandsReportHtml } from '../utils/commandParser'

type SortOption = 'date-desc' | 'date-asc' | 'duration-desc' | 'duration-asc' | 'host-asc' | 'host-desc'

interface LogsPageProps {
  onOpenLog?: (session: SessionLog) => void
}

// Adaptador: convierte SessionLogMetadata del backend al formato SessionLog de la UI
function adaptMetadataToSessionLog(metadata: SessionLogMetadata): SessionLog {
  return {
    id: metadata.session_id,
    user: metadata.user,
    host: metadata.host,
    port: metadata.port,
    startedAt: metadata.start_time,
    endedAt: metadata.end_time,
    duration: metadata.duration_seconds,
    totalCommands: metadata.command_count ?? 0
  }
}

const LogsPage: React.FC<LogsPageProps> = ({ onOpenLog }) => {
  const [sessions, setSessions] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUser, setFilterUser] = useState('')
  const [filterHost, setFilterHost] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date-desc')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toDeleteSession, setToDeleteSession] = useState<SessionLog | null>(null)
  const { push } = useToasts()

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    setLoading(true)
    try {
      const metadata = await listSessionLogs()
      const adaptedSessions = metadata.map(adaptMetadataToSessionLog)
      setSessions(adaptedSessions)
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  const filteredSessions = sessions.filter(session => {
    if (filterUser && !session.user.toLowerCase().includes(filterUser.toLowerCase())) {
      return false
    }
    if (filterHost && !session.host.toLowerCase().includes(filterHost.toLowerCase())) {
      return false
    }
    return true
  })

  // Ordenar sesiones según la opción seleccionada
  const sortedSessions = React.useMemo(() => {
    const filtered = [...filteredSessions]
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        case 'date-asc':
          return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        case 'duration-desc':
          return (b.duration || 0) - (a.duration || 0)
        case 'duration-asc':
          return (a.duration || 0) - (b.duration || 0)
        case 'host-asc':
          return `${a.user}@${a.host}`.localeCompare(`${b.user}@${b.host}`)
        case 'host-desc':
          return `${b.user}@${b.host}`.localeCompare(`${a.user}@${a.host}`)
        default:
          return 0
      }
    })
  }, [filteredSessions, sortBy])

  const handleDeleteLog = (session: SessionLog) => {
    setToDeleteSession(session)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!toDeleteSession) return

    try {
      // Usar eliminación local (única disponible en esta versión)
      await deleteSessionLog(toDeleteSession.id)
      
      push({ type: 'success', message: `Log de ${toDeleteSession.user}@${toDeleteSession.host} eliminado` })
      
      // Actualizar la lista
      setSessions(prev => prev.filter(s => s.id !== toDeleteSession.id))
    } catch (error) {
      push({ type: 'error', message: `Error al eliminar el log: ${error}` })
    } finally {
      setConfirmOpen(false)
      setToDeleteSession(null)
    }
  }

  const handleViewBuffer = (session: SessionLog) => {
    onOpenLog?.(session)
  }

  const handleDownloadReport = async (session: SessionLog) => {
    push({ type: 'info', message: 'Preparando Reporte de Comandos...' })
    try {
      // 1. Obtener contenido
      const content = await getSessionLogContent(session.id)
      
      const commands = extractValidCommands(content);
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
        html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#1e1e1e', windowWidth: 1000 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      }

      // Convertir a base64
      const base64 = await html2pdf().set(opt).from(container).outputPdf('datauristring')
      
      // Enviar a Rust para guardar
      const savedPath = await invoke<string>('save_pdf_base64', { 
        sessionLogId: session.id,
        base64Data: base64
      })
      
      push({ type: 'success', message: `Reporte guardado: ${savedPath}` })
    } catch (error) {
      push({ type: 'error', message: `Error al generar Reporte: ${error}` })
    }
  }

  return (
    <div className="logs-page">
      {/* Header con título y descripción - Doble Header Minimalista */}
      <header className="page-header-integrated">
        <h2 className="page-header-title">Logs</h2>
        <div className="page-header-content">
          <p className="page-header-description">Visualiza y analiza el historial de sesiones SSH</p>
        </div>
      </header>

      <div className="logs-page__scrollable">
        <div className="logs-page-inner">
          {/* ── Unified toolbar ── */}
          <div className="logs-toolbar">
            <div className="logs-toolbar__search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="usuario..."
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                className="logs-toolbar__input"
              />
            </div>
            <div className="logs-toolbar__search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <input
                type="text"
                placeholder="host..."
                value={filterHost}
                onChange={e => setFilterHost(e.target.value)}
                className="logs-toolbar__input"
              />
            </div>
            <div className="logs-toolbar__right">
              <select
                id="sort-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="logs-toolbar__select"
              >
                <option value="date-desc">Más recientes</option>
                <option value="date-asc">Más antiguos</option>
                <option value="duration-desc">Mayor duración</option>
                <option value="duration-asc">Menor duración</option>
                <option value="host-asc">Host A→Z</option>
                <option value="host-desc">Host Z→A</option>
              </select>
              <span className="logs-toolbar__count">{sortedSessions.length}</span>
              <button
                className="logs-toolbar__refresh"
                onClick={loadSessions}
                title="Recargar"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
              </button>
            </div>
          </div>

          <SessionsGrid
            sessions={sortedSessions}
            selectedSessionId={null}
            onSelectSession={s => onOpenLog?.(s)}
            onViewBuffer={handleViewBuffer}
            onSavePdf={handleDownloadReport}
            onDeleteLog={handleDeleteLog}
            loading={loading}
          />
        </div>
      </div>


      {/* Modal de confirmación de eliminación */}
      <SweetAlert
        open={confirmOpen}
        title="¿Eliminar log?"
        message={
          toDeleteSession 
            ? `¿Estás seguro de que deseas eliminar el log de ${toDeleteSession.user}@${toDeleteSession.host}? Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="warning"
        onConfirm={confirmDelete}
        onCancel={() => {
          setConfirmOpen(false)
          setToDeleteSession(null)
        }}
      />
    </div>
  )
}

export default LogsPage
