import React from 'react'
import { Card, Group, Stack, Text, Button, ActionIcon, Box } from '@mantine/core'
import { Clock, Terminal, Calendar, Eye, FileDown, Trash2 } from 'lucide-react'
import { isRaspberryPi4, KNOWN_DEVICES } from '../../constants/devices'

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

  // Dispositivos conocidos del laboratorio (ej. la Pi 4) se muestran con su
  // nombre amigable en vez de la IP -- mismo criterio que ya usa el selector
  // de conexión (ver RecentConnectionsPanel/constants/devices).
  const isKnownDevice = isRaspberryPi4(session.host, session.port)
  const hostLabel = isKnownDevice ? KNOWN_DEVICES.RASPBERRY_PI_4.label : session.host
  const showPort = !isKnownDevice

  return (
    <Card
      padding="md"
      className="dribbble-card dribbble-card-interactive group"
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
        {/* Header: identity + delete -- antes también llevaba un cuadradito
            con un ícono de terminal, idéntico en TODAS las tarjetas (no
            diferenciaba nada, puro ruido repetido en una grilla de varias
            decenas de sesiones). */}
        <Group gap="sm" wrap="nowrap">
          {/* Identidad: antes era lo más grande/negrita de la tarjeta, pero
              en la práctica es casi idéntica en decenas de sesiones del
              mismo estudiante -- lo que de verdad distingue una tarjeta de
              otra es la fila de stats de abajo, así que esta queda más
              chica y en un solo renglón (con nombre amigable para
              dispositivos conocidos, en vez de truncar la IP a la mitad). */}
          <Text
            size="xs"
            truncate
            ff="monospace"
            style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}
            title={`${session.user}@${session.host}:${session.port}`}
          >
            {session.user}
            <span style={{ opacity: 0.7 }}>@</span>
            {hostLabel}
            {showPort && <span style={{ opacity: 0.7 }}>:{session.port}</span>}
          </Text>

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

        {/* Stats row -- esto sí es lo que distingue una tarjeta de otra
            (duración y cantidad de comandos), así que ahora es lo más
            grande/negrita de la tarjeta; la hora queda secundaria (el día
            ya está en el encabezado del grupo, arriba). */}
        <Group gap="lg">
          <Group gap={6}>
            <Clock size={15} style={{ color: 'var(--accent-primary)' }} />
            <Text size="sm" fw={700} style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(session.duration)}
            </Text>
          </Group>
          <Group gap={6}>
            <Terminal size={15} style={{ color: 'var(--accent-primary)' }} />
            <Text size="sm" fw={700} style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {session.totalCommands} cmds
            </Text>
          </Group>
          <Group gap={4} ml="auto" visibleFrom="sm">
            <Calendar size={12} style={{ color: 'var(--text-tertiary)' }} />
            <Text size="xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(session.startedAt)}
            </Text>
          </Group>
        </Group>

        {/* Actions */}
        <Group gap="xs" onClick={e => e.stopPropagation()}>
          <Button
            size="compact-sm"
            leftSection={<Eye size={14} />}
            onClick={onViewBuffer}
            style={{ flex: 1 }}
            className="dribbble-btn-outline h-8 text-xs"
          >
            Ver Logs
          </Button>
          {onSavePdf && (
            <Button
              size="compact-sm"
              leftSection={<FileDown size={14} />}
              onClick={onSavePdf}
              title="Guardar PDF"
              className="dribbble-btn-secondary h-8 text-xs"
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
