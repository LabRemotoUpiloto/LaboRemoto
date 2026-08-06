import React, { useCallback, useMemo } from 'react'
import AddressBar from './AddressBar'
import FilePanelToolbar from './FilePanelToolbar'
import FileList from './FileList'
import StatusBar from './StatusBar'
import type { SftpEntry, LocalEntry } from '../../types'

type FileEntry = SftpEntry | LocalEntry

export interface FilePanelProps {
  side: 'local' | 'remote'
  active: boolean
  onClick: () => void

  // Path & navigation
  path: string
  onNavigate: (path: string) => void
  onBack: () => void
  canGoBack: boolean

  // Data
  entries: FileEntry[]
  loading: boolean
  error?: string

  // Selection (multi)
  selectedPaths: Set<string>
  lastSelected?: string
  onSelectOnly: (path: string) => void
  onToggleSelect: (path: string) => void
  onSelectRange: (anchor: string, to: string, orderedPaths: string[]) => void
  onClearSelection: () => void

  // Sorting
  sortKey: string
  sortDir: 'asc' | 'desc'
  onSort: (key: string) => void

  // Filter
  filter: string
  onFilterChange: (value: string) => void

  // Address bar
  rootLabel: string
  addressPrefix?: string

  // Toolbar - shared
  onRefresh: () => void

  // Toolbar - local only
  drives?: string[]
  currentDrive?: string
  onDriveChange?: (drive: string) => void
  onUpload?: () => void
  canUpload?: boolean

  // Toolbar - remote only
  sessions?: string[]
  sessionId?: string
  sessionsMeta?: Record<string, { label: string }>
  onSessionChange?: (id: string | undefined) => void
  onNewFolder?: () => void
  onRename?: () => void
  canRename?: boolean
  onDelete?: () => void
  canDelete?: boolean
  onDownload?: () => void
  canDownload?: boolean
  disabled?: boolean

  // Doble clic (o Enter) sobre un archivo (no carpeta): abre con la app
  // predeterminada (local) o descarga-y-abre (remoto).
  onOpenFile?: (entry: FileEntry) => void

  // Context menu
  onContextMenu: (entry: FileEntry, event: React.MouseEvent) => void

  // Entry path resolver
  getEntryPath: (entry: FileEntry) => string

  // Drag & drop interno por puntero: inicia un arrastre desde una fila ya
  // seleccionada (ver usePointerDrag en SftpPage).
  onRowPointerDown?: (entry: FileEntry, e: React.MouseEvent) => void
  consumeSuppressedClick?: () => boolean

  // Resalta el panel como destino válido de un drop en curso (arrastre
  // interno por puntero o drop nativo de archivos del explorador de Windows).
  forceDragOver?: boolean
}

const FilePanel: React.FC<FilePanelProps> = ({
  side,
  active,
  onClick,
  path,
  onNavigate,
  onBack,
  canGoBack,
  entries,
  loading,
  error,
  selectedPaths,
  lastSelected,
  onSelectOnly,
  onToggleSelect,
  onSelectRange,
  onClearSelection,
  sortKey,
  sortDir,
  onSort,
  filter,
  onFilterChange,
  rootLabel,
  addressPrefix,
  onRefresh,
  drives,
  currentDrive,
  onDriveChange,
  onUpload,
  canUpload,
  sessions,
  sessionId,
  sessionsMeta,
  onSessionChange,
  onNewFolder,
  onRename,
  canRename,
  onDelete,
  canDelete,
  onDownload,
  canDownload,
  disabled,
  onContextMenu,
  getEntryPath,
  onRowPointerDown,
  consumeSuppressedClick,
  forceDragOver,
  onOpenFile,
}) => {
  const handleOpen = useCallback(
    (entry: FileEntry) => {
      if (entry.kind === 'dir') {
        onNavigate(getEntryPath(entry))
      } else {
        onOpenFile?.(entry)
      }
    },
    [onNavigate, getEntryPath, onOpenFile]
  )

  const selectedEntries = useMemo(() => {
    if (selectedPaths.size === 0) return []
    return entries.filter((e) => selectedPaths.has(getEntryPath(e)))
  }, [entries, selectedPaths, getEntryPath])

  const totalSize = useMemo(
    () => entries.reduce((sum, e) => sum + (e.kind === 'dir' ? 0 : e.size || 0), 0),
    [entries]
  )

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        borderRadius: 'var(--mantine-radius-md)',
        border: forceDragOver
          ? '2px solid var(--accent-primary)'
          : active
            ? '1px solid var(--accent-primary)'
            : '1px solid var(--border-subtle)',
        background: forceDragOver ? 'var(--accent-primary-subtle)' : 'var(--surface-1)',
        overflow: 'hidden',
        boxShadow: active
          ? '0 0 0 1px rgba(16,185,129,0.15), 0 2px 8px rgba(0,0,0,0.15)'
          : '0 1px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
      }}
    >
      {/* Address bar */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          flexShrink: 0,
        }}
      >
        <AddressBar
          rootLabel={rootLabel}
          path={path}
          onNavigate={onNavigate}
          onBack={onBack}
          canGoBack={canGoBack}
          prefix={addressPrefix}
        />
      </div>

      {/* Toolbar */}
      <FilePanelToolbar
        side={side}
        drives={drives}
        currentDrive={currentDrive}
        onDriveChange={onDriveChange}
        sessions={sessions}
        sessionId={sessionId}
        sessionsMeta={sessionsMeta}
        onSessionChange={onSessionChange}
        onRefresh={onRefresh}
        onNewFolder={onNewFolder}
        onRename={onRename}
        canRename={canRename}
        onUpload={onUpload}
        onDownload={onDownload}
        onDelete={onDelete}
        canUpload={canUpload}
        canDownload={canDownload}
        canDelete={canDelete}
        disabled={disabled}
        filter={filter}
        onFilterChange={onFilterChange}
        selectedCount={selectedPaths.size}
      />

      {/* File list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <FileList
          entries={entries}
          loading={loading}
          error={error}
          selectedPaths={selectedPaths}
          lastSelected={lastSelected}
          onSelectOnly={onSelectOnly}
          onToggleSelect={onToggleSelect}
          onSelectRange={onSelectRange}
          onClearSelection={onClearSelection}
          onOpen={handleOpen}
          onContextMenu={onContextMenu}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          emptyMessage={
            side === 'local' ? 'No hay archivos locales' : 'No hay archivos remotos'
          }
          isRemote={side === 'remote'}
          getEntryPath={getEntryPath}
          onRowPointerDown={onRowPointerDown}
          consumeSuppressedClick={consumeSuppressedClick}
        />
      </div>

      {/* Status bar */}
      <StatusBar
        totalItems={entries.length}
        totalSize={totalSize}
        selectedEntries={selectedEntries}
        side={side}
      />
    </div>
  )
}

export default FilePanel
