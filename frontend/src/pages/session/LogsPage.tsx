import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TextInput, Select, ActionIcon, Badge, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Text } from '@mantine/core'
import SessionsGrid from '../../components/logs/SessionsGrid'
import type { SessionLog } from '../../components/logs/SessionCard'
import { listSessionLogs, deleteSessionLog, getSessionLogContent, type SessionLogMetadata } from '../../api/sessionCapture'
import html2pdf from 'html2pdf.js'
import { useToasts } from '../../contexts/ToastContext'
import { extractValidCommands, buildCommandsReportHtml } from '../../utils/commandParser'

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
    modals.openConfirmModal({
      title: '¿Eliminar log?',
      centered: true,
      overlayProps: { blur: 3 },
      children: (
        <Text size="sm" c="dimmed">
          ¿Estás seguro de que deseas eliminar el log de{' '}
          <strong>{session.user}@{session.host}</strong>? Esta acción no se puede deshacer.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await deleteSessionLog(session.id)
          push({ type: 'success', message: `Log de ${session.user}@${session.host} eliminado` })
          setSessions(prev => prev.filter(s => s.id !== session.id))
        } catch (error) {
          push({ type: 'error', message: `Error al eliminar el log: ${error}` })
        }
      },
    })
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
      <header className="page-header-integrated">
        <h2 className="page-header-title">Logs</h2>
        <div className="page-header-content">
          <p className="page-header-description">Visualiza y analiza el historial de sesiones SSH</p>
        </div>
      </header>

      <div className="logs-page__scrollable">
        <div className="logs-page-inner">
          {/* ── Toolbar con Mantine + Tailwind ── */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
            <TextInput
              placeholder="usuario..."
              value={filterUser}
              size="xs"
              onChange={e => setFilterUser(e.currentTarget.value)}
              leftSection={
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              }
              styles={{ input: { fontSize: 12 } }}
            />
            <TextInput
              placeholder="host..."
              value={filterHost}
              size="xs"
              onChange={e => setFilterHost(e.currentTarget.value)}
              leftSection={
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
                </svg>
              }
              styles={{ input: { fontSize: 12 } }}
            />
            <div className="ml-auto flex items-center gap-2">
              <Select
                size="xs"
                value={sortBy}
                onChange={v => setSortBy((v ?? 'date-desc') as SortOption)}
                data={[
                  { value: 'date-desc', label: 'Más recientes' },
                  { value: 'date-asc',  label: 'Más antiguos' },
                  { value: 'duration-desc', label: 'Mayor duración' },
                  { value: 'duration-asc',  label: 'Menor duración' },
                  { value: 'host-asc',  label: 'Host A→Z' },
                  { value: 'host-desc', label: 'Host Z→A' },
                ]}
                styles={{ input: { fontSize: 12 } }}
                w={140}
                allowDeselect={false}
              />
              <Badge variant="light" color="teal" size="sm">{sortedSessions.length}</Badge>
              <Tooltip label="Recargar" withArrow>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={loadSessions}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                </ActionIcon>
              </Tooltip>
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
    </div>
  )
}

export default LogsPage
