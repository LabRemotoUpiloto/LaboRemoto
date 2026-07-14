import React, { useCallback } from 'react'
import { Loader, Text, ScrollArea } from '@mantine/core'
import { AlertTriangle, FolderOpen } from 'lucide-react'
import FileIcon from '../shared/FileIcon'
import { formatDate, formatBytes } from '../shared/fileFormatters'
import type { SftpEntry, LocalEntry } from '../../types'

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
  selectedPath?: string
  onSelect: (path: string | undefined) => void
  onOpen: (entry: FileEntry) => void
  onContextMenu: (entry: FileEntry, event: React.MouseEvent) => void
  sortKey: string
  sortDir: 'asc' | 'desc'
  onSort: (key: string) => void
  emptyMessage?: string
  isRemote?: boolean
  getEntryPath: (entry: FileEntry) => string
}

const COLUMNS = [
  { key: 'name', label: 'Nombre', sortable: true },
  { key: 'mtime', label: 'Modificado', sortable: true },
  { key: 'size', label: 'Tamaño', sortable: true, align: 'right' as const },
  { key: 'kind', label: 'Tipo', sortable: true },
]

const FileList: React.FC<FileListProps> = ({
  entries,
  loading,
  error,
  selectedPath,
  onSelect,
  onOpen,
  onContextMenu,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = 'No hay archivos',
  isRemote = false,
  getEntryPath,
}) => {
  const handleRowClick = useCallback(
    (entry: FileEntry) => {
      onSelect(getEntryPath(entry))
    },
    [onSelect, getEntryPath]
  )

  const handleRowDoubleClick = useCallback(
    (entry: FileEntry) => {
      if (entry.kind === 'dir') {
        onOpen(entry)
      }
    },
    [onOpen]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, entry: FileEntry) => {
      if (e.key === 'Enter') {
        if (entry.kind === 'dir') onOpen(entry)
      }
    },
    [onOpen]
  )

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onSelect(undefined)
      }
    },
    [onSelect]
  )

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
    <ScrollArea style={{ flex: 1 }} scrollbarSize={6} onClick={handleContainerClick} aria-busy={false}>
      <span aria-live="polite" style={visuallyHiddenStyle}>
        {statusMessage}
      </span>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
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
              else if (idx === 1) width = '170px'
              else if (idx === 2) width = '90px'
              else if (idx === 3) width = '80px'

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
          {entries.map((entry) => {
            const entryPath = getEntryPath(entry)
            const isSelected = selectedPath === entryPath

            return (
              <tr
                key={entryPath}
                role="row"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  handleRowClick(entry)
                }}
                onDoubleClick={() => handleRowDoubleClick(entry)}
                onKeyDown={(e) => handleKeyDown(e, entry)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onSelect(entryPath)
                  onContextMenu(entry, e)
                }}
                style={{
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
                    padding: '6px 12px',
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

                {/* Modificado */}
                <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>
                  {formatDate(entry.mtime, isRemote)}
                </td>

                {/* Tamaño */}
                <td
                  style={{
                    padding: '6px 12px',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {entry.kind === 'dir' ? '' : formatBytes(entry.size)}
                </td>

                {/* Tipo */}
                <td style={{ padding: '6px 12px', color: 'var(--text-tertiary)' }}>
                  {entry.kind === 'dir' ? 'Carpeta' : 'Archivo'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </ScrollArea>
  )
}

FileList.displayName = 'FileList'

export default React.memo(FileList)
