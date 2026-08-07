import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader, Text, ScrollArea } from '@mantine/core'
import { AlertTriangle, FolderOpen } from 'lucide-react'
import FileIcon from '../shared/FileIcon'
import { formatDate, formatBytes } from '../shared/fileFormatters'
import type { SftpEntry, LocalEntry } from '../../types'

// Altura fija de fila usada para el windowing manual (virtualización simple).
const ROW_HEIGHT = 28
// Filas extra renderizadas por encima/debajo del viewport visible, para evitar
// parpadeos al hacer scroll rápido.
const OVERSCAN = 8

// Oculta visualmente el contenido mientras lo mantiene disponible para lectores de pantalla.
const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

type FileEntry = SftpEntry | LocalEntry

export interface FileListProps {
  entries: FileEntry[]
  loading: boolean
  error?: string
  selectedPaths: Set<string>
  /** Ancla (último elemento seleccionado) usada para calcular rangos con Shift+clic. */
  lastSelected?: string
  onSelectOnly: (path: string) => void
  onToggleSelect: (path: string) => void
  onSelectRange: (anchor: string, to: string, orderedPaths: string[]) => void
  onClearSelection: () => void
  onOpen: (entry: FileEntry) => void
  onContextMenu: (entry: FileEntry, event: React.MouseEvent) => void
  sortKey: string
  sortDir: 'asc' | 'desc'
  onSort: (key: string) => void
  emptyMessage?: string
  isRemote?: boolean
  getEntryPath: (entry: FileEntry) => string
  /** Inicia un arrastre por puntero (drag & drop interno) desde una fila ya seleccionada. */
  onRowPointerDown?: (entry: FileEntry, e: React.MouseEvent) => void
  /** Consulta (y consume) si el próximo click debe ignorarse por venir de un arrastre. */
  consumeSuppressedClick?: () => boolean
}

const COLUMNS = [
  { key: 'name', label: 'Nombre', sortable: true },
  { key: 'size', label: 'Tamaño', sortable: true, align: 'right' as const },
  { key: 'mtime', label: 'Modificado', sortable: true },
  { key: 'kind', label: 'Tipo', sortable: true },
]

