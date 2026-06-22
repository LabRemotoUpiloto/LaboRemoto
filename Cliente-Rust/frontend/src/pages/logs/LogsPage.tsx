import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Box, Container, Stack, Title, Text, Group, TextInput, Select, ActionIcon, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Search, Monitor, RefreshCw } from 'lucide-react'
import SessionsGrid from '../../components/logs/SessionsGrid'
import type { SessionLog } from '../../components/logs/SessionCard'
import { listSessionLogs, deleteSessionLog, getSessionLogContent, type SessionLogMetadata } from '../../services/session.service'
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
    if (filterUser && !session.user.toLowerCase().includes(filterUser.toLowerCase())) return false
    if (filterHost && !session.host.toLowerCase().includes(filterHost.toLowerCase())) return false
    return true
  })

  const sortedSessions = useMemo(() => {
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

      const base64 = await html2pdf().set(opt).from(container).outputPdf('datauristring')
      
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
    <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
      <Container size="lg" py="xl" px="xl">
        <Stack gap="xl">
          {/* Page title + description */}
          <Stack gap={4}>
            <Title order={1}>Logs</Title>
            <Text size="md" c="dimmed" maw={580}>
              Visualiza y analiza el historial de sesiones SSH.
            </Text>
          </Stack>

          {/* Toolbar — filters + sort + refresh */}
          <Group gap="sm">
            <TextInput
              placeholder="Buscar usuario..."
              value={filterUser}
              onChange={e => setFilterUser(e.currentTarget.value)}
              leftSection={<Search size={14} style={{ color: 'var(--text-secondary)' }} />}
              size="sm"
              w={180}
              className="dribbble-toolbar-input"
            />
            <TextInput
              placeholder="Buscar host..."
              value={filterHost}
              onChange={e => setFilterHost(e.currentTarget.value)}
              leftSection={<Monitor size={14} style={{ color: 'var(--text-secondary)' }} />}
              size="sm"
              w={180}
              className="dribbble-toolbar-input"
            />
            <Select
              size="sm"
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
              w={160}
              allowDeselect={false}
              className="dribbble-toolbar-input"
            />
            <Text size="xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {sortedSessions.length} sesión{sortedSessions.length !== 1 ? 'es' : ''}
            </Text>
            <Tooltip label="Recargar" withArrow>
              <ActionIcon variant="subtle" className="dribbble-btn-secondary h-8 w-8" onClick={loadSessions} aria-label="Recargar">
                <RefreshCw size={15} style={{ color: 'var(--text-primary)' }} />
              </ActionIcon>
            </Tooltip>
          </Group>

          {/* Sessions grid */}
          <SessionsGrid
            sessions={sortedSessions}
            selectedSessionId={null}
            onSelectSession={s => onOpenLog?.(s)}
            onViewBuffer={handleViewBuffer}
            onSavePdf={handleDownloadReport}
            onDeleteLog={handleDeleteLog}
            loading={loading}
          />
        </Stack>
      </Container>
    </Box>
  )
}

export default LogsPage
