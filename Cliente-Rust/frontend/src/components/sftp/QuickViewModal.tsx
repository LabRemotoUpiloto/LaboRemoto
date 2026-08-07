import React from 'react'
import { Modal, Text, Button, Group } from '@mantine/core'

type Props = {
  open: boolean
  fileName: string
  content: string
  truncated: boolean
  onClose: () => void
}

/** Modal de "Vista rápida" para archivos de texto remotos (sftp_read_text). */
export default function QuickViewModal({ open, fileName, content, truncated, onClose }: Props) {
  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={fileName}
      centered
      size="lg"
      overlayProps={{ blur: 3 }}
      styles={{
        content: { border: '1.5px solid var(--border-strong)' },
      }}
    >
      {truncated && (
        <Text size="xs" c="dimmed" mb="sm">
          Archivo truncado a 256 KB
        </Text>
      )}
      <pre
        style={{
          margin: 0,
          maxHeight: '70vh',
          overflow: 'auto',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12.5,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          padding: 10,
          borderRadius: 6,
          border: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          color: 'var(--text-primary)',
        }}
      >
        {content}
      </pre>
      <Group justify="flex-end" mt="lg">
        <Button variant="subtle" color="gray" onClick={onClose}>
          Cerrar
        </Button>
      </Group>
    </Modal>
  )
}
