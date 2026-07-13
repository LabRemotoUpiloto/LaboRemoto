import React from 'react'
import { ActionIcon, Group, Select, TextInput, Tooltip } from '@mantine/core'
import {
  RefreshCw,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Search,
  X,
} from 'lucide-react'

export interface FilePanelToolbarProps {
  side: 'local' | 'remote'

  // Drive selector (local only)
  drives?: string[]
  currentDrive?: string
  onDriveChange?: (drive: string) => void

  // Session selector (remote only)
  sessions?: string[]
  sessionId?: string
  sessionsMeta?: Record<string, { label: string }>
  onSessionChange?: (id: string | undefined) => void

  // Actions
  onRefresh: () => void
  onNewFolder?: () => void
  onUpload?: () => void
  onDownload?: () => void
  onDelete?: () => void
  canUpload?: boolean
  canDownload?: boolean
  canDelete?: boolean
  disabled?: boolean

  // Filter
  filter: string
  onFilterChange: (value: string) => void
}

const FilePanelToolbar: React.FC<FilePanelToolbarProps> = ({
  side,
  drives,
  currentDrive,
  onDriveChange,
  sessions,
  sessionId,
  sessionsMeta,
  onSessionChange,
  onRefresh,
  onNewFolder,
  onUpload,
  onDownload,
  onDelete,
  canUpload,
  canDownload,
  canDelete,
  disabled,
  filter,
  onFilterChange,
}) => {
  const sessionOptions = (sessions || []).map((id) => ({
    value: id,
    label: sessionsMeta?.[id]?.label || id,
  }))

  const driveOptions = (drives || []).map((d) => ({
    value: d,
    label: d,
  }))

  return (
    <Group
      gap={6}
      wrap="nowrap"
      px="xs"
      py={5}
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        minHeight: 36,
        flexShrink: 0,
      }}
    >
      {/* Drive / Session selector */}
      {side === 'local' && drives && drives.length > 0 && (
        <Select
          size="xs"
          data={driveOptions}
          value={currentDrive || ''}
          onChange={(v) => onDriveChange?.(v || '')}
          placeholder="Unidad"
          allowDeselect={false}
          w={90}
          styles={{ input: { fontSize: 12 } }}
        />
      )}

      {side === 'remote' && (
        <Select
          size="xs"
          data={sessionOptions}
          value={sessionId || ''}
          onChange={(v) => onSessionChange?.(v || undefined)}
          placeholder="Sesión"
          allowDeselect={false}
          w={120}
          styles={{ input: { fontSize: 12 } }}
        />
      )}



      {/* Separator */}
      <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', flexShrink: 0 }} />

      {/* Action buttons */}
      <Group gap={2} wrap="nowrap">
        <Tooltip label="Actualizar" withArrow position="bottom">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onRefresh}
            disabled={disabled}
            aria-label="Actualizar"
          >
            <RefreshCw size={14} />
          </ActionIcon>
        </Tooltip>

        {side === 'remote' && onNewFolder && (
          <Tooltip label="Nueva carpeta" withArrow position="bottom">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={onNewFolder}
              disabled={disabled}
              aria-label="Nueva carpeta"
            >
              <FolderPlus size={14} />
            </ActionIcon>
          </Tooltip>
        )}

        {side === 'remote' && onDelete && (
          <Tooltip label="Eliminar" withArrow position="bottom">
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={onDelete}
              disabled={!canDelete}
              aria-label="Eliminar"
            >
              <Trash2 size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Transfer action */}
      {side === 'local' && onUpload && (
        <Tooltip label="Subir al servidor" withArrow position="bottom">
          <ActionIcon
            variant="filled"
            color="teal"
            size="sm"
            onClick={onUpload}
            disabled={!canUpload}
            aria-label="Subir"
          >
            <Upload size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      {side === 'remote' && onDownload && (
        <Tooltip label="Descargar a local" withArrow position="bottom">
          <ActionIcon
            variant="filled"
            color="blue"
            size="sm"
            onClick={onDownload}
            disabled={!canDownload}
            aria-label="Descargar"
          >
            <Download size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      {/* Search */}
      <TextInput
        size="xs"
        placeholder="Buscar..."
        leftSection={<Search size={12} />}
        rightSection={
          filter ? (
            <ActionIcon
              variant="transparent"
              color="gray"
              size="xs"
              onClick={() => onFilterChange('')}
            >
              <X size={12} />
            </ActionIcon>
          ) : null
        }
        value={filter}
        onChange={(e) => onFilterChange(e.currentTarget.value)}
        disabled={disabled}
        w={150}
        styles={{
          input: { fontSize: 12 },
        }}
      />
    </Group>
  )
}

FilePanelToolbar.displayName = 'FilePanelToolbar'

export default React.memo(FilePanelToolbar)
