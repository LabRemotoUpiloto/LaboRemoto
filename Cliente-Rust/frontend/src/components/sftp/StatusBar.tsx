import React from 'react'
import { Group, Text } from '@mantine/core'
import { formatBytes } from '../shared/fileFormatters'
import type { SftpEntry, LocalEntry } from '../../types'

type FileEntry = SftpEntry | LocalEntry

export interface StatusBarProps {
  totalItems: number
  totalSize: number
  selectedEntries: FileEntry[]
  side: 'local' | 'remote'
}

const StatusBar: React.FC<StatusBarProps> = ({ totalItems, totalSize, selectedEntries, side }) => {
  const hasSelection = selectedEntries.length > 0
  const selectedSize = hasSelection
    ? selectedEntries.reduce((sum, e) => sum + (e.kind === 'dir' ? 0 : e.size || 0), 0)
    : 0

  return (
    <Group
      gap="md"
      px="sm"
      py={3}
      wrap="nowrap"
      style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        minHeight: 24,
        flexShrink: 0,
      }}
    >
      {hasSelection ? (
        <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {selectedEntries.length} seleccionado{selectedEntries.length !== 1 ? 's' : ''}
          {' — '}
          {formatBytes(selectedSize)}
        </Text>
      ) : (
        <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {totalItems} elemento{totalItems !== 1 ? 's' : ''}
          {' — '}
          {formatBytes(totalSize)} total
        </Text>
      )}

      {hasSelection && selectedEntries.length === 1 && (
        <>
          <div
            style={{
              width: 1,
              height: 12,
              background: 'var(--border-subtle)',
              flexShrink: 0,
            }}
          />
          <Text
            size="xs"
            c="dimmed"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
            title={selectedEntries[0].name}
          >
            {selectedEntries[0].name}
          </Text>
        </>
      )}

      <Text
        size="xs"
        c="dimmed"
        style={{ marginLeft: 'auto', flexShrink: 0, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.04em' }}
      >
        {side === 'local' ? 'Local' : 'Remoto'}
      </Text>
    </Group>
  )
}

StatusBar.displayName = 'StatusBar'

export default React.memo(StatusBar)
