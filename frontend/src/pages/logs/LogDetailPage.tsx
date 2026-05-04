import React, { useEffect, useState } from 'react'
import { Box, Group, Stack, Title, Text, Button, ActionIcon, Tooltip, Loader } from '@mantine/core'
import { ChevronLeft, FileDown } from 'lucide-react'
import type { SessionLog } from '../../components/logs/SessionCard'
import { getSessionLogContent } from '../../api/sessionCapture'
import { invoke } from '@tauri-apps/api/core'
import { useToasts } from '../../contexts/ToastContext'
import html2pdf from 'html2pdf.js'
import { extractValidCommands, buildCommandsReportHtml } from '../../utils/commandParser'

interface LogDetailPageProps {
  session: SessionLog
  onBack?: () => void
}

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

      const base64 = await html2pdf().set(opt).from(container).outputPdf('datauristring');
      
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
    <Box
      w="100%"
      h="100%"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        px="lg"
        py="sm"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Group gap="md" wrap="nowrap">
          {onBack && (
            <Tooltip label="Volver a logs" withArrow>
              <ActionIcon variant="default" size="lg" onClick={onBack} aria-label="Volver">
                <ChevronLeft size={18} />
              </ActionIcon>
            </Tooltip>
          )}

          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Title order={4}>Log de Sesión</Title>
            <Text size="sm" c="dimmed" ff="monospace" truncate>
              {session.user}@{session.host}:{session.port}
            </Text>
          </Stack>

          <Button
            variant="default"
            size="sm"
            leftSection={<FileDown size={16} />}
            onClick={handleSavePdf}
          >
            Guardar PDF
          </Button>
        </Group>
      </Box>

      {/* Content area — iframe fills remaining space */}
      <Box style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading && (
          <Box
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Stack align="center" gap="md">
              <Loader size="md" color="var(--accent-primary)" />
              <Text size="sm" c="dimmed">Cargando log...</Text>
            </Stack>
          </Box>
        )}

        {error && (
          <Box
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Stack align="center" gap="md">
              <Text size="sm" c="red">{error}</Text>
              <Button variant="light" size="xs" onClick={loadLogContent}>
                Reintentar
              </Button>
            </Stack>
          </Box>
        )}

        {!loading && !error && htmlContent && (
          <iframe
            id="log-iframe"
            srcDoc={htmlContent}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
            title={`Session log: ${session.id}`}
          />
        )}
      </Box>
    </Box>
  )
}

export default LogDetailPage
