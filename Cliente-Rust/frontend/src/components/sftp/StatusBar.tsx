import React from 'react'
import { Group, Text } from '@mantine/core'
import { formatBytes } from '../shared/fileFormatters'
import type { SftpEntry, LocalEntry } from '../../types'

type FileEntry = SftpEntry | LocalEntry

export interface StatusBarProps {
  totalItems: number
  selectedEntry?: FileEntry
  side: 'local' | 'remote'
}

const StatusBar: React.FC<StatusBarProps> = ({ totalItems, selectedEntry, side }) => {
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
      <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {totalItems} elemento{totalItems !== 1 ? 's' : ''}
      </Text>

      {selectedEntry && (
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
            title={selectedEntry.name}
          >
            {selectedEntry.name}
            {selectedEntry.kind !== 'dir' && selectedEntry.size != null && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                {formatBytes(selectedEntry.size)}
              </span>
            )}
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

export default StatusBar
