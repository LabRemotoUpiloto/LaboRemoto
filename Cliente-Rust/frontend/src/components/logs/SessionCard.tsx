import React from 'react'
import { Card, Group, Stack, Text, Button, ActionIcon, Box, rem } from '@mantine/core'
import { Clock, Terminal, Calendar, Eye, FileDown, Trash2 } from 'lucide-react'

export interface SessionLog {
  id: string
  user: string
  host: string
  port: number
  startedAt: string
  endedAt?: string
  duration?: number
  totalCommands: number
}

interface SessionCardProps {
  session: SessionLog
  isSelected: boolean
  onSelect: () => void
  onViewBuffer: () => void
  onDelete?: () => void
  onSavePdf?: () => void
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isSelected,
  onSelect,
  onViewBuffer,
  onDelete,
  onSavePdf
}) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'En curso'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const formatTime = (isoDate: string) =>
    new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoDate))

  const isActive = !session.endedAt

  return (
    <Card
      withBorder
      padding="md"
      radius="md"
      className="group cursor-pointer"
      onClick={onSelect}
      tabIndex={0}
      role="row"
      aria-selected={isSelected}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      style={{
        transition: 'all 0.2s ease',
        borderColor: isSelected ? 'var(--accent-primary)' : undefined,
        backgroundColor: isSelected
          ? 'color-mix(in srgb, var(--accent-primary) 5%, var(--background-secondary))'
          : undefined,
      }}
    >
      <Stack gap="sm">
        {/* Header: icon + identity + delete */}
        <Group gap="sm" wrap="nowrap">
          <Box
            className="flex items-center justify-center shrink-0"
            style={{
              width: rem(36),
              height: rem(36),
              borderRadius: 'var(--mantine-radius-md)',
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              color: 'var(--accent-primary)',
            }}
          >
            <Terminal size={18} />
          </Box>

          <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
            <Group gap={0} wrap="nowrap">
              <Text size="sm" fw={600} truncate ff="monospace" style={{ color: 'var(--mantine-color-text)' }}>
                {session.user}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">@</Text>
              <Text size="sm" c="dimmed" truncate ff="monospace" style={{ flex: 1, minWidth: 0 }}>
                {session.host}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" ff="monospace">:{session.port}</Text>
          </div>

          {isActive && (
            <Box
              className="shrink-0"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)',
                boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                animation: 'pulse 2s infinite',
              }}
              title="Sesión activa"
            />
          )}

          {onDelete && (
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={e => { e.stopPropagation(); onDelete() }}
              aria-label="Eliminar log"
              title="Eliminar"
            >
              <Trash2 size={14} />
            </ActionIcon>
          )}
        </Group>

        {/* Stats row */}
        <Group gap="lg">
          <Group gap={4}>
            <Clock size={13} style={{ color: 'var(--text-tertiary)' }} />
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(session.duration)}
            </Text>
          </Group>
          <Group gap={4}>
            <Terminal size={13} style={{ color: 'var(--text-tertiary)' }} />
            <Text size="xs" fw={500} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {session.totalCommands} cmds
            </Text>
          </Group>
          <Group gap={4} ml="auto" visibleFrom="sm">
            <Calendar size={12} style={{ color: 'var(--text-tertiary)' }} />
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(session.startedAt)}
            </Text>
          </Group>
        </Group>

        {/* Actions */}
        <Group gap="xs" onClick={e => e.stopPropagation()}>
          <Button
            variant="light"
            size="compact-sm"
            leftSection={<Eye size={14} />}
            onClick={onViewBuffer}
            style={{ flex: 1 }}
          >
            Ver Logs
          </Button>
          {onSavePdf && (
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<FileDown size={14} />}
              onClick={onSavePdf}
              title="Guardar PDF"
            >
              PDF
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

export default SessionCard
