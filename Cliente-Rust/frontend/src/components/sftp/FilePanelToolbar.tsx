import React from 'react'
import { Group, Select, Text, TextInput, Tooltip } from '@mantine/core'
import {
  RefreshCw,
  FolderPlus,
  Pencil,
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
  onRename?: () => void
  canRename?: boolean
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

  // Selección múltiple: cuántos elementos están seleccionados en este panel.
  selectedCount?: number
}

// Botón compacto con icono (14-16px) y tooltip
const toolbarButtonBaseStyle: React.CSSProperties = {
  all: 'unset',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '4px 6px',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 0.1s, color 0.1s',
}

interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  hideLabel?: boolean
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, label, onClick, disabled, danger, hideLabel = true }) => (
  <Tooltip label={label} withArrow position="bottom" openDelay={150}>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        ...toolbarButtonBaseStyle,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--text-muted)' : danger ? 'var(--danger)' : 'var(--text-primary)',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = 'var(--interactive-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {icon}
      {!hideLabel && <span>{label}</span>}
    </button>
  </Tooltip>
)

const ToolbarSeparator: React.FC = () => (
  <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', flexShrink: 0 }} />
)

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
  onRename,
  canRename,
  onUpload,
  onDownload,
  onDelete,
  canUpload,
  canDownload,
  canDelete,
  disabled,
  filter,
  onFilterChange,
  selectedCount,
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
        minHeight: 34,
        flexShrink: 0,
      }}
    >
      {/* Action buttons de icono con tooltip */}
      <Group gap={2} wrap="nowrap">
        {onNewFolder && (
          <ToolbarButton icon={<FolderPlus size={14} />} label="Nueva carpeta" onClick={onNewFolder} disabled={disabled} />
        )}

        {onRename && (
          <ToolbarButton icon={<Pencil size={14} />} label="Renombrar" onClick={onRename} disabled={!canRename} />
        )}

        {onDelete && (
          <ToolbarButton icon={<Trash2 size={14} />} label="Eliminar" onClick={onDelete} disabled={!canDelete} danger />
        )}

        <ToolbarButton icon={<RefreshCw size={14} />} label="Actualizar" onClick={onRefresh} disabled={disabled} />
      </Group>

      <ToolbarSeparator />

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

      {/* Selection count */}
      {!!selectedCount && selectedCount > 1 && (
        <Text
          size="xs"
          fw={700}
          style={{
            fontSize: 10,
            color: 'var(--accent-primary)',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {selectedCount} sel.
        </Text>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search */}
      <TextInput
        size="xs"
        placeholder="Buscar..."
        leftSection={<Search size={12} />}
        rightSection={
          filter ? (
            <button
              type="button"
              onClick={() => onFilterChange('')}
              aria-label="Limpiar búsqueda"
              style={{ all: 'unset', display: 'flex', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <X size={12} />
            </button>
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
