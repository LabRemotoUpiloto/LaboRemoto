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

  // Selection
  selectedPath?: string
  onSelect: (path: string | undefined) => void

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
  onDelete?: () => void
  canDelete?: boolean
  onDownload?: () => void
  canDownload?: boolean
  disabled?: boolean

  // Context menu
  onContextMenu: (entry: FileEntry, event: React.MouseEvent) => void

  // Entry path resolver
  getEntryPath: (entry: FileEntry) => string
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
  selectedPath,
  onSelect,
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
  onDelete,
  canDelete,
  onDownload,
  canDownload,
  disabled,
  onContextMenu,
  getEntryPath,
}) => {
  const handleOpen = useCallback(
    (entry: FileEntry) => {
      if (entry.kind === 'dir') {
        onNavigate(getEntryPath(entry))
      }
    },
    [onNavigate, getEntryPath]
  )

  const selectedEntry = useMemo(() => {
    if (!selectedPath) return undefined
    return entries.find((e) => getEntryPath(e) === selectedPath)
  }, [entries, selectedPath, getEntryPath])

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
        border: active
          ? '1px solid var(--accent-primary)'
          : '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
        overflow: 'hidden',
        boxShadow: active
          ? '0 0 0 1px rgba(16,185,129,0.15), 0 2px 8px rgba(0,0,0,0.15)'
          : '0 1px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
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
        onUpload={onUpload}
        onDownload={onDownload}
        onDelete={onDelete}
        canUpload={canUpload}
        canDownload={canDownload}
        canDelete={canDelete}
        disabled={disabled}
        filter={filter}
        onFilterChange={onFilterChange}
      />

      {/* File list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <FileList
          entries={entries}
          loading={loading}
          error={error}
          selectedPath={selectedPath}
          onSelect={onSelect}
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
        />
      </div>

      {/* Status bar */}
      <StatusBar
        totalItems={entries.length}
        selectedEntry={selectedEntry}
        side={side}
      />
    </div>
  )
}

export default FilePanel
