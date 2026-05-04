import React, { useMemo, useState, useCallback } from 'react'
import { ActionIcon, Group, TextInput, Tooltip } from '@mantine/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Crumb {
  name: string
  full: string
}

export interface AddressBarProps {
  rootLabel: string
  path: string
  onNavigate: (path: string) => void
  onBack?: () => void
  canGoBack?: boolean
  prefix?: string
}

const AddressBar: React.FC<AddressBarProps> = ({
  rootLabel,
  path,
  onNavigate,
  onBack,
  canGoBack = false,
  prefix,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const segments = useMemo(() => {
    const normalized = path.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    let accumulated = prefix ?? (normalized.startsWith('/') ? '/' : '')
    const crumbs: Crumb[] = []

    if (accumulated === '/') {
      crumbs.push({ name: '/', full: '/' })
    }

    for (const part of parts) {
      accumulated = accumulated
        ? accumulated.endsWith('/')
          ? accumulated + part
          : accumulated + '/' + part
        : part
      crumbs.push({ name: part, full: accumulated })
    }

    return crumbs
  }, [path, prefix])

  const displaySegments = useMemo(() => {
    if (segments.length > 6) {
      return [
        segments[0],
        segments[1],
        { name: '\u2026', full: '__ellipsis__' },
        segments[segments.length - 2],
        segments[segments.length - 1],
      ]
    }
    return segments
  }, [segments])

  const handleStartEdit = useCallback(() => {
    setEditValue(path)
    setIsEditing(true)
  }, [path])

  const handleEditSubmit = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== path) {
      onNavigate(trimmed)
    }
    setIsEditing(false)
  }, [editValue, path, onNavigate])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleEditSubmit()
      if (e.key === 'Escape') setIsEditing(false)
    },
    [handleEditSubmit]
  )

  return (
    <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
      <Tooltip label="Atrás" withArrow position="bottom">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Atrás"
        >
          <ChevronLeft size={16} />
        </ActionIcon>
      </Tooltip>

      {isEditing ? (
        <TextInput
          size="xs"
          value={editValue}
          onChange={(e) => setEditValue(e.currentTarget.value)}
          onBlur={handleEditSubmit}
          onKeyDown={handleEditKeyDown}
          autoFocus
          styles={{
            input: {
              fontFamily: 'monospace',
              fontSize: 12,
              backgroundColor: 'var(--surface-2)',
              borderColor: 'var(--accent-secondary)',
            },
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <Group
          gap={0}
          wrap="nowrap"
          onDoubleClick={handleStartEdit}
          title={path}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '3px 8px',
            borderRadius: 'var(--mantine-radius-sm)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-2)',
            cursor: 'text',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              paddingRight: 6,
            }}
          >
            {rootLabel}
          </span>
          <ChevronRight size={12} style={{ opacity: 0.4, flexShrink: 0 }} />

          <Group gap={0} wrap="nowrap" style={{ overflow: 'hidden', flex: 1 }}>
            {displaySegments.map((crumb, i) => {
              const isLast = i === displaySegments.length - 1
              return (
                <React.Fragment key={crumb.full + ':' + i}>
                  {crumb.full === '__ellipsis__' ? (
                    <span style={{ padding: '0 4px', opacity: 0.5, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {'\u2026'}
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onNavigate(crumb.full)
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '1px 4px',
                        borderRadius: 3,
                        fontSize: 12,
                        fontWeight: isLast ? 600 : 400,
                        color: isLast ? 'var(--accent-primary)' : 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        ;(e.target as HTMLElement).style.background = 'var(--interactive-hover)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.target as HTMLElement).style.background = 'none'
                      }}
                      title={crumb.full}
                    >
                      {crumb.name}
                    </button>
                  )}
                  {!isLast && (
                    <ChevronRight
                      size={10}
                      style={{ opacity: 0.35, flexShrink: 0, color: 'var(--text-secondary)' }}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </Group>
        </Group>
      )}
    </Group>
  )
}

export default AddressBar
