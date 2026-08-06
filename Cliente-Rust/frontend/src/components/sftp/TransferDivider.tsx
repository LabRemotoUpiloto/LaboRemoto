import React, { useCallback } from 'react'
import { Tooltip } from '@mantine/core'
import { ArrowRight, ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react'

export interface TransferDividerProps {
  /** true = paneles lado a lado (divisor vertical); false = paneles apilados (franja horizontal). */
  vertical: boolean
  onUpload: () => void
  canUpload: boolean
  uploadCount?: number
  onDownload: () => void
  canDownload: boolean
  downloadCount?: number
}

const dividerButtonBaseStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  padding: '8px 4px',
  borderRadius: 6,
  border: '1.5px solid var(--border-strong)',
  background: 'var(--surface-2)',
  cursor: 'pointer',
  boxShadow: '2px 2px 0 var(--border-strong)',
  transition: 'transform 0.1s, box-shadow 0.1s, background 0.15s, border-color 0.15s',
}

/**
 * Divisor delgado entre los paneles local/remoto: solo dos botones compactos
 * apilados (enviar / traer). Reemplaza al antiguo TransferBridge, que además
 * alojaba la cola de transferencias (ahora en TransferQueue, panel inferior).
 */
const TransferDivider: React.FC<TransferDividerProps> = ({
  vertical,
  onUpload,
  canUpload,
  uploadCount,
  onDownload,
  canDownload,
  downloadCount,
}) => {
  const handleEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>, enabled: boolean) => {
    if (!enabled) return
    e.currentTarget.style.transform = 'translateY(-1px)'
    e.currentTarget.style.boxShadow = '3px 3px 0 var(--accent-primary)'
    e.currentTarget.style.borderColor = 'var(--accent-primary)'
  }, [])

  const handleLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>, enabled: boolean) => {
    if (!enabled) return
    e.currentTarget.style.transform = 'none'
    e.currentTarget.style.boxShadow = '2px 2px 0 var(--border-strong)'
    e.currentTarget.style.borderColor = 'var(--border-strong)'
  }, [])

  const handleDown = useCallback((e: React.MouseEvent<HTMLButtonElement>, enabled: boolean) => {
    if (!enabled) return
    e.currentTarget.style.transform = 'translateY(1px)'
    e.currentTarget.style.boxShadow = '1px 1px 0 var(--accent-primary)'
  }, [])

  const uploadIcon = vertical ? <ArrowRight size={16} /> : <ArrowUp size={16} />
  const downloadIcon = vertical ? <ArrowLeft size={16} /> : <ArrowDown size={16} />

  const uploadButton = (
    <Tooltip label="Enviar al laboratorio" withArrow position={vertical ? 'right' : 'top'}>
      <button
        type="button"
        onClick={onUpload}
        disabled={!canUpload}
        aria-label={uploadCount ? `Enviar ${uploadCount} elementos al laboratorio` : 'Enviar al laboratorio'}
        onMouseEnter={(e) => handleEnter(e, canUpload)}
        onMouseLeave={(e) => handleLeave(e, canUpload)}
        onMouseDown={(e) => handleDown(e, canUpload)}
        onMouseUp={(e) => handleEnter(e, canUpload)}
        style={{
          ...dividerButtonBaseStyle,
          opacity: canUpload ? 1 : 0.45,
          cursor: canUpload ? 'pointer' : 'not-allowed',
          borderColor: canUpload ? 'var(--accent-primary)' : 'var(--border-strong)',
          color: canUpload ? 'var(--accent-primary)' : 'var(--text-muted)',
        }}
      >
        {uploadIcon}
        {!!uploadCount && uploadCount > 1 && (
          <span style={{ fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{uploadCount}</span>
        )}
      </button>
    </Tooltip>
  )

  const downloadButton = (
    <Tooltip label="Traer a tu equipo" withArrow position={vertical ? 'right' : 'top'}>
      <button
        type="button"
        onClick={onDownload}
        disabled={!canDownload}
        aria-label={downloadCount ? `Traer ${downloadCount} elementos a tu equipo` : 'Traer a tu equipo'}
        onMouseEnter={(e) => handleEnter(e, canDownload)}
        onMouseLeave={(e) => handleLeave(e, canDownload)}
        onMouseDown={(e) => handleDown(e, canDownload)}
        onMouseUp={(e) => handleEnter(e, canDownload)}
        style={{
          ...dividerButtonBaseStyle,
          opacity: canDownload ? 1 : 0.45,
          cursor: canDownload ? 'pointer' : 'not-allowed',
          borderColor: canDownload ? 'var(--accent-primary)' : 'var(--border-strong)',
          color: canDownload ? 'var(--accent-primary)' : 'var(--text-muted)',
        }}
      >
        {downloadIcon}
        {!!downloadCount && downloadCount > 1 && (
          <span style={{ fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{downloadCount}</span>
        )}
      </button>
    </Tooltip>
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flexShrink: 0,
        width: vertical ? 44 : '100%',
        height: vertical ? '100%' : 44,
        padding: 4,
      }}
    >
      {uploadButton}
      {downloadButton}
    </div>
  )
}

TransferDivider.displayName = 'TransferDivider'

export default React.memo(TransferDivider)
