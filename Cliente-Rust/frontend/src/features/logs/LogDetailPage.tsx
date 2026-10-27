import React, { useEffect, useState } from 'react'
import { Box, Group, Stack, Title, Text, Button, ActionIcon, Tooltip, Loader } from '@mantine/core'
import { ChevronLeft, FileDown } from 'lucide-react'
import type { SessionLog } from './sesiones'
import { getSessionLogContent } from './session.service'
import { useToasts } from '@/app/providers/ToastContext'
import { guardarReporteComandos } from './reporte'

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
      let content = await getSessionLogContent(session.id)

      // Fix report header: rename title and remove subtitle
      content = content.replace(/REPORTES INGENIERÍA/g, 'Reportes de Sesión')
      content = content.replace(/<h2[^>]*>Registro de Auditor[^<]*<\/h2>/gi, '')

      // Inject dark terminal background into the HTML
      const styledContent = content.includes('<body')
        ? content.replace(/<body/, '<body style="background-color:#1e1e1e;color:#d4d4d4;margin:0;padding:8px;"')
        : `<html><body style="background-color:#1e1e1e;color:#d4d4d4;margin:0;padding:8px;">${content}</body></html>`
      setHtmlContent(styledContent)
    } catch {
      setError('No se pudo cargar el contenido del log')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePdf = async () => {
    showToast({ type: 'info', message: 'Preparando el reporte de comandos…' })
    try {
      showToast({ type: 'success', message: `Reporte guardado: ${await guardarReporteComandos(session)}` })
    } catch (error) {
      showToast({ type: 'error', message: `No se pudo generar el reporte: ${error}` })
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
        py="md"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Group gap="sm" wrap="nowrap">
          {onBack && (
            <Tooltip label="Volver a logs" withArrow position="bottom">
              <ActionIcon variant="default" size="md" onClick={onBack} aria-label="Volver">
                <ChevronLeft size={16} />
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
