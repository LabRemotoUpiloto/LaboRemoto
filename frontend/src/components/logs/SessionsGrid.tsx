import React from 'react'
import { Stack, Text, Box, Loader, Group, SimpleGrid } from '@mantine/core'
import { FileText } from 'lucide-react'
import SessionCard, { SessionLog } from './SessionCard'

interface SessionsGridProps {
  sessions: SessionLog[]
  selectedSessionId: string | null
  onSelectSession: (session: SessionLog) => void
  onViewBuffer: (session: SessionLog) => void
  onDeleteLog?: (session: SessionLog) => void
  onSavePdf?: (session: SessionLog) => void
  loading?: boolean
}

function getDayKey(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toISOString().slice(0, 10)
}

function formatDayLabel(dayKey: string): string {
  const date = new Date(dayKey + 'T12:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (dayKey === today.toISOString().slice(0, 10)) return 'Hoy'
  if (dayKey === yesterday.toISOString().slice(0, 10)) return 'Ayer'

  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const SessionsGrid: React.FC<SessionsGridProps> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  onViewBuffer,
  onDeleteLog,
  onSavePdf,
  loading = false
}) => {
  if (loading) {
    return (
      <Box py={80}>
        <Stack align="center" gap="md">
          <Loader size="sm" color="var(--accent-primary)" />
          <Text size="sm" c="dimmed">Cargando sesiones...</Text>
        </Stack>
      </Box>
    )
  }

  if (sessions.length === 0) {
    return (
      <Box py={80}>
        <Stack align="center" gap="md">
          <Box
            className="flex items-center justify-center"
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
            }}
          >
            <FileText size={32} style={{ color: 'var(--accent-primary)', opacity: 0.5 }} />
          </Box>
          <Stack align="center" gap={4}>
            <Text fw={500}>No se encontraron sesiones</Text>
            <Text c="dimmed" size="sm">Intenta ajustar los filtros o conectar a un servidor SSH</Text>
          </Stack>
        </Stack>
      </Box>
    )
  }

  const groups: { dayKey: string; sessions: SessionLog[] }[] = []
  const seen = new Map<string, SessionLog[]>()
  for (const s of sessions) {
    const key = getDayKey(s.startedAt)
    if (!seen.has(key)) { seen.set(key, []); groups.push({ dayKey: key, sessions: seen.get(key)! }) }
    seen.get(key)!.push(s)
  }

  return (
    <Stack gap="xl">
      {groups.map(({ dayKey, sessions: daySessions }) => (
        <Box key={dayKey}>
          <Group gap="sm" mb="sm">
            <Text
              size="xs"
              fw={700}
              tt="uppercase"
              c="dimmed"
              style={{ letterSpacing: '0.1em' }}
            >
              {formatDayLabel(dayKey)}
            </Text>
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {daySessions.length} sesión{daySessions.length !== 1 ? 'es' : ''}
            </Text>
            <Box style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {daySessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selectedSessionId === session.id}
                onSelect={() => onSelectSession(session)}
                onViewBuffer={() => onViewBuffer(session)}
                onDelete={onDeleteLog ? () => onDeleteLog(session) : undefined}
                onSavePdf={onSavePdf ? () => onSavePdf(session) : undefined}
              />
            ))}
          </SimpleGrid>
        </Box>
      ))}
    </Stack>
  )
}

export default SessionsGrid
