import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActionIcon, ScrollArea, Text, Tooltip } from '@mantine/core'
import { ChevronDown, ChevronUp, Trash2, X } from 'lucide-react'
import { formatBytes } from '../shared/fileFormatters'
import type { Transfer } from './TransfersPanel'

export interface TransferQueueProps {
  transfers: Transfer[]
  onCancel: (transferId: string) => void
  onClear?: () => void
}

/** Formatea una velocidad de transferencia en bytes/segundo, ej. "1.2 MB/s". */
function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}

/** Formatea un tiempo restante en segundos como "Xs" o "Mm Ss". */
function formatEta(seconds?: number): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}m ${secs}s`
}

// Columnas: Operación | Origen | Destino | Transferido | Velocidad | ETA | Progreso | Cancelar
const GRID_TEMPLATE = 'minmax(160px, 1.4fr) minmax(120px, 1fr) minmax(120px, 1fr) 110px 90px 72px 140px 32px'

const ROW_HEIGHT = 30

const microLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-secondary)',
}

const TransferQueue: React.FC<TransferQueueProps> = ({ transfers, onCancel, onClear }) => {
  const [collapsed, setCollapsed] = useState(true)
  const prevRunningRef = useRef(0)

  // Auto-expande la cola cuando comienza una transferencia nueva.
  useEffect(() => {
    const runningCount = transfers.filter((t) => t.status === 'running').length
    if (runningCount > 0 && prevRunningRef.current === 0) {
      setCollapsed(false)
    }
    prevRunningRef.current = runningCount
  }, [transfers])

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), [])

  const completedCount = transfers.filter(
    (t) => t.status === 'done' || t.status === 'cancelled' || t.status === 'error'
  ).length
  const runningCount = transfers.filter((t) => t.status === 'running').length

  const statusAnnouncement =
    runningCount > 0
      ? `${runningCount} transferencia${runningCount > 1 ? 's' : ''} en curso`
      : transfers.length > 0
        ? 'Transferencias completadas'
        : 'Sin transferencias activas'

  return (
    <div
      aria-busy={runningCount > 0}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        borderRadius: 8,
        border: '1.5px solid var(--border-strong)',
        background: 'var(--surface-1)',
        overflow: 'hidden',
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
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        style={{
          all: 'unset',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          cursor: 'pointer',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <span style={microLabelStyle}>Cola{transfers.length > 0 ? ` (${transfers.length})` : ''}</span>
        {runningCount > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--accent-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {runningCount} activa{runningCount > 1 ? 's' : ''}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {completedCount > 0 && onClear && (
          <Tooltip label="Limpiar completadas" withArrow position="top">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              component="span"
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

        {collapsed ? <ChevronUp size={14} style={{ opacity: 0.6 }} /> : <ChevronDown size={14} style={{ opacity: 0.6 }} />}
      </button>

      {/* Content */}
      {!collapsed && (
        <>
          {transfers.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 16px' }}>
              <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                Sin transferencias activas
              </Text>
            </div>
          ) : (
            <ScrollArea style={{ maxHeight: 220 }} scrollbarSize={6}>
              {/* Column headers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_TEMPLATE,
                  gap: 8,
                  padding: '4px 10px',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--surface-1)',
                  boxShadow: '0 1px 0 var(--border-subtle)',
                }}
              >
                {['Operación', 'Origen', 'Destino', 'Transferido', 'Velocidad', 'ETA', 'Progreso', ''].map(
                  (label, i) => (
                    <span key={i} style={microLabelStyle}>
                      {label}
                    </span>
                  )
                )}
              </div>

              {transfers.map((t) => {
                let pct: number | undefined
                if (t.status === 'done') pct = 100
                else if (t.total && t.total > 0)
                  pct = Math.min(100, Math.floor(((t.bytes || 0) / t.total) * 100))

                const isRunning = t.status === 'running'
                const isError = t.status === 'error'
                const isDone = t.status === 'done'

                const barColor = isError
                  ? 'var(--danger)'
                  : isDone
                    ? 'var(--success)'
                    : 'var(--accent-primary)'

                const fileName =
                  (t.direction === 'download' ? t.local_path : t.remote_path)
                    .split(/[\\/]/)
                    .filter(Boolean)
                    .pop() || (t.direction === 'download' ? t.local_path : t.remote_path)

                const origin = t.direction === 'upload' ? t.local_path : t.remote_path
                const destination = t.direction === 'upload' ? t.remote_path : t.local_path

                const transferredText = t.total
                  ? `${formatBytes(t.bytes || 0)} / ${formatBytes(t.total)}`
                  : formatBytes(t.bytes || 0)

                return (
                  <div
                    key={t.id}
                    role="row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID_TEMPLATE,
                      gap: 8,
                      alignItems: 'center',
                      padding: '4px 10px',
                      minHeight: ROW_HEIGHT,
                      borderBottom: '1px solid var(--border-subtle)',
                      opacity: isDone || t.status === 'cancelled' ? 0.6 : 1,
                      fontSize: 12,
                    }}
                  >
                    {/* Operación */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          color: t.direction === 'upload' ? 'var(--accent-primary)' : 'var(--info)',
                          fontWeight: 700,
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        {t.direction === 'upload' ? '▲' : '▼'}
                      </span>
                      <Text size="xs" truncate title={fileName} style={{ minWidth: 0 }}>
                        {fileName}
                      </Text>
                    </div>

                    {/* Origen */}
                    <Text size="xs" truncate title={origin} c="dimmed" style={{ minWidth: 0 }}>
                      {origin}
                    </Text>

                    {/* Destino */}
                    <Text size="xs" truncate title={destination} c="dimmed" style={{ minWidth: 0 }}>
                      {destination}
                    </Text>

                    {/* Transferido */}
                    <Text
                      size="xs"
                      style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--text-secondary)' }}
                    >
                      {transferredText}
                    </Text>

                    {/* Velocidad */}
                    <Text
                      size="xs"
                      style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--text-secondary)' }}
                    >
                      {isRunning ? formatSpeed(t.speedBps) : '—'}
                    </Text>

                    {/* ETA */}
                    <Text
                      size="xs"
                      style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--text-secondary)' }}
                    >
                      {isRunning ? formatEta(t.etaSeconds) : '—'}
                    </Text>

                    {/* Progreso */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border-subtle)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct ?? 0}%`,
                            height: '100%',
                            background: barColor,
                            transition: 'width 0.2s linear',
                          }}
                        />
                      </div>
                      <Text
                        size="xs"
                        style={{
                          fontSize: 10,
                          minWidth: 30,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {pct != null ? `${pct}%` : '—'}
                      </Text>
                    </div>

                    {/* Cancelar */}
                    <Tooltip label="Cancelar" withArrow position="left" disabled={!isRunning}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={() => onCancel(t.id)}
                        disabled={!isRunning}
                        aria-label={`Cancelar transferencia de ${fileName}`}
                      >
                        <X size={12} />
                      </ActionIcon>
                    </Tooltip>

                    {isError && t.message && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <Text size="xs" style={{ fontSize: 10, color: 'var(--danger)' }}>
                          {t.message}
                        </Text>
                      </div>
                    )}
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

TransferQueue.displayName = 'TransferQueue'

export default React.memo(TransferQueue)
