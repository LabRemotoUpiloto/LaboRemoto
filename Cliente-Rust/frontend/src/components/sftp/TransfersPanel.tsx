import React, { useCallback, useState } from 'react'
import { ActionIcon, Group, Progress, ScrollArea, Text, Tooltip } from '@mantine/core'
import { Upload, Download, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatBytes } from '../shared/fileFormatters'

export interface Transfer {
  id: string
  direction: 'upload' | 'download'
  local_path: string
  remote_path: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  bytes?: number
  total?: number
  message?: string
  session_id?: string
  /** Velocidad promedio en bytes/segundo (ventana móvil), solo mientras corre. */
  speedBps?: number
  /** Tiempo estimado restante en segundos, solo mientras corre. */
  etaSeconds?: number
}

export interface TransfersPanelProps {
  transfers: Transfer[]
  onCancel: (transferId: string) => void
  onClear?: () => void
}

/** Formatea una velocidad de transferencia en bytes/segundo, ej. "1.2 MB/s". */
function formatSpeed(bps?: number): string | undefined {
  if (!bps || bps <= 0) return undefined
  return `${formatBytes(bps)}/s`
}

/** Formatea un tiempo restante en segundos como "Xs" o "Mm Ss". */
function formatEta(seconds?: number): string | undefined {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return undefined
  const total = Math.round(seconds)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}m ${secs}s`
}

const TransfersPanel: React.FC<TransfersPanelProps> = ({ transfers, onCancel, onClear }) => {
  const [collapsed, setCollapsed] = useState(false)

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), [])

  const completedCount = transfers.filter(
    (t) => t.status === 'done' || t.status === 'cancelled' || t.status === 'error'
  ).length
  const doneCount = transfers.filter((t) => t.status === 'done').length
  const runningCount = transfers.filter((t) => t.status === 'running').length

  const statusAnnouncement =
    runningCount > 0
      ? `${runningCount} transferencia${runningCount > 1 ? 's' : ''} en curso`
      : doneCount > 0
        ? `${doneCount} transferencia${doneCount > 1 ? 's' : ''} completada${doneCount > 1 ? 's' : ''}`
        : 'Sin transferencias activas'

  return (
    <div
      aria-busy={runningCount > 0}
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: collapsed ? 36 : 180,
        minHeight: 36,
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
        overflow: 'hidden',
        transition: 'max-height 0.2s ease',
        gridColumn: '1 / -1',
      }}
    >
      <span
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {statusAnnouncement}
      </span>

      {/* Header */}
      <div
        onClick={toggleCollapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          minHeight: 36,
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <Text size="xs" fw={600} c="dimmed">
          Transferencias
        </Text>
        <Text
          size="xs"
          fw={600}
          style={{
            fontVariantNumeric: 'tabular-nums',
            background: 'var(--interactive-hover)',
            borderRadius: 'var(--mantine-radius-xl)',
            padding: '1px 8px',
            fontSize: 10,
            color: 'var(--text-secondary)',
          }}
        >
          {runningCount > 0 ? `${runningCount} activa${runningCount > 1 ? 's' : ''}` : transfers.length}
        </Text>

        <div style={{ flex: 1 }} />

        {completedCount > 0 && onClear && (
          <Tooltip label="Limpiar completadas" withArrow position="top">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                onClear()
              }}
              aria-label="Limpiar completadas"
            >
              <Trash2 size={12} />
            </ActionIcon>
          </Tooltip>
        )}

        {collapsed ? <ChevronUp size={14} style={{ opacity: 0.5 }} /> : <ChevronDown size={14} style={{ opacity: 0.5 }} />}
      </div>

      {/* Content */}
      {!collapsed && (
        <>
          {transfers.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
              <Text size="xs" c="dimmed" fs="italic">
                No hay transferencias activas
              </Text>
            </div>
          ) : (
            <ScrollArea style={{ flex: 1 }} scrollbarSize={4}>
              {transfers.map((t) => {
                let pct: number | undefined
                if (t.status === 'done') pct = 100
                else if (t.total && t.total > 0)
                  pct = Math.min(100, Math.floor(((t.bytes || 0) / t.total) * 100))

                const isRunning = t.status === 'running'
                const isError = t.status === 'error'
                const isDone = t.status === 'done'

                const statusLabel = isRunning
                  ? 'En progreso'
                  : isDone
                    ? 'Completado'
                    : isError
                      ? 'Error'
                      : 'Cancelado'

                const progressColor = isError ? 'red' : isDone ? 'green' : 'teal'

                const progressText =
                  pct !== undefined
                    ? `${pct}%`
                    : isRunning
                      ? t.total
                        ? formatBytes(t.bytes || 0)
                        : `${t.bytes || 0} B`
                      : isDone
                        ? '100%'
                        : '\u2014'

                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 12px',
                      borderBottom: '1px solid var(--border-subtle)',
                      opacity: isDone ? 0.6 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    {/* Direction icon */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--mantine-radius-sm)',
                        background:
                          t.direction === 'download'
                            ? 'var(--info-bg)'
                            : 'var(--success-bg)',
                        color:
                          t.direction === 'download'
                            ? 'var(--info)'
                            : 'var(--success)',
                        flexShrink: 0,
                      }}
                    >
                      {t.direction === 'download' ? <Download size={14} /> : <Upload size={14} />}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="xs"
                        truncate
                        title={
                          t.direction === 'download'
                            ? `${t.remote_path} → ${t.local_path}`
                            : `${t.local_path} → ${t.remote_path}`
                        }
                      >
                        {t.direction === 'download' ? t.remote_path : t.local_path}
                        <span style={{ opacity: 0.4, margin: '0 4px' }}>→</span>
                        {t.direction === 'download' ? t.local_path : t.remote_path}
                      </Text>
                      <Group gap={6} mt={3} wrap="nowrap">
                        <Progress
                          value={pct ?? 0}
                          size={4}
                          radius="xl"
                          color={progressColor}
                          style={{ flex: 1 }}
                          animated={isRunning}
                        />
                        <Text
                          size="xs"
                          fw={600}
                          c="dimmed"
                          style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 36, textAlign: 'right', fontSize: 10 }}
                        >
                          {progressText}
                        </Text>
                      </Group>
                      {isRunning && (t.speedBps || t.etaSeconds != null || t.total) && (
                        <Text
                          size="xs"
                          mt={2}
                          style={{
                            fontSize: 10,
                            color: 'var(--text-tertiary)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatSpeed(t.speedBps) && (
                            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                              {formatSpeed(t.speedBps)}
                            </span>
                          )}
                          {formatEta(t.etaSeconds) && (
                            <span style={{ marginLeft: 8 }}>
                              {'•'} ETA {formatEta(t.etaSeconds)}
                            </span>
                          )}
                          {t.total != null && (
                            <span style={{ marginLeft: 8 }}>
                              {'•'} {formatBytes(t.bytes || 0)} / {formatBytes(t.total)}
                            </span>
                          )}
                        </Text>
                      )}
                      {t.message && (
                        <Text size="xs" c={isError ? 'red' : 'dimmed'} mt={2}>
                          {t.message}
                        </Text>
                      )}
                    </div>

                    {/* Status text */}
                    <Text
                      size="xs"
                      fw={600}
                      style={{
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                        color: isRunning
                          ? 'var(--accent-primary)'
                          : isDone
                            ? 'var(--success)'
                            : isError
                              ? 'var(--danger)'
                              : 'var(--text-muted)',
                      }}
                    >
                      {statusLabel}
                    </Text>

                    {/* Cancel */}
                    <Tooltip label="Cancelar" withArrow position="left" disabled={!isRunning}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation()
                          onCancel(t.id)
                        }}
                        disabled={!isRunning}
                        aria-label="Cancelar transferencia"
                      >
                        <X size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                )
              })}
            </ScrollArea>
          )}
        </>
      )}
    </div>
  )
}

export default TransfersPanel