const FileList: React.FC<FileListProps> = ({
  entries,
  loading,
  error,
  selectedPaths,
  lastSelected,
  onSelectOnly,
  onToggleSelect,
  onSelectRange,
  onClearSelection,
  onOpen,
  onContextMenu,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = 'No hay archivos',
  isRemote = false,
  getEntryPath,
  onRowPointerDown,
  consumeSuppressedClick,
}) => {
  const handleRowClick = useCallback(
    (entry: FileEntry, e: React.MouseEvent) => {
      // Un click que llega justo tras soltar un arrastre por puntero no debe
      // alterar la selección (evita colapsarla a un solo elemento).
      if (consumeSuppressedClick?.()) return
      const entryPath = getEntryPath(entry)
      if (e.shiftKey && lastSelected) {
        const ordered = entries.map(getEntryPath)
        onSelectRange(lastSelected, entryPath, ordered)
      } else if (e.ctrlKey || e.metaKey) {
        onToggleSelect(entryPath)
      } else {
        onSelectOnly(entryPath)
      }
    },
    [consumeSuppressedClick, getEntryPath, lastSelected, entries, onSelectRange, onToggleSelect, onSelectOnly]
  )

  const handleRowDoubleClick = useCallback(
    (entry: FileEntry) => {
      onOpen(entry)
    },
    [onOpen]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, entry: FileEntry) => {
      if (e.key === 'Enter') {
        onOpen(entry)
      }
    },
    [onOpen]
  )

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClearSelection()
      }
    },
    [onClearSelection]
  )

  const handleRowPointerDown = useCallback(
    (entry: FileEntry, e: React.MouseEvent) => {
      if (!onRowPointerDown) return
      const entryPath = getEntryPath(entry)
      // El arrastre por puntero solo comienza sobre una fila ya seleccionada
      // (arrastrar toda la selección actual); si no está seleccionada, el
      // mousedown se deja pasar para que el click normal la seleccione.
      if (!selectedPaths.has(entryPath)) return
      onRowPointerDown(entry, e)
    },
    [onRowPointerDown, getEntryPath, selectedPaths]
  )

  // ── Windowing manual (virtualización simple, filas de altura fija) ────────
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const viewportElRef = useRef<HTMLDivElement | null>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)

  const setViewportRef = useCallback((el: HTMLDivElement | null) => {
    viewportElRef.current = el
    if (resizeObsRef.current) {
      resizeObsRef.current.disconnect()
      resizeObsRef.current = null
    }
    if (el) {
      setViewportHeight(el.clientHeight)
      const ro = new ResizeObserver((obsEntries) => {
        for (const obsEntry of obsEntries) setViewportHeight(obsEntry.contentRect.height)
      })
      ro.observe(el)
      resizeObsRef.current = ro
    }
  }, [])

  useEffect(() => () => resizeObsRef.current?.disconnect(), [])

  const handleScrollPositionChange = useCallback((pos: { x: number; y: number }) => {
    setScrollTop(pos.y)
  }, [])

  const { visibleEntries, topSpacer, bottomSpacer } = useMemo(() => {
    const total = entries.length
    if (viewportHeight <= 0) {
      // Antes de medir el viewport, renderiza todo para evitar parpadeos.
      return { visibleEntries: entries, topSpacer: 0, bottomSpacer: 0 }
    }
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const end = Math.min(total, start + visibleCount)
    return {
      visibleEntries: entries.slice(start, end),
      topSpacer: start * ROW_HEIGHT,
      bottomSpacer: (total - end) * ROW_HEIGHT,
    }
  }, [entries, scrollTop, viewportHeight])

  // Mensaje de estado para lectores de pantalla (anuncia carga, error y vacío).
  const statusMessage = error
    ? `Error: ${error}`
    : loading
      ? isRemote
        ? 'Cargando archivos remotos'
        : 'Cargando archivos locales'
      : entries.length === 0
        ? emptyMessage
        : `${entries.length} elemento${entries.length !== 1 ? 's' : ''} cargados`

  if (error) {
    return (
      <div aria-busy={false}>
        <span aria-live="polite" style={visuallyHiddenStyle}>
          {statusMessage}
        </span>
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '28px 16px',
            margin: 12,
            borderRadius: 10,
            background: 'var(--danger-bg)',
            border: '1.5px solid var(--danger-border)',
            color: 'var(--danger-text)',
          }}
        >
          <AlertTriangle size={20} strokeWidth={2} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Error
          </span>
          <Text size="xs" ta="center" style={{ color: 'inherit', maxWidth: 320 }}>
            {error}
          </Text>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div aria-busy="true">
        <span aria-live="polite" style={visuallyHiddenStyle}>
          {statusMessage}
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 16px',
            gap: 12,
          }}
        >
          <Loader size="sm" color="var(--accent-primary)" />
          <Text
            size="xs"
            style={{
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              fontSize: 10,
              letterSpacing: '0.06em',
              fontWeight: 600,
            }}
          >
            {isRemote ? 'Cargando archivos remotos' : 'Cargando archivos locales'}
          </Text>
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div aria-busy={false}>
        <span aria-live="polite" style={visuallyHiddenStyle}>
          {statusMessage}
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '44px 16px',
            margin: 12,
            borderRadius: 10,
            border: '1.5px dashed var(--border-subtle)',
          }}
        >
          <FolderOpen size={22} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
          <Text size="sm" style={{ color: 'var(--text-tertiary)' }}>
            {emptyMessage}
          </Text>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea
      style={{ flex: 1 }}
      scrollbarSize={6}
      onClick={handleContainerClick}
      aria-busy={false}
      viewportRef={setViewportRef}
      onScrollPositionChange={handleScrollPositionChange}
    >
      <span aria-live="polite" style={visuallyHiddenStyle}>
        {statusMessage}
      </span>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          tableLayout: 'fixed',
        }}
        role="grid"
      >
        <thead
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            background: 'var(--surface-1)',
            boxShadow: '0 1px 0 var(--border-subtle)',
          }}
        >
          <tr>
            {COLUMNS.map((col, idx) => {
              const isSorted = sortKey === col.key
              const arrow = isSorted ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''
              let width: string | undefined
              if (idx === 0) width = undefined // auto
              else if (idx === 1) width = '90px' // Tamaño
              else if (idx === 2) width = '150px' // Modificado
              else if (idx === 3) width = '80px' // Tipo

              return (
                <th
                  key={col.key}
                  style={{
                    textAlign: col.align || 'left',
                    fontWeight: 600,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-secondary)',
                    padding: 0,
                    width,
                    userSelect: 'none',
                  }}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => onSort(col.key)}
                      style={{
                        all: 'unset',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        width: '100%',
                        padding: '7px 12px',
                        cursor: 'pointer',
                        color: 'inherit',
                        transition: 'background 0.1s',
                        justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                      }}
                      onMouseEnter={(e) => {
                        ;(e.target as HTMLElement).style.background = 'var(--interactive-hover)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.target as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      {col.label}
                      {arrow && (
                        <span style={{ fontSize: 9, color: 'var(--accent-primary)' }}>{arrow}</span>
                      )}
                    </button>
                  ) : (
                    <span style={{ display: 'block', padding: '7px 12px' }}>{col.label}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {topSpacer > 0 && (
            <tr aria-hidden="true">
              <td colSpan={COLUMNS.length} style={{ padding: 0, border: 'none', height: topSpacer }} />
            </tr>
          )}
          {visibleEntries.map((entry) => {
            const entryPath = getEntryPath(entry)
            const isSelected = selectedPaths.has(entryPath)

            return (
              <tr
                key={entryPath}
                role="row"
                aria-selected={isSelected}
                tabIndex={0}
                onMouseDown={(e) => handleRowPointerDown(entry, e)}
                onClick={(e) => {
                  e.stopPropagation()
                  handleRowClick(entry, e)
                }}
                onDoubleClick={() => handleRowDoubleClick(entry)}
                onKeyDown={(e) => handleKeyDown(e, entry)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!selectedPaths.has(entryPath)) onSelectOnly(entryPath)
                  onContextMenu(entry, e)
                }}
                style={{
                  height: ROW_HEIGHT,
                  borderBottom: '1px solid var(--border-subtle)',
                  background: isSelected ? 'var(--table-row-selected)' : 'transparent',
                  cursor: 'default',
                  transition: 'background 0.1s',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--table-row-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected
                    ? 'var(--table-row-selected)'
                    : 'transparent'
                }}
                onFocus={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--table-row-hover)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = isSelected
                    ? 'var(--table-row-selected)'
                    : 'transparent'
                }}
              >
                {/* Nombre */}
                <td
                  style={{
                    padding: '5px 12px',
                    borderLeft: isSelected
                      ? '3px solid var(--accent-primary)'
                      : '3px solid transparent',
                    transition: 'border-color 0.1s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      <FileIcon name={entry.name} kind={entry.kind as any} size={18} />
                    </div>
                    <span
                      style={{
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-primary)',
                      }}
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                  </div>
                </td>

                {/* Tamaño */}
                <td
                  style={{
                    padding: '5px 12px',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {entry.kind === 'dir' ? '' : formatBytes(entry.size)}
                </td>

                {/* Modificado */}
                <td style={{ padding: '5px 12px', color: 'var(--text-secondary)' }}>
                  {formatDate(entry.mtime, isRemote)}
                </td>

                {/* Tipo */}
                <td style={{ padding: '5px 12px', color: 'var(--text-tertiary)' }}>
                  {entry.kind === 'dir' ? 'Carpeta' : 'Archivo'}
                </td>
              </tr>
            )
          })}
          {bottomSpacer > 0 && (
            <tr aria-hidden="true">
              <td colSpan={COLUMNS.length} style={{ padding: 0, border: 'none', height: bottomSpacer }} />
            </tr>
          )}
        </tbody>
      </table>
    </ScrollArea>
  )
}

FileList.displayName = 'FileList'

export default React.memo(FileList)
