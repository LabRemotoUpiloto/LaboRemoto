import React, { useCallback } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { ActionIcon, Text, Tooltip } from '@mantine/core'
import { ArrowRight, ArrowLeft, ArrowUp, ArrowDown, X, Trash2, Check } from 'lucide-react'
import { formatBytes } from '../shared/fileFormatters'
import type { Transfer } from './TransfersPanel'

export interface TransferBridgeProps {
  vertical: boolean
  onUpload: () => void
  canUpload: boolean
  onDownload: () => void
  canDownload: boolean
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

const bridgeButtonBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '2px solid var(--border-strong)',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  boxShadow: '3px 3px 0 var(--border-strong)',
  transition: 'transform 0.1s, box-shadow 0.1s, background 0.15s, border-color 0.15s',
}

const TransferBridge: React.FC<TransferBridgeProps> = ({
  vertical,
  onUpload,
  canUpload,
  onDownload,
  canDownload,
  transfers,
  onCancel,
  onClear,
}) => {
  const isNarrow = useMediaQuery('(max-width: 1099px)')
  const horizontal = isNarrow ?? vertical === false

  const handleButtonEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, enabled: boolean) => {
      if (!enabled) return
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.boxShadow = '4px 5px 0 var(--accent-primary)'
      e.currentTarget.style.borderColor = 'var(--accent-primary)'
    },
    []
  )

  const handleButtonLeave = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, enabled: boolean) => {
      if (!enabled) return
      e.currentTarget.style.transform = 'none'
      e.currentTarget.style.boxShadow = '3px 3px 0 var(--border-strong)'
      e.currentTarget.style.borderColor = 'var(--border-strong)'
    },
    []
  )

  const handleButtonDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, enabled: boolean) => {
      if (!enabled) return
      e.currentTarget.style.transform = 'translateY(1px)'
      e.currentTarget.style.boxShadow = '1px 1px 0 var(--accent-primary)'
    },
    []
  )

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

  const uploadButton = (
    <button
      type="button"
      onClick={onUpload}
      disabled={!canUpload}
      aria-label="Enviar archivo seleccionado al laboratorio"
      onMouseEnter={(e) => handleButtonEnter(e, canUpload)}
      onMouseLeave={(e) => handleButtonLeave(e, canUpload)}
      onMouseDown={(e) => handleButtonDown(e, canUpload)}
      onMouseUp={(e) => handleButtonEnter(e, canUpload)}
      style={{
        ...bridgeButtonBaseStyle,
        opacity: canUpload ? 1 : 0.45,
        cursor: canUpload ? 'pointer' : 'not-allowed',
        borderColor: canUpload ? 'var(--accent-primary)' : 'var(--border-strong)',
        color: canUpload ? 'var(--accent-primary)' : 'var(--text-muted)',
      }}
    >
      {horizontal ? <ArrowUp size={16} /> : <ArrowRight size={16} />}
      Enviar
    </button>
  )

  const downloadButton = (
    <button
      type="button"
      onClick={onDownload}
      disabled={!canDownload}
      aria-label="Traer archivo seleccionado a tu equipo"
      onMouseEnter={(e) => handleButtonEnter(e, canDownload)}
      onMouseLeave={(e) => handleButtonLeave(e, canDownload)}
      onMouseDown={(e) => handleButtonDown(e, canDownload)}
      onMouseUp={(e) => handleButtonEnter(e, canDownload)}
      style={{
        ...bridgeButtonBaseStyle,
        opacity: canDownload ? 1 : 0.45,
        cursor: canDownload ? 'pointer' : 'not-allowed',
        borderColor: canDownload ? 'var(--accent-primary)' : 'var(--border-strong)',
        color: canDownload ? 'var(--accent-primary)' : 'var(--text-muted)',
      }}
    >
      {horizontal ? <ArrowDown size={16} /> : <ArrowLeft size={16} />}
      Traer
    </button>
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
        gap: 10,
        padding: horizontal ? '10px 8px' : '12px 8px',
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

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: horizontal ? 'row' : 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {uploadButton}
        {downloadButton}
      </div>

      {/* Queue header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <Text
          size="xs"
          fw={700}
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-secondary)',
          }}
        >
          Cola
        </Text>
        <Text
          size="xs"
          fw={700}
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          {transfers.length > 0 ? `(${transfers.length})` : ''}
        </Text>
        <div style={{ flex: 1 }} />
        {completedCount > 0 && onClear && (
          <Tooltip label="Limpiar completadas" withArrow position="top">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              onClick={onClear}
              aria-label="Limpiar completadas"
            >
              <Trash2 size={12} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>

      {/* Queue */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: horizontal ? 'row' : 'column',
          gap: 6,
        }}
      >
        {transfers.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 8px',
              textAlign: 'center',
              flex: 1,
            }}
          >
            <Text size="xs" c="dimmed" style={{ fontSize: 11 }}>
              Selecciona un archivo y usa las flechas
            </Text>
          </div>
        ) : (
          transfers.map((t) => {
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

            return (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border-subtle)',
                  background: 'var(--surface-1)',
                  opacity: isDone || t.status === 'cancelled' ? 0.65 : 1,
                  minWidth: horizontal ? 160 : undefined,
                  flexShrink: horizontal ? 0 : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                  <Text
                    size="xs"
                    truncate
                    title={fileName}
                    style={{ flex: 1, minWidth: 0, fontSize: 11 }}
                  >
                    {fileName}
                  </Text>
                  {isDone ? (
                    <Check size={12} color="var(--success)" aria-label="Completado" />
                  ) : (
                    <Tooltip label="Cancelar" withArrow position="left" disabled={!isRunning}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={() => onCancel(t.id)}
                        disabled={!isRunning}
                        aria-label={`Cancelar transferencia de ${fileName}`}
                      >
                        <X size={11} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </div>

                {/* Progress bar (flat, no gradient) */}
                <div
                  style={{
                    width: '100%',
                    height: 5,
                    borderRadius: 3,
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

                {isRunning && (formatSpeed(t.speedBps) || formatEta(t.etaSeconds)) && (
                  <Text
                    size="xs"
                    style={{
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatSpeed(t.speedBps) && (
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                        {formatSpeed(t.speedBps)}
                      </span>
                    )}
                    {formatEta(t.etaSeconds) && (
                      <span style={{ marginLeft: 6 }}>ETA {formatEta(t.etaSeconds)}</span>
                    )}
                  </Text>
                )}

                {isError && t.message && (
                  <Text size="xs" style={{ fontSize: 9, color: 'var(--danger)' }}>
                    {t.message}
                  </Text>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

TransferBridge.displayName = 'TransferBridge'

export default React.memo(TransferBridge)
